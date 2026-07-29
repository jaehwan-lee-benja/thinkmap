// Edge: membership-reward — ★리워드 수령(아이스크림) 프록시(직원게이트+감사+로컬 membership_reward_redeem RPC).
// 멱등·직렬화·중복방지는 crm RPC 서버단(0017). available≤0={ok:false,no_reward}, 레이스={ok:false,retry}.
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
  const rewardType = String(body?.reward_type ?? 'icecream')
  if (!memberId) return json({ error: 'bad_request' }, 400)

  const limited = await rateLimitAndAudit(g, 'reward', memberId)
  if (limited) return limited

  // p_redeemed_by = operator(직원 감사).
  return callRpc(g, 'membership_reward_redeem', {
    p_member_id: memberId, p_reward_type: rewardType, p_redeemed_by: g.operator,
  })
})
