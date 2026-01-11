/**
 * 기존 블록 데이터를 TipTap JSON으로 변환
 *
 * 기존 블록 구조:
 * { id, content, type, parent_id, position, depth, is_open, children }
 *
 * TipTap JSON 구조:
 * { type: 'doc', content: [...nodes] }
 */

/**
 * 단일 블록을 TipTap 노드로 변환
 */
function convertBlockToNode(block) {
  const { type, content, children, isOpen, is_open } = block
  const open = isOpen !== undefined ? isOpen : is_open

  // 블록 타입에 따라 변환
  switch (type) {
    case 'heading1':
      return {
        type: 'heading',
        attrs: { level: 1 },
        content: content ? [{ type: 'text', text: content }] : []
      }

    case 'heading2':
      return {
        type: 'heading',
        attrs: { level: 2 },
        content: content ? [{ type: 'text', text: content }] : []
      }

    case 'heading3':
      return {
        type: 'heading',
        attrs: { level: 3 },
        content: content ? [{ type: 'text', text: content }] : []
      }

    case 'toggle':
      // 토글 블록: 첫 번째 줄은 제목, 나머지는 children
      const toggleContent = []

      // 토글 제목 (첫 번째 paragraph)
      toggleContent.push({
        type: 'paragraph',
        content: content ? [{ type: 'text', text: content }] : []
      })

      // 자식 블록들 재귀 변환
      if (Array.isArray(children) && children.length > 0) {
        children.forEach(child => {
          toggleContent.push(convertBlockToNode(child))
        })
      }

      return {
        type: 'toggle',
        attrs: { isOpen: open !== false },
        content: toggleContent
      }

    case 'text':
    default:
      // 일반 텍스트 → paragraph
      return {
        type: 'paragraph',
        content: content ? [{ type: 'text', text: content }] : []
      }
  }
}

/**
 * 블록 트리를 TipTap 문서로 변환
 * @param {Array} blocks - 블록 트리 배열
 * @returns {Object} TipTap JSON document
 */
export function convertBlocksToTiptap(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }]
    }
  }

  const content = blocks.map(block => convertBlockToNode(block))

  return {
    type: 'doc',
    content
  }
}

/**
 * 평탄한 블록 배열을 트리로 변환 후 TipTap으로 변환
 * @param {Array} flatBlocks - DB에서 가져온 평탄한 블록 배열
 * @returns {Object} TipTap JSON document
 */
export function convertFlatBlocksToTiptap(flatBlocks) {
  if (!Array.isArray(flatBlocks) || flatBlocks.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }]
    }
  }

  // 1. 트리 구조로 변환
  const map = {}
  const roots = []

  // ID를 key로 하는 맵 생성
  flatBlocks.forEach(block => {
    map[block.id] = {
      ...block,
      children: []
    }
  })

  // 부모-자식 연결
  flatBlocks.forEach(block => {
    if (block.parent_id === null || block.parent_id === undefined) {
      roots.push(map[block.id])
    } else {
      const parent = map[block.parent_id]
      if (parent) {
        parent.children.push(map[block.id])
      } else {
        // orphan → 최상위로
        roots.push(map[block.id])
      }
    }
  })

  // position으로 정렬
  const sortByPosition = (nodes) => {
    nodes.sort((a, b) => (a.position || 0) - (b.position || 0))
    nodes.forEach(node => {
      if (node.children.length > 0) {
        sortByPosition(node.children)
      }
    })
  }
  sortByPosition(roots)

  // 2. TipTap으로 변환
  return convertBlocksToTiptap(roots)
}

export default convertBlocksToTiptap
