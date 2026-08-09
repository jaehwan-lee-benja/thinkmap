// 영수증 실인쇄 어댑터 — RawBT(`rawbt:base64,…`) 경로. **인쇄의 유일한 진입점.**
//
// 구조(2026-08-09 구조 라운드로 정리):
//   영수증 «모양»  = 템플릿(receiptTemplate.js) — 매장 공통. 저장은 명시 오버라이드만.
//   프린터 «성질»  = 설정(printerConfig.js)     — 이 기기 고유(컷 방언·스킴 방식).
//   바이트 생성    = buildEscpos               — 프리뷰·실인쇄·테스트가 **한 벌**.
//   호출·기록      = 이 파일                   — 모든 인쇄가 여기를 지나며 블랙박스에 남는다.
//
// ★왜 진입점을 하나로 못박는가: 편집기 테스트 인쇄가 이 모듈을 우회해 buildEscpos+스킴을 직접
//   불렀다. 그래서 오류 처리·기록이 한쪽에만 붙었고, 「테스트는 잘 나오는데 실제는 안 된다」류
//   신고에서 두 경로의 차이를 배제할 수 없었다. 두 벌이 되면 한쪽이 낡는다(이 주 2회 실증).
//
// ★RawBT 미설치/실패는 **감지할 수 없다**(스킴 호출은 성공/실패를 알려주지 않는다. 브라우저가 조용히
//   무시하거나 오류 페이지로 갈 뿐이다). 그래서 이 모듈은 "성공"을 주장하지 않고 `{ ok, reason }` 로
//   **시도했는지**만 돌려준다. 화면은 항상 토큰을 함께 보여주고(수기 대조 가능), 재시도 버튼을 남긴다.
//   → 인쇄가 안 나와도 고객·직원이 막히지 않는다(토큰이 진짜 정본, 종이는 편의).
//   ⇒ 결과를 못 남기니 **입력 조건을 전부 남긴다**(printLog.js) — 그것만으로 축 가르기가 된다.
//
// ★기기 전제(실측 2026-08-03): CS-273N = Android **8.1.0** / WebView **126**(현대 크로미움).
//   종전 "5.1.1 / Chrome 40" 가정은 **틀렸다** — 이 제약을 이유로 기능을 깎지 마라(SPEC §5.A).
//   아래 ES5 문법·iframe 폴백은 **이미 검증된 코드라 그대로 두는 것**이지, 제약이 남아서가 아니다.
import {
  DEFAULT_TEMPLATE, validateTemplate, buildEscpos, escposToBase64, mergeWithDefault, diffFromDefault,
} from './receiptTemplate'
import { loadConfig } from './printerConfig'
import { logPrint, hashTemplate } from './printLog'

export const LS_KEY = 'mk-receipt-template'

// 저장분(명시 오버라이드) → 실사용 템플릿. 없거나 깨졌으면 코드 기본값.
//   ★깨진 저장본으로 인쇄가 막히지 않게 한다 — 종이는 편의지만 «안 나오는 것»은 현장 사고다.
export function loadTemplate() {
  try {
    var raw = localStorage.getItem(LS_KEY)
    if (raw) {
      var t = mergeWithDefault(JSON.parse(raw))
      if (validateTemplate(t).ok) return t
    }
  } catch (e) { /* noop — 기본값으로 진행 */ }
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE))
}

// 편집기 저장 — 기본값과 다른 부분만 남긴다(diffFromDefault 주석 참조).
export function saveTemplate(tpl) {
  var diff = diffFromDefault(tpl)
  try { localStorage.setItem(LS_KEY, JSON.stringify(diff)) } catch (e) { /* noop */ }
  return diff
}

export function readSavedTemplate() {
  try {
    var raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) { return null }
}

