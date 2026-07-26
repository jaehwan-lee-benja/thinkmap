// Edge: membership-list — ★회원 검색(직원용) 프록시(직원게이트+감사+시크릿→crm membership-list).
// 유저결정(161·169): 스토어 계정 열람 허용 + ★검색필수 + 서버측 마스킹(성만·전화 끝4자리·상태).
//   전체 다운로드 없음 — 검색어(q)를 crm 이 원본으로 검색해 **마스킹된 매치만** 반환. 매우 엄격 레이트리밋(list:6/60s).
import { corsHeaders } from '../_shared/cors.ts'
import { gate, rateLimitAndAudit, callCrm, json } from '../_shared/membershipGate.ts'

const MIN_LEN = 2 // crm 확정: 검색어 min2(2자 미만은 열거 방지 위해 프록시가 먼저 차단).

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const g = await gate(req)
  if (!g.ok) return g.res

  let body: any = {}
  try { body = await req.json() } catch { /* noop */ }
  const q = String(body?.q ?? body?.search ?? '').trim()
  // ★검색필수(min2): 빈/짧은 검색어는 거부(전체 명단 덤프 방지). crm RPC 도 min2·LIMIT20.
  if (q.length < MIN_LEN) return json({ members: [] })

  const limited = await rateLimitAndAudit(g, 'list', null)
  if (limited) return limited

  // crm Edge 입력 = {search}. crm 이 원본 검색 + 마스킹(성만·끝4자리)·member_id 미반환 후 매치만 반환.
  return callCrm(g, 'membership-list', { search: q })
})
