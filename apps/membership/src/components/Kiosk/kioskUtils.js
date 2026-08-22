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
export const ROLES = ['staff', 'editor', 'scan', 'printer', 'ticket', 'display', 'customer']
// ★`display`(응원화면)는 브랜치에 «없던» 역할이다 — 이 파일의 원본은 응원화면 이전 트리에서 왔고,
//   그대로 가져오면 `?role=display` 가 «모르는 값»이 돼 **손님 앞 화면이 고객 키오스크로 떨어진다.**
//   응원화면 태블릿이야말로 «용도가 고정된 기기»라 STICKY 에도 넣는다.

// ★홈 바로가기에서 «역할이 사라지는» 문제(2026-08-22 현장 신고 #2)의 근본 원인과 대응.
//
//   원인: iOS 는 사이트에 **웹 매니페스트가 있으면 «홈 화면에 추가» 시 «지금 보던 URL»이 아니라
//   매니페스트의 `start_url` 을 저장한다.** 우리 `manifest.json` 의 `start_url` 은 `"./"` 라
//   **쿼리가 없다** ⇒ 바로가기로 열면 `?role=staff` 가 사라지고 **고객 화면**이 뜬다.
//   ⚠사파리에서 같은 주소를 열면 멀쩡한 이유가 이것이다(그쪽은 실제 URL 을 그대로 연다).
//   ※서비스워커 캐시가 아니다 — 이 앱엔 SW 가 없다(`index.html` 주석).
//
//   대응(두 겹):
//   ⑴**기억한다**: URL 에 역할이 «명시»되면 그 값을 저장한다(이 기기는 그 역할로 쓰는 기기다).
//   ⑵**되살린다**: URL 에 역할이 없고 **standalone(홈 바로가기)으로 열렸을 때만** 저장값을 쓴다.
//     ⚠브라우저 탭에서는 절대 되살리지 않는다 — 고객 키오스크가 «예전에 직원으로 열렸다»는
//     이유로 고객 화면을 못 여는 사고를 막기 위해서다. 되살림은 «바로가기»라는 좁은 문에서만.
//   ⚠`ticket`(손님 폰)은 저장·복원 대상이 아니다 — 그 화면은 URL 프래그먼트가 정본이고,
//     남의 기기에 역할이 눌러앉으면 안 된다.
const ROLE_KEY = 'mk.role'
const STICKY_ROLES = ['staff', 'editor', 'scan', 'printer', 'display']

export function isStandalone(win) {
  const w = win || (typeof window !== 'undefined' ? window : null)
  if (!w) return false
  // iOS 사파리(구형 포함)는 `navigator.standalone` 만 있고 display-mode 미디어쿼리가 없다.
  if (w.navigator && w.navigator.standalone === true) return true
  if (typeof w.matchMedia !== 'function') return false
  try {
    return w.matchMedia('(display-mode: standalone)').matches ||
           w.matchMedia('(display-mode: fullscreen)').matches
  } catch (e) { return false }
}

// 순수 함수 — 시험 가능하게 «입력»만 받는다(URL 검색문자열 · 저장값 · standalone 여부).
export function pickRole(search, remembered, standalone) {
  const p = new URLSearchParams(search || '')
  const r = p.get('role')
  if (r && ROLES.indexOf(r) >= 0) return { role: r, source: 'url' }
  if (r) return { role: 'customer', source: 'url-unknown' }   // 모르는 값은 «고객»으로(안전 기본값)
  if (standalone && remembered && STICKY_ROLES.indexOf(remembered) >= 0) {
    return { role: remembered, source: 'remembered' }
  }
  return { role: 'customer', source: 'default' }
}

// ★옛 키 1회 폴백 — 2026-08-18 판이 `tm.kiosk.role` 에 썼다. 이 배포 경계를 넘는 기기가 있을 수 있어
//   «읽기»만 받아 준다(쓰기는 새 키로만 → 자연히 이관된다). 이관은 «두 자리를 남기지 않는» 것까지가 이관이다.
const LEGACY_ROLE_KEY = 'tm.kiosk.role'
function readRemembered() {
  try {
    const v = window.localStorage.getItem(ROLE_KEY)
    if (v != null) return v
    const legacy = window.localStorage.getItem(LEGACY_ROLE_KEY)
    if (legacy != null) { window.localStorage.removeItem(LEGACY_ROLE_KEY); return legacy }
    return null
  } catch (e) { return null }
}
function remember(role) {
  try {
    if (STICKY_ROLES.indexOf(role) >= 0) window.localStorage.setItem(ROLE_KEY, role)
  } catch (e) { /* 저장 실패는 조용히 무시 — 없어도 URL 경로는 그대로 동작한다 */ }
}
// 「홈으로」·기기 용도 변경 때 쓸 수 있게 열어 둔다(#7 에서 소비 예정).
export function forgetRole() {
  try { window.localStorage.removeItem(ROLE_KEY); window.localStorage.removeItem(LEGACY_ROLE_KEY) } catch (e) { /* noop */ }
}

export function readRoleAndStore() {
  const search = window.location.search
  const picked = pickRole(search, readRemembered(), isStandalone())
  if (picked.source === 'url') remember(picked.role)
  const p = new URLSearchParams(search)
  const store = p.get('store') || import.meta.env.VITE_MEMBERSHIP_STORE || 'default'
  return { role: picked.role, store, roleSource: picked.source }
}
