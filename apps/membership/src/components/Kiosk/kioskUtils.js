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

export const ROLES = ['staff', 'editor', 'scan', 'printer', 'ticket', 'display']
const ROLE_PIN_KEY = 'tm.kiosk.role'

/**
 * ★«기기 고정 역할» — 홈 화면 아이콘으로 실행할 때만 적용한다(2026-08-18 현장 실측에서 도입).
 *
 * 무엇을 고치나: 회원님 실측 — **홈 아이콘을 닫았다 다시 열어도 키오스크 화면 그대로**였다.
 *   iOS 홈화면 웹앱은 «시작 주소»가 아니라 **마지막 상태**를 복원하기 때문이다. 한 번이라도
 *   `?role=` 없는 주소에 착지하면(로그인 왕복 실패 등) 그 기기는 **영영 거기서 시작**한다.
 *
 * ★왜 standalone 에만 거는가: 이 «눌러붙음»은 전용 기기에서는 원하는 성질이고, 일반 브라우저에서는
 *   사고다(회원님이 폰으로 한 번 열어 본 것이 계속 응원화면으로 뜨면 안 된다). standalone 여부는
 *   그 둘을 정확히 가르는 유일한 관측값이라 **조건을 거기에 건다.**
 *
 * 순수 함수 — 실제 저장소·환경 판정은 호출부가 주입한다(그래서 시험할 수 있다).
 * @param urlRole   주소의 `?role=` 값(없으면 null)
 * @param pinned    기기에 고정된 역할(없으면 null)
 * @param standalone 홈 화면 아이콘으로 실행 중인가
 * @returns {{role:string, pin:string|null}} 쓸 역할과, 새로 «고정할» 값(null=고정 안 함)
 */
export function resolveRole(urlRole, pinned, standalone) {
  const valid = (r) => (ROLES.indexOf(r) >= 0 ? r : null)
  const fromUrl = valid(urlRole)
  // 주소가 역할을 말하면 그게 항상 이긴다 — 고정값이 주소를 덮으면 사람이 주소로 고칠 수 없게 된다.
  if (fromUrl) return { role: fromUrl, pin: standalone ? fromUrl : null }
  // ★`?role=customer` 는 «말하지 않은 것»이 아니라 **명시적 해제**다. 되돌릴 손잡이가 없으면
  //   눌러붙은 기기를 주소로 못 푼다 — 되돌릴 수 없는 고정은 고정이 아니라 고장이다.
  if (urlRole != null) return { role: 'customer', pin: standalone ? '' : null }
  if (standalone) { const p = valid(pinned); if (p) return { role: p, pin: null } }
  return { role: 'customer', pin: null }
}

function isStandalone() {
  try {
    return window.navigator.standalone === true
      || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  } catch { return false }
}

// URL 파라미터 → 역할('customer' 기본 | 'staff' | 'editor'=영수증 편집 | 'scan'=카운터 회수
//   | 'printer'=카운터 폰 인쇄 브리지 | 'ticket'=손님 폰 티켓 화면
//   | 'display'=매장 응원 화면)과 매장 룸 id.
export function readRoleAndStore() {
  const p = new URLSearchParams(window.location.search)
  const standalone = isStandalone()
  let pinned = null
  try { pinned = window.localStorage.getItem(ROLE_PIN_KEY) } catch { /* 저장소 차단 — 고정 없이 간다 */ }
  const { role, pin } = resolveRole(p.get('role'), pinned, standalone)
  if (pin != null) {
    try {
      if (pin) window.localStorage.setItem(ROLE_PIN_KEY, pin)
      else window.localStorage.removeItem(ROLE_PIN_KEY)
    } catch { /* 저장소 차단 — 고정은 포기하고 이번 판만 산다 */ }
  }
  const store = p.get('store') || import.meta.env.VITE_MEMBERSHIP_STORE || 'default'
  return { role, store }
}
