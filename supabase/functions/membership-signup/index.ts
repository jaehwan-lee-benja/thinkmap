// Edge: membership-signup — 가입 프록시(직원게이트+감사+로컬 membership_intake RPC).
// 읽기 없이 쓰기만(고객모드 안전, §5.5). dedup/검증은 intake RPC(0013) 서버단.
import { corsHeaders } from '../_shared/cors.ts'
import { gate, rateLimitAndAudit, callRpc, json } from '../_shared/membershipGate.ts'

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
  // ★이메일 선택(유저결정: 이메일 없이 가입 허용). 입력됐으면 형식만 검증, 비면 통과(p_email=null).
  const emailOk = email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (phone.length < 10 || !name || !emailOk || !consent) return json({ error: 'bad_request' }, 400)

  const limited = await rateLimitAndAudit(g, 'signup', null)
  if (limited) return limited

  // 로컬 membership_intake RPC(0013). email 빈 문자열이면 생략(p_email 기본 null).
  // ★intake RPC 파라미터명은 crm 확정 필요 — p_phone/p_name/p_email 가정(0013 core). consent/source 는 RPC 미수용 가정(미전달).
  const params: Record<string, unknown> = { p_phone: phone, p_name: name }
  if (email) params.p_email = email
  return callRpc(g, 'membership_intake', params)
})
