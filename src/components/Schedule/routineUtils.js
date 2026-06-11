// RRULE 펼침 + instance override 머지.
//
// 클라이언트에서 펼친다 (SPEC §7.2). 주 단위 뷰는 7일치만 펼치므로 비용 작음.

import { RRule, rrulestr } from 'rrule'

// event.timezone 누락 시 기본값 (SPEC §3.1 / §14-3 — Asia/Seoul 기본)
const DEFAULT_TZ = 'Asia/Seoul'

/**
 * 타임존 정규화 (정석안 — SPEC §14-3)
 * -------------------------------------------------------------------
 * rrule.js 는 timezone-naive: Date 의 **UTC 필드**를 벽시계 시각으로 읽어
 * BYDAY/시각을 판정한다. event.start_at 은 UTC instant 로 저장되므로,
 * 그대로 펼치면 요일 판정이 UTC 기준이 되어 로컬(렌더) 기준과 어긋난다
 * (KST 아침 루틴이 +1일 밀리는 버그의 원인).
 *
 * 해결: event.timezone 의 벽시계 시각을 UTC 필드에 담은 "floating" Date 로
 * 변환해 펼친 뒤(→ BYDAY/시각이 event.timezone 기준), 결과를 다시 실제
 * instant 로 환원한다. 렌더러는 그 instant 를 로컬로 버킷팅하므로
 * "event.timezone 에서 고른 요일" 이 화면에 정확히 표시된다.
 */

// 주어진 instant 에서 IANA timeZone 의 UTC 오프셋(ms). local = utc + offset.
function tzOffsetMs(timeZone, instant) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = {}
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUTC - instant.getTime()
}

// 실제 instant → floating Date (UTC 필드 = timeZone 벽시계 시각)
function toFloating(instant, timeZone) {
  return new Date(instant.getTime() + tzOffsetMs(timeZone, instant))
}

// floating Date (UTC 필드 = timeZone 벽시계 시각) → 실제 instant
// 벽시계→instant 는 오프셋이 instant 에 의존하므로 1회 보정 (DST 경계 안전).
// Asia/Seoul 은 DST 없어 1차 추정으로 충분하지만 일반 tz 대비 보정 유지.
function fromFloating(floating, timeZone) {
  const wallMs = floating.getTime()
  let guess = wallMs - tzOffsetMs(timeZone, new Date(wallMs))
  guess = wallMs - tzOffsetMs(timeZone, new Date(guess))
  return new Date(guess)
}

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
  const tz = event.timezone || DEFAULT_TZ

  const baseStart = new Date(event.start_at)
  const baseEnd = new Date(event.end_at)
  const duration = baseEnd - baseStart   // ms (실제 elapsed)

  // event.timezone 벽시계를 UTC 필드에 담은 floating dtstart 로 펼친다
  // → BYDAY/시각 판정이 event.timezone 기준이 됨.
  const rule = parseRule(event.rrule, toFloating(baseStart, tz))
  if (!rule) return []

  // 펼침 범위도 같은 floating 공간으로 맞춰 between 실행.
  // routine_until / RRULE UNTIL / COUNT 가 to 이전이면 알아서 줄어듦.
  const occsFloating = rule.between(toFloating(from, tz), toFloating(to, tz), true)

  // instance_start_at(실제 instant ISO) → instance row 맵.
  // 저장 키(occurrence.instance_start_at.toISOString())와 동일 프레임이라
  // 펼침 기준을 바꿔도 읽기/쓰기 키가 자동 일관 (둘 다 환원된 실제 instant).
  const byKey = new Map()
  instances.forEach(inst => {
    const key = new Date(inst.instance_start_at).toISOString()
    byKey.set(key, inst)
  })

  const result = []
  for (const occFloating of occsFloating) {
    const occ = fromFloating(occFloating, tz)   // floating → 실제 instant 환원
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
