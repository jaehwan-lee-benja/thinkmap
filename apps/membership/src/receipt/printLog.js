// 인쇄 블랙박스 — 최근 N건 링버퍼(localStorage).
//
// 왜(2026-08-09 구조 라운드): 「컷이 안 된다 / 빈 종이가 나온다」 신고가 올 때마다
//   «어느 기기에서, 어떤 설정으로, 어떤 페이로드를 쐈나»를 **재구성할 수 없어 매번 추측으로** 시작했다.
//   RawBT 스킴은 성공/실패를 안 알려주므로 «결과»는 원리적으로 못 남긴다 —
//   그래서 남길 수 있는 것(입력 조건)을 전부 남긴다. 그것만으로 축 가르기가 된다:
//     같은 페이로드인데 출력이 다르면 기기·앱 축 / 페이로드가 다르면 우리 축.
//
// ★개인정보: 토큰은 **끝 4자만** 남긴다(전체를 남기면 로그가 곧 재인쇄 가능한 참여권이 된다).
//   이름·전화번호는 남기지 않는다 — 진단에 불필요하다.
export const LOG_KEY = 'mk-print-log'
export const LOG_MAX = 20

function read() {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    const a = raw ? JSON.parse(raw) : []
    return Array.isArray(a) ? a : []
  } catch (e) { return [] }
}

/** 최근 → 과거 순. */
export function readPrintLog() { return read() }

export function clearPrintLog() {
  try { localStorage.removeItem(LOG_KEY) } catch (e) { /* noop */ }
}

/**
 * 인쇄 시도 1건 기록.
 * @param {{source:string, cut:string, scheme:string, resolved?:string, tplHash:string,
 *          bytes?:number, b64?:number, gestured?:boolean, ok:boolean, reason?:string, token?:string}} e
 */
export function logPrint(e) {
  const rec = {
    at: new Date().toISOString(),
    source: e.source || '?',          // claim | reprint | scan | bridge | test
    cut: e.cut, scheme: e.scheme,
    resolved: e.resolved,             // 실제로 쓰인 호출 경로(href | iframe | preview)
    tpl: e.tplHash,                   // 템플릿 해시 — 기기 간 «같은 모양인가»를 한 눈에
    bytes: e.bytes, b64: e.b64,       // 페이로드 크기(컷이 스트림 맨 끝이라 절단과 직결)
    gestured: e.gestured,
    ok: e.ok, reason: e.reason,
    tok: e.token ? String(e.token).slice(-4) : undefined,
  }
  try {
    const a = read()
    a.unshift(rec)
    localStorage.setItem(LOG_KEY, JSON.stringify(a.slice(0, LOG_MAX)))
  } catch (err) { /* noop — 로깅 실패가 인쇄를 막아선 안 된다 */ }
  return rec
}

// 템플릿 해시(짧은 문자열) — 기기 간 비교용. 암호 용도 아님.
export function hashTemplate(tpl) {
  let s
  try { s = JSON.stringify(tpl) } catch (e) { return '?' }
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0 }
  return ('0000000' + h.toString(16)).slice(-8)
}
