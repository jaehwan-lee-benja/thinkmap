/**
 * TipTap 콘텐츠 마이그레이션 유틸리티
 * 기존 paragraph/heading/list 형식 → 범용 toggle 형식으로 변환
 */

function migrateListItem(item, blockType) {
  const children = item.content || []
  const firstParagraph = children[0]
  const rest = children.slice(1)

  const toggleContent = []
  if (firstParagraph?.type === 'paragraph') {
    toggleContent.push({ type: 'paragraph', content: firstParagraph.content || [] })
  } else {
    toggleContent.push({ type: 'paragraph', content: [] })
  }
  for (const child of rest) {
    const migrated = migrateNode(child)
    if (Array.isArray(migrated)) toggleContent.push(...migrated)
    else toggleContent.push(migrated)
  }
  return { type: 'toggle', attrs: { isOpen: true, blockType }, content: toggleContent }
}

export function migrateNode(node) {
  switch (node.type) {
    case 'orderedList':
      return (node.content || []).map(item => migrateListItem(item, 'ordered'))
    case 'bulletList':
      return (node.content || []).map(item => migrateListItem(item, 'bullet'))
    case 'paragraph':
      return { type: 'toggle', attrs: { isOpen: true, blockType: 'paragraph' }, content: [{ type: 'paragraph', content: node.content || [] }] }
    case 'heading': {
      const level = node.attrs?.level || 1
      return { type: 'toggle', attrs: { isOpen: true, blockType: `h${level}` }, content: [{ type: 'paragraph', content: node.content || [] }] }
    }
    case 'toggle': {
      const children = node.content || []
      const newContent = []
      if (children.length > 0) {
        newContent.push(children[0]) // 헤더 paragraph는 그대로
      }
      for (const child of children.slice(1)) {
        const migrated = migrateNode(child)
        if (Array.isArray(migrated)) newContent.push(...migrated)
        else newContent.push(migrated)
      }
      return { ...node, attrs: { isOpen: true, blockType: 'paragraph', ...node.attrs }, content: newContent }
    }
    default:
      return node
  }
}

export function migrateContent(json) {
  if (!json?.content) return json
  const result = []
  for (const node of json.content) {
    const migrated = migrateNode(node)
    if (Array.isArray(migrated)) result.push(...migrated)
    else result.push(migrated)
  }
  return { ...json, content: result }
}

export function needsMigration(json) {
  if (!json?.content || json.content.length === 0) return false
  return json.content.some(node => node.type !== 'toggle')
}
