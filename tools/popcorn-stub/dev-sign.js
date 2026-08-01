// DEV ONLY — 팝콘 루프 game assertion 서명 헬퍼(로컬 스텁 전용, 실키 아님).
// 계약: crm-archive/GAME-ASSERTION-CONTRACT.md v1.0 — ES256 JWS(compact),
//   클레임 {iss:'game-edge', aud:'crm-ticket-issue', sub:<member_id>, score, event_date(KST), jti, iat, exp(+90s)}.
// 사용: import { signAssertion } from './dev-sign.js'  (게임 파사드 대역·시나리오 러너 공용)
import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const KEYS = JSON.parse(readFileSync(fileURLToPath(new URL('./dev-keys.json', import.meta.url)), 'utf8'))

const b64u = (buf) => Buffer.from(buf).toString('base64url')

export async function signAssertion({ memberId, score, eventDate, now = Date.now(), kid = KEYS.kid, alg = 'ES256' }) {
  const header = { alg, kid, typ: 'JWT' }
  const iat = Math.floor(now / 1000)
  const payload = {
    iss: 'game-edge', aud: 'crm-ticket-issue', sub: memberId,
    score, event_date: eventDate, jti: 'dev-' + iat + '-' + Math.floor(Math.random() * 1e6),
    iat, exp: iat + 90,
  }
  const signingInput = b64u(JSON.stringify(header)) + '.' + b64u(JSON.stringify(payload))
  const key = await webcrypto.subtle.importKey('jwk', KEYS.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(signingInput))
  return signingInput + '.' + b64u(sig)
}
