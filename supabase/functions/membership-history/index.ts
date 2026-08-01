// Edge: membership-history — 팝콘 수령 내역 프록시(직원게이트+감사+시크릿→crm membership-events).
// ★배포 전 초안(SPEC §8 하드게이트). crm.membership_events 테이블은 이미 존재(0014) — crm 읽기 RPC/Edge 추가 필요.
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
  const eventType = String(body?.event_type ?? 'popcorn')
  if (!memberId) return json({ error: 'bad_request' }, 400)

  const limited = await rateLimitAndAudit(g, 'history', memberId)
  if (limited) return limited

  // RPC 원출력 = [{event_date,claimed_at}] → 프론트 계약 {events:[...]} 로 감쌈.
  return callRpc(g, 'membership_events_list',
    { p_member_id: memberId, p_event_type: eventType },
    (d) => ({ events: Array.isArray(d) ? d : [] }))
})
