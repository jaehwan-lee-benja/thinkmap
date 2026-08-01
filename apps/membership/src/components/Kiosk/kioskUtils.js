// 키오스크 공용 유틸 — 날짜·역할·룸·전화포맷.

// 010-1234-5678 형태로 그룹핑(최대 11자리).
export function formatPhone(digits) {
  const d = String(digits).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

// ★오늘 날짜 = KST(Asia/Seoul) 기준 YYYY-MM-DD. 기기 타임존과 무관하게 정합(event_date·오늘 판정).
//   en-CA 로케일이 YYYY-MM-DD 형식을 준다. (서버 today 판정도 KST로 교정됨 — 0017.)
export function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

// claimed_at(ISO) → "N월 N일 N시에" (이벤트명은 JSX에서 태그로 강조). 로컬(KST) 시각.
export function formatClaimPrefix(claimedAt) {
  const d = new Date(claimedAt)
  if (isNaN(d)) return String(claimedAt)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시에`
}

// URL 파라미터 → 역할('customer' 기본 | 'staff' | 'editor'=영수증 편집)과 매장 룸 id.
export function readRoleAndStore() {
  const p = new URLSearchParams(window.location.search)
  const r = p.get('role')
  const role = r === 'staff' ? 'staff' : r === 'editor' ? 'editor' : 'customer'
  const store = p.get('store') || import.meta.env.VITE_MEMBERSHIP_STORE || 'default'
  return { role, store }
}
