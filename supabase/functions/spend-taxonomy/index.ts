// GET /spend-taxonomy — 인라인 세부 선택지(대분류 → 세부 2단). 계약 asset/spend-edge@1.3 §2-3.
//
// ★서버가 목록의 «정본»이다. 위성은 자기 목록을 갖지 않는다 — 두 곳에 두면 반드시 어긋난다.
// ★세부 이름은 회원님이 이카운트에서 쓰는 계정과목 그대로다(`잡비(판)1 - 식대` 같은 표기).
//   읽기 좋게 다듬지 않는다 — 지출결의서와 1:1 대사가 되는 게 더 값지다.
// ★꺼진 항목(is_active=false)은 안 나온다. «지우기»가 실제로는 «끄기»라, 과거에 그 세부로
//   분류된 행은 그대로 살아 있다(지우면 과거가 끊긴다).
import { authed, requireViewer, rateLimited, preflight, ok, err } from '../_shared/spendEdge.ts'

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre
  if (req.method !== 'GET' && req.method !== 'POST') return err(req, 400, 'bad_request', 'GET 또는 POST 만 허용됩니다.')

  const a = await authed(req); if (a instanceof Response) return a
  const rl = rateLimited(req, a.userId); if (rl) return rl
  const denied = await requireViewer(req, a.client); if (denied) return denied

  if (req.method === 'GET') {
    const { data, error } = await a.client.rpc('spend_taxonomy')
    if (error) return err(req, 500, 'server_error', '세부 목록을 불러오지 못했습니다.')
    return ok(req, data)
  }

  // ★«세부 추가»는 여기 못 단다 — 두 경로가 다 막혀 있다(실측):
  //   ⒜ 계약 §2-3 의 「위성이 spend.spend_taxonomy 에 직접 INSERT」 → `spend` 스키마가 PostgREST 에
  //      노출돼 있지 않다(`Accept-Profile: spend` → **406**). 노출시키면 §3·§10 비노출 규율이 깨진다.
  //   ⒝ Edge 가 대신 `.schema('spend')` 로 넣기 → 같은 PostgREST 를 타므로 **같은 406**이다.
  //   ⇒ 남은 길은 `public` 에 SECURITY DEFINER 함수 하나(예: `spend_taxonomy_add(name, category)`)뿐인데
  //      그건 DDL 이라 게이트 뒤다. asset 에 청구했다. 함수가 오면 여기에 POST 를 붙인다.
  return err(req, 400, 'bad_request', '세부 추가는 아직 지원되지 않습니다(DB 함수 대기).')
})
