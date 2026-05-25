// row → TipTap doc 변환 (read 경로). WORKLOG-SPEC.md §3.7.
//
// 입력: DailyBlock[] (camelCase)
// 출력: TipTap doc { type: 'doc', content: [...] }
//
// 규칙:
//   - deleted_at 이 있는 row 는 제외
//   - parentBlockId === null 인 row 들이 doc.content 의 최상위
//   - 자식은 부모의 content 배열 안에 (paragraph 본문 뒤)
//   - 정렬: position asc, 동률 시 createdAt asc (R4)
//   - section row → toggle 노드 (attrs.blockType = 'h2'). content[0] = bold paragraph.
//   - toggle row → toggle 노드 (attrs.blockType = 'paragraph' 등). content[0] = richContent[0].
//   - sectionId == blockId (R6) — 섹션 row 의 자기참조

export function blocksToDoc(blocks) {
  const live = (blocks || []).filter(b => !b.deletedAt)

  // children map
  const childrenByParent = new Map()
  const ROOT = '__root__'
  for (const b of live) {
    const key = b.parentBlockId ?? ROOT
    if (!childrenByParent.has(key)) childrenByParent.set(key, [])
    childrenByParent.get(key).push(b)
  }

  // 정렬: position asc, createdAt asc (R4)
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position
      return (a.createdAt || '').localeCompare(b.createdAt || '')
    })
  }

  const roots = childrenByParent.get(ROOT) || []
  return sanitizeDoc({
    type: 'doc',
    content: roots.map(b => blockToNode(b, childrenByParent)),
  })
}

// TipTap 은 빈 text node ({type:'text', text:''}) 를 거부 ('Empty text nodes are not allowed').
// row 의 textContent 가 '' 거나 richContent 가 손상된 경우 doc 전체 로드가 실패해서
// 에디터가 빈 doc 으로 떨어진다. 그 상태에서 onUpdate 가 발사되면 mass softDelete 위험.
// → doc 트리를 한 번 더 정화: 빈 text node 제거, 자식이 비게 된 paragraph 도 정리.
function sanitizeDoc(node) {
  if (!node || typeof node !== 'object') return node
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text.length === 0) return null
    return node
  }
  if (Array.isArray(node.content)) {
    const cleaned = node.content.map(sanitizeDoc).filter(c => c !== null)
    return { ...node, content: cleaned }
  }
  return node
}

function blockToNode(block, childrenByParent) {
  const children = (childrenByParent.get(block.blockId) || [])
    .map(c => blockToNode(c, childrenByParent))

  if (block.blockType === 'section') {
    const attrs = {
      blockId: block.blockId,
      blockType: 'h2',
      sectionId: block.sectionId,
      isFixedSection: block.isFixedSection,
      visibility: block.visibility,
      isOpen: block.isOpen !== false,
    }
    if (block.sectionMasterId != null) attrs.sectionMasterId = block.sectionMasterId
    if (block.backgroundColor != null) attrs.backgroundColor = block.backgroundColor
    return {
      type: 'toggle',
      attrs,
      content: [
        sectionTitleParagraph(block.textContent || ''),
        ...children,
      ],
    }
  }

  // toggle (todo 또는 일반)
  const attrs = {
    blockId: block.blockId,
    isTodo: block.isTodo,
    todoChecked: block.todoChecked,
    isCarryOver: block.isCarryOver,
    isPinned: block.isPinned,
    isOpen: block.isOpen !== false,
    visibility: block.visibility,
    blockType: 'paragraph',
  }
  if (block.carryOverFrom != null) attrs.carryOverFrom = block.carryOverFrom
  if (block.originBlockId != null) attrs.originBlockId = block.originBlockId
  if (block.backgroundColor != null) attrs.backgroundColor = block.backgroundColor

  const body = block.richContent && block.richContent.length > 0
    ? block.richContent
    : [paragraphFromText(block.textContent || '')]

  return {
    type: 'toggle',
    attrs,
    content: [...body, ...children],
  }
}

function sectionTitleParagraph(title) {
  if (!title) return { type: 'paragraph', content: [] }
  return {
    type: 'paragraph',
    content: [{ type: 'text', marks: [{ type: 'bold' }], text: title }],
  }
}

function paragraphFromText(text) {
  if (!text) return { type: 'paragraph', content: [] }
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

// docsEqual — deep equality. 키 순서 무시, 배열 순서는 유지.
export function docsEqual(a, b) {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!docsEqual(a[i], b[i])) return false
    }
    return true
  }
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!docsEqual(a[k], b[k])) return false
  }
  return true
}
