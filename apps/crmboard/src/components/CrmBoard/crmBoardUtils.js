// CRM 운영 보드 — 기간 축(주/월/년) 계산 유틸 (순수 함수). CRM-BOARD-SPEC §6.
//
// 두 레인(지표·투두)의 집계 범위를 함께 제어한다. 주간은 Schedule 의 startOfWeek(일요일 시작)를
// 재사용해 캘린더/대시보드와 일관성을 유지한다.

import { startOfWeek, addDays, dateKey } from '@thinkmap/core'

/** 지원 기간 */
export const PERIODS = ['week', 'month', 'year']
export const PERIOD_LABELS = { week: '주', month: '월', year: '년' }

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0) }
function startOfYear(d) { return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0) }

/**
 * 기간 범위. to 는 exclusive(다음 기간의 시작).
 * @returns {{ from: Date, to: Date }}
 */
export function periodRange(period, anchor) {
  const a = anchor instanceof Date ? anchor : new Date(anchor)
  if (period === 'week') {
    const from = startOfWeek(a)
    return { from, to: addDays(from, 7) }
  }
  if (period === 'month') {
    const from = startOfMonth(a)
    return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1, 0, 0, 0, 0) }
  }
  // year
  const from = startOfYear(a)
  return { from, to: new Date(from.getFullYear() + 1, 0, 1, 0, 0, 0, 0) }
}

/** anchor 를 dir(-1/+1) 만큼 기간 단위로 이동한 새 anchor(Date). */
export function shiftPeriod(period, anchor, dir) {
  const a = anchor instanceof Date ? anchor : new Date(anchor)
  if (period === 'week') return addDays(startOfWeek(a), dir * 7)
  if (period === 'month') return new Date(a.getFullYear(), a.getMonth() + dir, 1, 0, 0, 0, 0)
  return new Date(a.getFullYear() + dir, 0, 1, 0, 0, 0, 0)
}

/** 현재(오늘 포함) 기간인가. "이번 주/이번 달/올해" 라벨 판정에 사용. */
export function isCurrentPeriod(period, anchor) {
  const now = periodRange(period, new Date())
  const cur = periodRange(period, anchor)
  return now.from.getTime() === cur.from.getTime()
}

/** 사람이 읽는 기간 라벨. */
export function periodLabel(period, anchor) {
  const { from, to } = periodRange(period, anchor)
  if (period === 'week') {
    const end = addDays(from, 6)
    const f = (d) => `${d.getMonth() + 1}/${d.getDate()}`
    return `${f(from)} – ${f(end)}`
  }
  if (period === 'month') return `${from.getFullYear()}. ${from.getMonth() + 1}월`
  return `${from.getFullYear()}년`
}

/** daily_blocks.page_date 필터용 문자열 범위(from inclusive, to exclusive). */
export function periodDateKeys(period, anchor) {
  const { from, to } = periodRange(period, anchor)
  return { fromKey: dateKey(from), toKey: dateKey(to) }
}

/**
 * 기간이 걸치는 'YYYY-MM' 목록(오름차순). crm_metrics(ym) 조회용.
 * 주=속한 1~2개월, 월=1개월, 년=12개월. CRM 지표는 월 단위 스냅샷이므로.
 */
export function periodYms(period, anchor) {
  const { from, to } = periodRange(period, anchor)
  const last = addDays(to, -1) // to 는 exclusive
  const yms = []
  let y = from.getFullYear()
  let m = from.getMonth()
  while (y < last.getFullYear() || (y === last.getFullYear() && m <= last.getMonth())) {
    yms.push(`${y}-${String(m + 1).padStart(2, '0')}`)
    m += 1
    if (m > 11) { m = 0; y += 1 }
  }
  return yms
}

/** region_key → 기본 한글 라벨(payload.metric 이 없을 때 fallback). ★R8/R9(v2): visitor→unregistered. */
export const REGION_LABELS = {
  unregistered: '미등록',
  experience: '경험',
  decision: '결정',
  retention: '단골',
  fan_pool: '단골풀',
  application: '신청',
  target_pool: '타겟풀',
  business: '사업지표',
}

/** 지표 레인에 카드로 보여줄 여정 region 순서(business 는 별도 숫자띠). */
export const METRIC_REGION_ORDER = [
  'unregistered', 'experience', 'decision', 'retention', 'fan_pool',
]