// rawbt: 스킴 호출(base64 ESC/POS).
// @returns {{ok:boolean, resolved:string, gestured:boolean}}
export function openRawbt(b64, scheme) {
  return openScheme('rawbt:base64,' + b64, scheme)
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
// ★2026-08-09 추가 — 이 판단을 **설정으로 뺐다**(scheme: auto|iframe|href). 이유:
//   `location.href` 는 스킴이 처리되지 않으면 **현재 페이지가 오류 화면으로 바뀐다** = 키오스크 파괴.
//   iframe 은 같은 실패가 iframe 안에서 죽어 화면이 산다. 어느 쪽이 이 기기에서 실제로 인쇄되는지는
//   **현장 실물로만** 갈린다(스킴은 결과를 안 알려준다) ⇒ 기본은 현행(auto) 유지, 현장에서 전환 가능,
//   그리고 **어느 경로였는지 로그에 남긴다**. 코드가 혼자 추측으로 바꿀 문제가 아니다.
function openScheme(url, scheme) {
  var gestured = false
  try { gestured = !!(navigator.userActivation && navigator.userActivation.isActive) } catch (e) {}
  // ★프리뷰(dev `?preview=1`)에선 스킴을 **쏘지 않는다** — 맥북엔 RawBT 가 없어서
  //   rawbt: 이동이 오류 페이지로 튀면 여정을 걸어보는 것 자체가 끊긴다.
  //   여기가 스킴 발사의 **유일한 지점**이라 이 한 줄로 전 경로가 함께 막힌다(어댑터 경계).
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')) {
    return { ok: true, resolved: 'preview', gestured: gestured }
  }
  var mode = scheme === 'iframe' || scheme === 'href' ? scheme : (gestured ? 'href' : 'iframe')
  if (mode === 'href') {
    try { window.location.href = url; return { ok: true, resolved: 'href', gestured: gestured } } catch (e) { /* iframe 폴백 */ }
  }
  try {
    var f = document.createElement('iframe')
    f.style.display = 'none'
    f.src = url
    document.body.appendChild(f)
    setTimeout(function () { try { document.body.removeChild(f) } catch (e) {} }, 3000)
    return { ok: true, resolved: 'iframe', gestured: gestured }
  } catch (e) {
    try { window.location.href = url; return { ok: true, resolved: 'href', gestured: gestured } } catch (e2) {
      return { ok: false, resolved: 'blocked', gestured: gestured }
    }
  }
}

/**
 * 영수증 인쇄 시도 — **모든 인쇄가 이 함수를 지난다.**
 * @param {{name?:string, date?:string, token:string, stamp?:string}} data
 * @param {{source?:string, template?:object, config?:object}} [opts]
 *   source   기록용 경로 이름(claim|reprint|scan|bridge|test) — 신고 재구성의 핵심 축
 *   template 지정 시 저장본 대신 이것으로 생성(편집기 «저장 전 테스트 인쇄»)
 *   config   지정 시 저장된 기기 설정 대신 이것으로(편집기 방언 실험)
 * @returns {{ok:boolean, reason?:string, bytes?:number, cut?:string, resolved?:string}}
 *   ok=true 는 **호출을 시도했다**는 뜻이지 종이가 나왔다는 보장이 아니다(위 주석 참조).
 */
export function printReceipt(data, opts) {
  var o = opts || {}
  var source = o.source || '?'
  if (!data || !data.token) {
    logPrint({ source: source, ok: false, reason: 'no_token', cut: '?', scheme: '?', tplHash: '?' })
    return { ok: false, reason: 'no_token' }
  }
  var tpl = o.template || loadTemplate()
  var cfg = o.config || loadConfig()
  var tplHash = hashTemplate(tpl)
  var base = { source: source, cut: cfg.cut, scheme: cfg.scheme, tplHash: tplHash, token: data.token }
  var bytes
  try {
    bytes = buildEscpos(tpl, data, cfg)
  } catch (e) {
    logPrint({ ...base, ok: false, reason: 'build_failed' })
    return { ok: false, reason: 'build_failed' }
  }
  var b64
  try {
    b64 = escposToBase64(bytes)
  } catch (e) {
    logPrint({ ...base, ok: false, reason: 'encode_failed', bytes: bytes.length })
    return { ok: false, reason: 'encode_failed', bytes: bytes.length }
  }
  var r = openRawbt(b64, cfg.scheme)
  logPrint({
    ...base, ok: r.ok, reason: r.ok ? undefined : 'scheme_blocked',
    bytes: bytes.length, b64: b64.length, resolved: r.resolved, gestured: r.gestured,
  })
  return r.ok
    ? { ok: true, bytes: bytes.length, cut: cfg.cut, resolved: r.resolved }
    : { ok: false, reason: 'scheme_blocked', bytes: bytes.length, cut: cfg.cut }
}
