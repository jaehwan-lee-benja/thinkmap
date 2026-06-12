// 목표(goals) 진행률 계산 — 조회 시점 계산 (DB 에 진행률 저장 안 함).
//
// 핵심 원칙(작업 지시서 §3.3):
//   - routine_completion : expandRoutine 으로 기간을 펼쳐 completed 집계
//   - todo_completion    : daily_blocks(is_todo) 의 todo_checked 집계
//   - manual             : current_value / target_value
//
// 루틴 펼침은 routineUtils.expandRoutine 단일 chokepoint 를 재사용한다
// (타임존 정규화 재구현 금지 — SCHEDULE-SPEC §14-3).

import { startOfWeek, addDays, dateKey } from '../Schedule/scheduleUtils'
import { expandRoutine } from '../Schedule/routineUtils'

// ── 기간(period) 경계 계산 ──────────────────────────────────────────────────
// 모두 로컬(브라우저=Asia/Seoul) 기준. 주는 일요일 시작(캘린더와 동일).
function startOfDay(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d
}
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}
function startOfQuarter(date) {
  const q = Math.floor(date.getMonth() / 3) * 3
  return new Date(date.getFullYear(), q, 1, 0, 0, 0, 0)
}
function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0)
}
function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, date.getDate(), 0, 0, 0, 0)
}

/**
 * 목표의 진행 측정 구간 [from, to) 을 goal.period 와 기준 시각(now)으로 계산.
 * 'once' 는 created_at ~ deadline(+1일) 누적, deadline 없으면 now 까지.
 */
export function goalPeriodRange(goal, now = new Date()) {
  switch (goal.period) {
    case 'daily':
      return { from: startOfDay(now), to: addDays(startOfDay(now), 1) }
    case 'weekly':
      return { from: startOfWeek(now), to: addDays(startOfWeek(now), 7) }
    case 'monthly':
      return { from: startOfMonth(now), to: addMonths(startOfMonth(now), 1) }
    case 'quarterly':
      return { from: startOfQuarter(now), to: addMonths(startOfQuarter(now), 3) }
    case 'yearly':
      return { from: startOfYear(now), to: new Date(now.getFullYear() + 1, 0, 1) }
    case 'once': {
      const from = goal.created_at ? startOfDay(new Date(goal.created_at)) : new Date(0)
      const to = goal.deadline ? addDays(startOfDay(new Date(goal.deadline)), 1) : addDays(startOfDay(now), 1)
      return { from, to }
    }
    default:
      return { from: startOfWeek(now), to: addDays(startOfWeek(now), 7) }
  }
}

const PERIOD_LABEL = {
  daily: '오늘', weekly: '이번 주', monthly: '이번 달',
  quarterly: '이번 분기', yearly: '올해', once: '단발',
}
export function periodLabel(period) {
  return PERIOD_LABEL[period] || period
}

/**
 * 단일 목표의 진행 상태 계산.
 *
 * @param goal  goals row
 * @param ctx   {
 *   now?: Date,
 *   eventsById?: { [event_id]: schedule_events row },      // routine_completion 용
 *   instancesByEvent?: { [event_id]: instance[] },          // routine_completion 용
 *   todoBlocks?: [{ page_id, page_date, todo_checked }]     // todo_completion 용 (전체, 여기서 필터)
 * }
 * @returns {
 *   current,        // 측정값 (완료 회차/체크 투두/수동값)
 *   target,         // goal.target_value
 *   ratio,          // current/target (0..∞, 막대는 호출부에서 clamp)
 *   scheduled,      // routine: 펼친 예정 회차 수 (없으면 null)
 *   unit,
 *   from, to,
 * }
 */
export function computeGoalProgress(goal, ctx = {}) {
  const now = ctx.now || new Date()
  const { from, to } = goalPeriodRange(goal, now)
  const target = Number(goal.target_value) || 0

  let current = 0
  let scheduled = null

  if (goal.metric_source === 'manual') {
    current = Number(goal.current_value) || 0
  } else if (goal.metric_source === 'routine_completion') {
    const eventId = goal.metric_filter?.event_id
    const event = eventId ? ctx.eventsById?.[eventId] : null
    if (event) {
      const insts = ctx.instancesByEvent?.[eventId] || []
      const occs = expandRoutine(event, from, to, insts) // cancelled 제외됨
      scheduled = occs.length
      current = occs.filter(o => o.completed).length
    }
  } else if (goal.metric_source === 'todo_completion') {
    const pageId = goal.metric_filter?.page_id || null
    const fromKey = dateKey(from)
    const toKey = dateKey(to)
    const blocks = (ctx.todoBlocks || []).filter(b => {
      if (pageId && b.page_id !== pageId) return false
      const k = b.page_date            // 'YYYY-MM-DD'
      return k >= fromKey && k < toKey  // [from, to)
    })
    scheduled = blocks.length
    current = blocks.filter(b => b.todo_checked).length
  }

  const ratio = target > 0 ? current / target : 0
  return { current, target, ratio, scheduled, unit: goal.unit || '', from, to }
}

/** 진행률을 0~100 정수 퍼센트로 (막대 너비용, 100 초과는 100 으로 클램프). */
export function progressPercent(ratio) {
  return Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)))
}
