// 키오스크 공용 유틸 — 날짜·역할·룸.

// 오늘 날짜(로컬) YYYY-MM-DD.
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// claimed_at(ISO) → "N월 N일 N시에 팝콘 수령"
export function formatClaim(claimedAt) {
  const d = new Date(claimedAt)
  if (isNaN(d)) return String(claimedAt)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시에 팝콘 수령`
}

// URL 파라미터 → 역할('customer' 기본 | 'staff')과 매장 룸 id.
export function readRoleAndStore() {
  const p = new URLSearchParams(window.location.search)
  const role = p.get('role') === 'staff' ? 'staff' : 'customer'
  const store = p.get('store') || import.meta.env.VITE_MEMBERSHIP_STORE || 'default'
  return { role, store }
}
