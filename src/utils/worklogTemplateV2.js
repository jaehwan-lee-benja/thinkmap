// 새 daily 페이지의 section row 를 만드는 pure function. WORKLOG-SPEC.md §3.4, §3.7.
//
// 입력:
//   sections: worklog_sections row 배열 (snake_case 또는 camelCase 모두 허용 — 둘 다 흔함)
//             - 필수 필드: id, title
//             - 선택: section_type/sectionType, visibility, sort_order/sortOrder, parent_id/parentId
//   ctx:      { pageId, pageDate, userId }
//   opts:     { sectionOrder?: string[] }   - worklog_board_user_settings.section_order (board-scope)
//
// 출력: DailyBlock[] (block_type='section' row 들)
//
// 책임 경계:
//   - DB 조회는 호출자 (worklog_sections + worklog_board_user_settings 조회)
//   - 본 함수는 sections + ctx 만으로 row 들을 결정적으로 생성
//   - parent_id 가 있는 sub-section (h3) 도 row 로 만들되 parentBlockId 는 부모 section row 의 blockId

import { newBlockId } from './blockIdV2.js'

function read(s, snake, camel) {
  if (s == null) return undefined
  return s[snake] !== undefined ? s[snake] : s[camel]
}

export function buildDailyTemplateRows(sections, ctx, opts = {}) {
  if (!ctx?.pageId) throw new Error('buildDailyTemplateRows: ctx.pageId 필수')
  if (!Array.isArray(sections) || sections.length === 0) return []

  const sectionOrder = opts.sectionOrder || []
  const orderIndex = new Map(sectionOrder.map((id, i) => [id, i]))

  // 정렬: section_order 우선 → sort_order → created_at → title (모든 ties 결정적)
  const sorted = [...sections].sort((a, b) => {
    const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER
    const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    const as = read(a, 'sort_order', 'sortOrder') ?? 999
    const bs = read(b, 'sort_order', 'sortOrder') ?? 999
    if (as !== bs) return as - bs
    const ac = read(a, 'created_at', 'createdAt') || ''
    const bc = read(b, 'created_at', 'createdAt') || ''
    if (ac !== bc) return ac.localeCompare(bc)
    return (a.title || '').localeCompare(b.title || '')
  })

  // 1차: 마스터 id → 신규 blockId 매핑 (parent 참조 해결용)
  const idMap = new Map()
  for (const s of sorted) {
    idMap.set(s.id, newBlockId())
  }

  // 2차: row 생성
  // 위계: parent_id 가 있으면 그 부모의 신규 blockId 를 parentBlockId 로.
  //       없으면 null (최상위 h2). h2 자식 없을 수도 있으므로 단순 매핑.
  // position: 정렬 순서대로 1, 2, 3, ...
  return sorted.map((s, i) => {
    const blockId = idMap.get(s.id)
    const parentMasterId = read(s, 'parent_id', 'parentId') || null
    const parentBlockId = parentMasterId ? (idMap.get(parentMasterId) || null) : null
    const sectionType = read(s, 'section_type', 'sectionType') || 'fixed'
    const visibility = s.visibility || 'all'

    return {
      blockId,
      pageId: ctx.pageId,
      pageDate: ctx.pageDate,
      userId: ctx.userId,
      blockType: 'section',
      parentBlockId,
      sectionId: blockId,             // R6 self-ref
      sectionMasterId: s.id,           // §9.9 옵션 A
      position: i + 1,
      textContent: s.title || '',
      richContent: null,
      isTodo: false,
      todoChecked: false,
      todoStatus: 'open',
      isCarryOver: false,
      carryOverFrom: null,
      originBlockId: null,
      isPinned: false,
      visibility,
      isFixedSection: sectionType === 'fixed',
    }
  })
}
