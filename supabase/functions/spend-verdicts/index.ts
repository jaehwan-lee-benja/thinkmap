// POST /spend-verdicts — 판정 저장(멱등). 계약 asset/spend-edge@1.3 §2-2.
//
// ★버튼→내부 축 매핑은 «서버가» 한다. 위성은 scope/category 를 보내지 않는다
//   — 두 축이 UI 에 새면 UI 가 데이터 모델을 알게 된다(계약 문면 그대로).
// ★'보류' 는 아무것도 쓰지 않는다. 저장 0행이 «정상»이고 실패가 아니다.
// ★v1.3: subcategory_id·note 는 «선택»이다. 안 오면 v1.2 와 똑같이 동작한다.
//   그리고 **세부가 대분류를 이긴다** — 세부가 오면 대분류는 taxonomy 를 따른다(서버가 정한다).
//   위성이 보내는 button 은 «빠른 기본값»이지 최종 판정이 아니다.
import { authed, requireViewer, rateLimited, preflight, ok, err } from '../_shared/spendEdge.ts'

const BUTTONS = ['사업-원재료', '사업-운영', '개인', '보류']
const MAX_BATCH = 200

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre
  if (req.method !== 'POST') return err(req, 400, 'bad_request', 'POST 만 허용됩니다.')

  const a = await authed(req); if (a instanceof Response) return a
  const rl = rateLimited(req, a.userId); if (rl) return rl
  const denied = await requireViewer(req, a.client); if (denied) return denied

  let body: { verdicts?: Array<{ item_key?: string; button?: string; subcategory_id?: string; note?: string }> }
  try { body = await req.json() } catch { return err(req, 400, 'bad_request', 'JSON 형식이 올바르지 않습니다.') }
  const list = body?.verdicts
  if (!Array.isArray(list) || list.length === 0) return err(req, 400, 'bad_request', 'verdicts 배열이 필요합니다.')
  if (list.length > MAX_BATCH) return err(req, 400, 'bad_request', `배치는 ${MAX_BATCH}건까지입니다.`)
  for (const v of list) {
    if (!v?.item_key || typeof v.item_key !== 'string') return err(req, 400, 'bad_request', 'item_key 가 필요합니다.')
    // ★버튼명은 «서버가» 검증한다. 오타를 조용히 무시하면 판정이 사라진 걸 아무도 모른다.
    if (!BUTTONS.includes(v.button ?? '')) return err(req, 400, 'bad_request', `button 은 ${BUTTONS.join('|')} 중 하나입니다.`)
    // ★note 상한은 «서버가» 지킨다(계약 500자). 클라 검사만 믿으면 클라를 안 거친 호출에 뚫린다.
    if (v.note != null && (typeof v.note !== 'string' || v.note.length > 500)) {
      return err(req, 400, 'bad_request', 'note 는 500자 이하 문자열입니다.')
    }
    if (v.subcategory_id != null && typeof v.subcategory_id !== 'string') {
      return err(req, 400, 'bad_request', 'subcategory_id 는 문자열입니다.')
    }
  }

  // ★v2 를 부른다. 구판(spend_apply_verdicts)은 DB 에 «살아 있다» — 배포 순서를 서로 안 물어봐도
  //   되게 asset 이 남겨 뒀다. 여기서 v2 로 옮기는 것이 그 여유를 쓰는 시점이다.
  const { data, error } = await a.client.rpc('spend_apply_verdicts_v2', { p_verdicts: list })
  if (error) {
    // ★예고된 함정 — 이 엔드포인트가 «첫 UPDATE» 를 친다. 트리거 권한의 첫 검증이 여기서 난다.
    //   조용히 우회하면 원인이 사라지므로 그대로 올린다(계약 §4).
    if ((error.message ?? '').includes('touch_updated_at')) {
      return err(req, 500, 'server_error', 'touch_updated_at 권한 오류 — 보고 필요(예고된 함정). 복구: grant execute … to authenticated')
    }
    return err(req, 500, 'server_error', '판정을 저장하지 못했습니다.')
  }
  return ok(req, data)
})
