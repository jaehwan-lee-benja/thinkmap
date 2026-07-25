// Edge: membership-signup — 가입 프록시(직원게이트+감사+시크릿→crm membership-intake).
// ★배포 전 초안. 읽기 없이 쓰기만(고객모드 안전, §5.5). dedup/검증은 crm intake RPC(0013).
import { corsHeaders } from '../_shared/cors.ts'
import { gate, rateLimitAndAudit, callCrm, json } from '../_shared/membershipGate.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const g = await gate(req)
  if (!g.ok) return g.res

  let body: any = {}
  try { body = await req.json() } catch { /* noop */ }
  const phone = String(body?.phone ?? '').replace(/\D/g, '')
  const name = String(body?.name ?? '').trim()
  const email = String(body?.email ?? '').trim()   // crm intake 가 body.email → p_email 로 캡처(0013)
  const consent = body?.consent === true
  // 이메일은 형식만 가볍게 검증(최종 검증/정규화는 crm). 빈 값은 거부(폼에서 필수).
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (phone.length < 10 || !name || !emailOk || !consent) return json({ error: 'bad_request' }, 400)

  const limited = await rateLimitAndAudit(g, 'signup', null)
  if (limited) return limited

  return callCrm(g, 'membership-intake', { phone, name, email, consent: true, source: 'kiosk' })
})
