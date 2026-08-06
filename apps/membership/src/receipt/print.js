// 영수증 실인쇄 어댑터 — RawBT(`rawbt:base64,…`) 경로. Phase0 권고 ⓒ의 실배선.
//
// 구조: 저장된 템플릿(localStorage, 편집기와 동일 키) → buildEscpos → base64 → rawbt: 스킴 호출.
//   ★프리뷰(편집기)와 실인쇄가 **같은 생성기**(receiptTemplate.buildEscpos)를 쓴다 — 갈라지면 한쪽만 낡는다.
//
// ★RawBT 미설치/실패는 **감지할 수 없다**(스킴 호출은 성공/실패를 알려주지 않는다. 브라우저가 조용히
//   무시하거나 오류 페이지로 갈 뿐이다). 그래서 이 모듈은 "성공"을 주장하지 않고 `{ ok, reason }` 로
//   **시도했는지**만 돌려준다. 화면은 항상 토큰을 함께 보여주고(수기 대조 가능), 재시도 버튼을 남긴다.
//   → 인쇄가 안 나와도 고객·직원이 막히지 않는다(토큰이 진짜 정본, 종이는 편의).
//
// ★기기 전제(실측 2026-08-03): CS-273N = Android **8.1.0** / WebView **126**(현대 크로미움).
//   종전 "5.1.1 / Chrome 40" 가정은 **틀렸다** — 이 제약을 이유로 기능을 깎지 마라(SPEC §5.A).
//   아래 ES5 문법·iframe 폴백은 **이미 검증된 코드라 그대로 두는 것**이지, 제약이 남아서가 아니다.
import { DEFAULT_TEMPLATE, validateTemplate, buildEscpos, escposToBase64, migrateTemplate } from './receiptTemplate'

export const LS_KEY = 'mk-receipt-template'

// 편집기가 저장한 템플릿을 읽는다(없거나 깨졌으면 기본값 — 인쇄가 템플릿 때문에 막히지 않게).
export function loadTemplate() {
  try {
    var raw = localStorage.getItem(LS_KEY)
    if (raw) {
      var t = JSON.parse(raw)
      if (validateTemplate(t).ok) return migrateTemplate(t)   // ★저장본 자동 상향(옛 카피·컷 부재)
    }
  } catch (e) { /* noop — 기본값으로 진행 */ }
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE))
}

// rawbt: 스킴 호출(base64 ESC/POS). 편집기 테스트 인쇄도 이 함수를 쓴다 — 호출 경로를 한 벌로 유지.
export function openRawbt(b64) {
  return openScheme('rawbt:base64,' + b64)
}

// rawbt: 스킴 호출.
// ★2026-08-04 교정 — 종전 구조의 두 결함:
//   ⑴ `document.createElement`/`appendChild` 는 실질적으로 throw 하지 않으므로 catch 안의
//      `location.href` 폴백이 **도달 불가능한 죽은 코드**였다. 즉 실제로 쓰이는 경로는 iframe 뿐.
//   ⑵ Chrome(Android)은 **사용자 제스처 없는 iframe 발 외부 스킴을 차단**한다 → 자동 인쇄가
//      조용히 실패할 수 있는데도 항상 true 를 돌려줘 화면이 "인쇄됨"이라 **거짓 보고**했다.
// ⇒ 제스처가 살아 있으면(버튼 클릭 등) **location.href 를 우선** 쓰고(차단되지 않는 정공법),
//   제스처가 없으면 iframe 으로 시도한다. 그리고 **성공을 주장하지 않는다** — 반환값은
//   "요청을 보냈다"는 뜻이고, 화면 문구도 "요청함/종이 확인"으로 낮춘다(호출부 참조).
function openScheme(url) {
  // ★프리뷰(dev `?preview=1`)에선 스킴을 **쏘지 않는다** — 맥북엔 RawBT 가 없어서
  //   rawbt: 이동이 오류 페이지로 튀면 여정을 걸어보는 것 자체가 끊긴다.
  //   여기가 스킴 발사의 **유일한 지점**이라 이 한 줄로 전 경로가 함께 막힌다(어댑터 경계).
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')) return true
  var gestured = false
  try { gestured = !!(navigator.userActivation && navigator.userActivation.isActive) } catch (e) {}
  if (gestured) {
    try { window.location.href = url; return true } catch (e) { /* 아래 iframe 으로 폴백 */ }
  }
  try {
    var f = document.createElement('iframe')
    f.style.display = 'none'
    f.src = url
    document.body.appendChild(f)
    setTimeout(function () { try { document.body.removeChild(f) } catch (e) {} }, 3000)
    return true
  } catch (e) {
    try { window.location.href = url; return true } catch (e2) { return false }
  }
}

/**
 * 영수증 인쇄 시도.
 * @param {{name?:string, date?:string, token:string, stamp?:string}} data
 * @returns {{ok:boolean, reason?:string, bytes?:number}}
 *   ok=true 는 **호출을 시도했다**는 뜻이지 종이가 나왔다는 보장이 아니다(위 주석 참조).
 */
export function printReceipt(data) {
  if (!data || !data.token) return { ok: false, reason: 'no_token' }
  var bytes
  try {
    bytes = buildEscpos(loadTemplate(), data)
  } catch (e) {
    return { ok: false, reason: 'build_failed' }
  }
  var b64
  try {
    b64 = escposToBase64(bytes)
  } catch (e) {
    return { ok: false, reason: 'encode_failed' }
  }
  var ok = openRawbt(b64)
  return ok ? { ok: true, bytes: bytes.length } : { ok: false, reason: 'scheme_blocked' }
}
