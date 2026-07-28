// Edge: membership-event — 이벤트 적립 프록시(직원게이트+감사+시크릿→crm membership-event-claim).
// ★배포 전 초안. 1일1회 하드가드는 crm partial-unique(멱등). claimed_by=operator 로 감사.
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
  const eventType = String(body?.event_type ?? '')
  const eventDate = String(body?.event_date ?? '')
  if (!memberId || !eventType || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return json({ error: 'bad_request' }, 400)
  }

  const limited = await rateLimitAndAudit(g, 'event_claim', memberId)
  if (limited) return limited

  // claimed_by = operator(직원 감사). 로컬 RPC(1일1회 partial-unique 서버단).
  return callRpc(g, 'membership_event_claim', {
    p_member_id: memberId, p_event_type: eventType, p_event_date: eventDate, p_claimed_by: g.operator,
  })
})
