// Edge: membership-lookup — 회원 조회 프록시(직원게이트+레이트리밋+시크릿→crm membership-query).
// ★배포 전 초안(SPEC §8 하드게이트). PII 봉쇄 핵심: 정확한 전체 번호 1건만(부분/목록은 crm 이 거부).
import { corsHeaders } from '../_shared/cors.ts'
import { gate, rateLimitAndAudit, callCrm, json } from '../_shared/membershipGate.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const g = await gate(req)
  if (!g.ok) return g.res

  let phone = ''
  try { phone = String((await req.json())?.phone ?? '').replace(/\D/g, '') } catch { /* noop */ }
  // 브라우저에서도 1차 차단(정식 거부는 crm): 10자리 미만이면 조회 안 함.
  if (phone.length < 10) return json({ found: false })

  const limited = await rateLimitAndAudit(g, 'lookup', null)
  if (limited) return limited

  return callCrm(g, 'membership-query', { phone })
})
