// 키오스크 공용 유틸 — 날짜·역할·룸·전화포맷.

// 010-1234-5678 형태로 그룹핑(최대 11자리).
// ★그룹 경계에 닿으면 **하이픈을 미리 띄운다**(2026-08-06 유저 지시: 「010뒤에 - 하이픈도 하나
//   떠있게 — 그래야 눌를때 자연스러운 경험」). `010` → `010-`, `010-1234` → `010-1234-`.
//   ⚠︎하이픈은 **표시 전용**이다 — 저장·검증·제출은 계속 숫자만(digits)이라 지우기 시 하이픈
//   건너뛰기 같은 특수 처리가 필요 없다(자릿수가 줄면 하이픈도 자연히 사라진다).
export function formatPhone(digits) {
  const d = String(digits).slice(0, 11)
  if (d.length < 3) return d
  if (d.length === 3) return `${d}-`
  if (d.length < 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3)}-`
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

// ★리스트 오른쪽 열에 쓸 «가지런한 날짜»(2026-08-08 유저 지시: 내용 좌·날짜 우).
//   자릿수를 0 으로 채워 폭이 흔들리지 않게 한다 — 우측 정렬은 폭이 들쭉날쭉하면 정렬로 안 읽힌다.
export function formatClaimDate(claimedAt) {
  const d = new Date(claimedAt)
  if (isNaN(d)) return String(claimedAt)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// URL 파라미터 → 역할('customer' 기본 | 'staff' | 'editor'=영수증 편집 | 'scan'=카운터 회수
//   | 'printer'=카운터 폰 인쇄 브리지 | 'ticket'=손님 폰 티켓 화면)과 매장 룸 id.
export function readRoleAndStore() {
  const p = new URLSearchParams(window.location.search)
  const r = p.get('role')
  const role = r === 'staff' ? 'staff' : r === 'editor' ? 'editor'
    : r === 'scan' ? 'scan' : r === 'printer' ? 'printer' : r === 'ticket' ? 'ticket' : 'customer'
  const store = p.get('store') || import.meta.env.VITE_MEMBERSHIP_STORE || 'default'
  return { role, store }
}
