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

// ★번호 가림 — 앞 3자리(통신사 접두)는 남기고 나머지는 «가린 자릿수»로. **자릿수는 보인다**(진행 피드백).
//   접두를 남기는 이유: 010 은 누구나 같아 식별 정보가 아니고, 남겨두면 «어디까지 눌렀나»를 읽기 쉽다.
//
// ★2026-08-08 정정 — 문자 `●` 를 쓰지 않는다(실기기 피드백 2건이 같은 뿌리였다):
//   ⑴ 「010 뒤 하이픈이 빠졌어」 ⑵ 「가림 점이 너무 크다」
//   `●`(U+25CF)는 **본문 폰트 크기 그대로 그려지는 글리프**다. 표시 폰트가 clamp 로 최대 52px 이라
//   점이 거대해지고, GmarketSans 에 이 글자가 없어 폴백 폰트로 넘어가면서 폭·베이스라인이 흔들려
//   **사이 하이픈이 시각적으로 짓눌린다**(DOM 에는 있는데 눈에 안 보인다 — 그래서 textContent 측정만으론 못 잡았다).
//   ⇒ 점을 **CSS 로 그린다**(글리프 아님) ⇒ 폰트 폴백과 무관하고 크기를 우리가 정한다.
//   반환 = 그룹 배열: [{ text:'010' } , { dots:4 }, { dots:4 }] — 하이픈은 그리는 쪽이 넣는다.
//   반환 = { head:'010', groups:['1234','5678'] } — **실제 문자**를 준다(그리는 쪽이 자리마다
//   «숫자로 보일지 점으로 보일지»를 정한다. 마지막 입력 글자 잠깐 노출을 위해 필요하다).
export function maskPhoneGroups(digits) {
  const d = String(digits || '').replace(/[^0-9]/g, '')
  if (!d) return null
  const rest = d.slice(3)
  const groups = []
  if (rest.length) groups.push(rest.slice(0, 4))
  if (rest.length > 4) groups.push(rest.slice(4))
  return { head: d.slice(0, 3), groups }
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
