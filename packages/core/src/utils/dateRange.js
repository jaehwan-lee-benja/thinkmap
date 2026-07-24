// 기간(주/일) 순수 유틸 — Schedule 위성 분리 대비 core 승격 (SITE-SPLIT-PLAN §12 Phase 6).
// 원래 src/components/Schedule/scheduleUtils.js 에 있던 것을 이관.
// scheduleUtils.js 는 이 파일을 re-export 해 기존 사용처를 무변경 유지한다.

// 주의 시작(일요일 00:00) — Date 반환
export function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())     // 일요일로
  return d
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// 날짜 → 'YYYY-MM-DD' (로컬 기준)
export function dateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
