// Edge: membership-list — ★회원 리스트(직원용 검색) 프록시(직원게이트+감사+시크릿→crm membership-list).
// ⚠️★보안: 계약 §5 "목록·부분검색 금지"를 뒤집는 전량 PII(이름+전화). 유저 결정 게이트 승인 전엔
//   crm membership-list Edge 를 배포하지 않는다. 배포 시에도: 매우 엄격한 레이트리밋(list:6/60s)·감사 필수.
//   ★게이트 강화 옵션(유저 결정): 아래 gate 통과 후 추가로 is_master 만 허용할지(공유 store 태블릿엔 과노출)
//   — 현재는 gate(is_master OR is_store) 그대로. 결정에 따라 여기서 g 를 재검사.
import { corsHeaders } from '../_shared/cors.ts'
import { gate, rateLimitAndAudit, callCrm, json } from '../_shared/membershipGate.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const g = await gate(req)
  if (!g.ok) return g.res

  const limited = await rateLimitAndAudit(g, 'list', null)
  if (limited) return limited

  return callCrm(g, 'membership-list', {})
})
