// 스캐너 입력 정규화 — ★**ScanView(전용 입력창)와 직원 허브(전역 리스너)가 공유**한다.
//   같은 로직을 두 벌 두면 한쪽만 낡는다. 한글 IME 대응은 현장에서 비싸게 얻은 것이라 특히 그렇다.

// ★한글 IME 내성(현장 실측 2026-08-03: 영문 상태 "8809880097887" 정상 / 한글 상태 "뮻-뮻1234"로 깨짐).
//   원인: 입력값(onChange)에 의존하면 IME 가 키를 **조합한 결과**가 들어온다. 실매장 직원 PC 는
//   한글 IME 가 기본이라 프로덕션에서 반드시 재현된다.
//   해법: 값이 아니라 **물리 키코드(e.code)**로 읽는다 — IME 는 code 를 바꾸지 않는다.
//   (조합 중 keydown 은 key='Process'/isComposing=true 로 오지만 code 는 'Digit8'·'KeyA' 그대로다.)
export function charFromKey(e) {
  const c = e.code || ''
  let m
  if ((m = /^Digit([0-9])$/.exec(c))) return m[1]
  if ((m = /^Numpad([0-9])$/.exec(c))) return m[1]
  if ((m = /^Key([A-Za-z])$/.exec(c))) return m[1].toUpperCase()
  // e.code 미지원 구형 폴백 — 조합 중이 아닐 때만 key 를 믿는다.
  if (!c && !e.isComposing && typeof e.key === 'string' && /^[0-9A-Za-z]$/.test(e.key)) return e.key.toUpperCase()
  return null
}
export const ASCII_TOKEN_RE = /^[0-9A-Z]+$/

