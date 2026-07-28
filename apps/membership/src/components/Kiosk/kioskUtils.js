// 키오스크 공용 유틸 — 날짜·역할·룸·전화포맷.

// 010-1234-5678 형태로 그룹핑(최대 11자리).
export function formatPhone(digits) {
  const d = String(digits).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

// 오늘 날짜(로컬) YYYY-MM-DD.
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// claimed_at(ISO) → "N월 N일 N시에" (이벤트명은 JSX에서 태그로 강조). 로컬(KST) 시각.
export function formatClaimPrefix(claimedAt) {
  const d = new Date(claimedAt)
  if (isNaN(d)) return String(claimedAt)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시에`
}

// URL 파라미터 → 역할('customer' 기본 | 'staff')과 매장 룸 id.
export function readRoleAndStore() {
  const p = new URLSearchParams(window.location.search)
  const role = p.get('role') === 'staff' ? 'staff' : 'customer'
  const store = p.get('store') || import.meta.env.VITE_MEMBERSHIP_STORE || 'default'
  return { role, store }
}
