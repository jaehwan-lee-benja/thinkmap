// RRULE 펼침 + instance override 머지.
//
// 클라이언트에서 펼친다 (SPEC §7.2). 주 단위 뷰는 7일치만 펼치므로 비용 작음.

import { RRule, rrulestr } from 'rrule'

/**
 * RRULE 문자열을 파싱해 RRule 인스턴스 반환. 실패 시 null.
 * dtstart 는 event.start_at 으로 주입 (RRULE 자체에 DTSTART 없어도 동작).
 */
export function parseRule(rruleStr, dtstart) {
  if (!rruleStr) return null
  try {
    // 'FREQ=...' 문자열만 들어와도 작동하도록 RRULE: 프리픽스 보강
    const normalized = rruleStr.startsWith('RRULE:') || rruleStr.startsWith('DTSTART:')
      ? rruleStr
      : `RRULE:${rruleStr}`
    const rule = rrulestr(normalized, { dtstart, forceset: false })
    return rule
  } catch (err) {
    console.warn('RRULE parse 실패:', rruleStr, err)
    return null
  }
}

/**
 * @typedef Occurrence
 * @property {string}  id              event.id + ':' + ISO instance_start_at
 * @property {string}  event_id
 * @property {string}  owner_user_id
 * @property {string}  title
 * @property {string}  color
 * @property {boolean} is_shared
 * @property {boolean} is_routine
 * @property {Date}    instance_start_at  RRULE 원본 시각 (override 전)
 * @property {Date}    start_at           실제 표시 시작 (override 반영)
 * @property {Date}    end_at             실제 표시 종료 (override 반영)
 * @property {boolean} completed
 * @property {boolean} cancelled
 * @property {string|null} instance_id    override row 가 있다면 그 id, 없으면 null
 */

/**
 * 단일 루틴 event 를 [from, to) 범위에서 펼친 occurrence 배열.
 * instance override (체크/이동/취소)를 머지하고, cancelled 는 결과에서 제외.
 *
 * @param event       schedule_events row (is_routine=true 가정)
 * @param from        Date — 펼침 시작 (inclusive)
 * @param to          Date — 펼침 끝 (exclusive)
 * @param instances   해당 event 의 schedule_event_instances 배열 (없으면 [])
 * @returns Occurrence[]
 */
export function expandRoutine(event, from, to, instances = []) {
  const rule = parseRule(event.rrule, new Date(event.start_at))
  if (!rule) return []

  const baseStart = new Date(event.start_at)
  const baseEnd = new Date(event.end_at)
  const duration = baseEnd - baseStart   // ms

  // routine_until 또는 RRULE UNTIL/COUNT 가 to 이전이면 알아서 줄어듦
  const occs = rule.between(from, to, true)   // [from, to] inclusive

  // instance_start_at(ISO) → instance row 맵
  const byKey = new Map()
  instances.forEach(inst => {
    const key = new Date(inst.instance_start_at).toISOString()
    byKey.set(key, inst)
  })

  const result = []
  for (const occ of occs) {
    const key = occ.toISOString()
    const inst = byKey.get(key)

    // 취소된 회차는 제외
    if (inst?.cancelled) continue

    const startAt = inst?.moved_start_at ? new Date(inst.moved_start_at) : occ
    const endAt = inst?.moved_end_at
      ? new Date(inst.moved_end_at)
      : new Date(startAt.getTime() + duration)

    result.push({
      id: `${event.id}:${key}`,
      event_id: event.id,
      owner_user_id: event.owner_user_id,
      title: event.title,
      color: event.color,
      is_shared: event.is_shared,
      is_routine: true,
      instance_start_at: occ,
      start_at: startAt,
      end_at: endAt,
      completed: !!inst?.completed,
      cancelled: false,
      instance_id: inst?.id || null,
    })
  }
  return result
}

/**
 * 단발 event 를 occurrence 한 개로 변환 (WeekView 가 한 가지 모양만 다루도록).
 * 단발은 schedule_events.completed 컬럼을 그대로 사용.
 */
export function singleAsOccurrence(event) {
  return {
    id: event.id,
    event_id: event.id,
    owner_user_id: event.owner_user_id,
    title: event.title,
    color: event.color,
    is_shared: event.is_shared,
    is_routine: false,
    all_day: !!event.all_day,
    instance_start_at: new Date(event.start_at),
    start_at: new Date(event.start_at),
    end_at: new Date(event.end_at),
    completed: !!event.completed,
    cancelled: false,
    instance_id: null,
  }
}

/**
 * events 배열을 occurrence 배열로 변환.
 * 단발은 그대로, 루틴은 펼침.
 *
 * @param events       schedule_events 배열
 * @param from / to    펼침 범위
 * @param instancesByEvent  { [event_id]: instance row[] }
 */
export function buildOccurrences(events, from, to, instancesByEvent = {}) {
  const result = []
  for (const e of events) {
    if (e.is_routine && e.rrule) {
      const insts = instancesByEvent[e.id] || []
      result.push(...expandRoutine(e, from, to, insts))
    } else {
      // 단발이라도 from/to 범위와 겹치는지 확인 (RPC 가 이미 필터하지만 안전망)
      const s = new Date(e.start_at), en = new Date(e.end_at)
      if (s < to && en > from) result.push(singleAsOccurrence(e))
    }
  }
  return result
}
