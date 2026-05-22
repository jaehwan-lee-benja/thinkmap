// 월간 뷰용 occurrence 배치 유틸.
//
// Phase 4b: 단일 day 막대만 다룬다 (멀티데이 막대는 후속).
// 같은 날짜 안에서 시작 시각 오름차순으로 정렬.

import { dateKey } from './scheduleUtils'

/**
 * occurrence 배열 → { 'YYYY-MM-DD': [occ, ...] } 맵.
 * occurrence.start_at 의 로컬 날짜 기준 그루핑.
 */
export function groupByDate(occurrences) {
  const map = {}
  occurrences.forEach(o => {
    const key = dateKey(new Date(o.start_at))
    if (!map[key]) map[key] = []
    map[key].push(o)
  })
  // 시작 시각 오름차순
  for (const k in map) {
    map[k].sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at))
  }
  return map
}
