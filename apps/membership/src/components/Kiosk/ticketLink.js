// 티켓 링크 인코딩 — 키오스크 QR ↔ 손님 폰 화면(?role=ticket#<payload>)의 **단일 규약**.
//
// ★페이로드는 프래그먼트(#)에 싣는다 — 프래그먼트는 서버로 전송되지 않는다(조회 오라클 회피).
// ★base64url 을 쓴다: QR 은 대소문자·기호에 따라 인코딩 모드가 갈리는데, `+ / =` 가 섞이면
//   URL 이스케이프까지 겹쳐 길이가 늘고 스캔이 나빠진다. 한글(마스킹명)은 UTF-8 → base64 로 안전하게 넘긴다.

// 유니코드 안전 base64url (btoa 는 라틴1만 받는다 — 한글명이 들어오므로 필수)
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// 키오스크 → QR 에 담을 URL. 담는 것은 **인쇄 영수증과 동일한 최소 정보**(토큰·마스킹명·날짜)뿐.
export function buildTicketUrl(ticket, base) {
  if (!ticket || !ticket.token) return null
  const origin = window.location.origin
  const path = base || import.meta.env.BASE_URL || '/'
  const payload = { t: ticket.token, n: ticket.name || null, d: ticket.date || null }
  return `${origin}${path}?role=ticket#${b64urlEncode(JSON.stringify(payload))}`
}

// 손님 폰 → 프래그먼트에서 티켓 복원. 형식이 깨지면 null(화면이 안내로 폴백).
export function decodeTicketPayload(hash) {
  const raw = String(hash || '').replace(/^#/, '')
  if (!raw) return null
  try {
    const o = JSON.parse(b64urlDecode(raw))
    if (!o || !o.t) return null
    return { token: String(o.t), name: o.n || null, date: o.d || null }
  } catch (e) { return null }
}
