// Edge: membership-stamp — 스탬프 상태 새로고침 프록시(직원게이트+감사+로컬 membership_stamp_status RPC).
// 수령/적립 후 진행도 갱신용. 로열티 데이터모델=crm 소유(0017).
import { corsHeaders } from '../_shared/cors.ts'
import { gate, rateLimitAndAudit, callRpc, json } from '../_shared/membershipGate.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const g = await gate(req)
  if (!g.ok) return g.res

  let body: any = {}
  try { body = await req.json() } catch { /* noop */ }
  const memberId = String(body?.member_id ?? '')
  if (!memberId) return json({ error: 'bad_request' }, 400)

  const limited = await rateLimitAndAudit(g, 'stamp', memberId)
  if (limited) return limited

  // RPC 원출력(stamp jsonb) → {stamp} 로 감쌈.
  return callRpc(g, 'membership_stamp_status', { p_member_id: memberId }, (d) => ({ stamp: d }))
})
