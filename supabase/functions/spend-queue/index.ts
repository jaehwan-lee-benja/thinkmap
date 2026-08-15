// GET /spend-queue — 미분류 품목을 «금액 내림차순»으로. 계약 asset/spend-edge@1 v1.1 §2-1.
//
// ★커서는 «금액 단독»이 아니라 (amount, item_key) 복합이다(v1.1 채택).
//   실측 근거: 실데이터 178종 중 «동점 금액» 26그룹·82종(49,990원 3종 등).
//   금액만으로 자르면 `<` 는 형제를 건너뛰고 `<=` 는 중복시킨다. 82종이 그 위험 구간이었다.
//   item_key 는 이미 유일·불투명이라 타이브레이커로 써도 «추가 노출 0» 이다.
import { authed, requireViewer, rateLimited, preflight, ok, err } from '../_shared/spendEdge.ts'

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre
  if (req.method !== 'GET') return err(req, 400, 'bad_request', 'GET 만 허용됩니다.')

  const a = await authed(req); if (a instanceof Response) return a
  const rl = rateLimited(req, a.userId); if (rl) return rl
  const denied = await requireViewer(req, a.client); if (denied) return denied

  const u = new URL(req.url)
  const limitRaw = Number(u.searchParams.get('limit') ?? '50')
  if (!Number.isFinite(limitRaw) || limitRaw < 1 || limitRaw > 200) {
    return err(req, 400, 'bad_request', 'limit 은 1~200 입니다.')
  }
  // 커서: base64url({a: number, k: string}). 형이 어긋나면 «조용히 처음부터»가 아니라 400 이다
  // — 조용히 되감으면 사용자가 앞부분을 다시 보게 되고 그걸 «중복»으로 신고한다.
  let cur: { a: number; k: string } | null = null
  const c = u.searchParams.get('cursor')
  if (c) {
    try {
      const j = JSON.parse(atob(c.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (c.length % 4)) % 4)))
      if (typeof j?.a !== 'number' || typeof j?.k !== 'string') throw new Error('shape')
      cur = j
    } catch { return err(req, 400, 'bad_request', 'cursor 형식이 올바르지 않습니다.') }
  }

  const { data, error } = await a.client.rpc('spend_queue', {
    p_limit: limitRaw, p_cursor_amount: cur?.a ?? null, p_cursor_key: cur?.k ?? null,
  })
  if (error) {
    if ((error.message ?? '').includes('touch_updated_at')) {
      return err(req, 500, 'server_error', 'touch_updated_at 권한 오류 — 보고 필요(예고된 함정)')
    }
    return err(req, 500, 'server_error', '큐를 불러오지 못했습니다.')
  }
  return ok(req, data)
})
