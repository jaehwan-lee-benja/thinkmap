/**
 * TipTap JSON <-> ColumnView blocks 변환 유틸리티
 */

/**
 * UUID 생성 함수
 */
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * TipTap 노드에서 텍스트 추출
 */
const extractTextFromNode = (node) => {
  if (!node) return ''

  if (node.type === 'text') {
    return node.text || ''
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromNode).join('')
  }

  return ''
}

/**
 * TipTap JSON을 ColumnView blocks로 변환
 */
export const tiptapToColumnBlocks = (tiptapContent, depth = 0) => {
  if (!tiptapContent || !tiptapContent.content) return []

  const blocks = []

  for (const node of tiptapContent.content) {
    if (node.type === 'toggle') {
      // 토글 노드 처리
      const block = {
        id: node.attrs?.id || generateUUID(),
        type: 'toggle',
        content: '',
        children: [],
        isOpen: node.attrs?.isOpen !== false,
        depth,
      }

      // 토글 내용에서 첫 번째 paragraph를 content로, 나머지 toggle을 children으로
      if (node.content && Array.isArray(node.content)) {
        let foundFirstParagraph = false

        for (const child of node.content) {
          if (child.type === 'paragraph' && !foundFirstParagraph) {
            block.content = extractTextFromNode(child)
            foundFirstParagraph = true
          } else if (child.type === 'toggle') {
            // 중첩 토글은 children으로
            const childBlocks = tiptapToColumnBlocks({ content: [child] }, depth + 1)
            block.children.push(...childBlocks)
          } else if (child.type === 'paragraph' && foundFirstParagraph) {
            // 추가 paragraph는 content에 줄바꿈으로 추가
            const text = extractTextFromNode(child)
            if (text) {
              block.content += '\n' + text
            }
          }
        }
      }

      blocks.push(block)
    } else if (node.type === 'paragraph') {
      // 일반 paragraph는 토글이 아닌 블록으로
      const text = extractTextFromNode(node)
      if (text.trim()) {
        blocks.push({
          id: generateUUID(),
          type: 'paragraph',
          content: text,
          children: [],
          depth,
        })
      }
    } else if (node.type === 'heading') {
      // 헤딩
      const text = extractTextFromNode(node)
      blocks.push({
        id: generateUUID(),
        type: 'heading',
        content: text,
        level: node.attrs?.level || 1,
        children: [],
        depth,
      })
    }
  }

  return blocks
}

/**
 * ColumnView blocks를 TipTap JSON으로 변환
 */
export const columnBlocksToTiptap = (blocks) => {
  if (!blocks || blocks.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }]
    }
  }

  const convertBlock = (block) => {
    if (block.type === 'toggle') {
      const content = []

      // 첫 번째 paragraph로 content 추가
      if (block.content) {
        const lines = block.content.split('\n')
        for (const line of lines) {
          content.push({
            type: 'paragraph',
            content: line ? [{ type: 'text', text: line }] : []
          })
        }
      } else {
        content.push({ type: 'paragraph', content: [] })
      }

      // children을 중첩 토글로 변환
      if (block.children && block.children.length > 0) {
        for (const child of block.children) {
          content.push(convertBlock(child))
        }
      }

      return {
        type: 'toggle',
        attrs: { isOpen: block.isOpen !== false },
        content
      }
    } else if (block.type === 'heading') {
      return {
        type: 'heading',
        attrs: { level: block.level || 1 },
        content: block.content ? [{ type: 'text', text: block.content }] : []
      }
    } else {
      // paragraph
      return {
        type: 'paragraph',
        content: block.content ? [{ type: 'text', text: block.content }] : []
      }
    }
  }

  return {
    type: 'doc',
    content: blocks.map(convertBlock)
  }
}

/**
 * 블록 ID로 블록 찾기
 */
export const findBlockById = (blocks, id) => {
  for (const block of blocks) {
    if (block.id === id) return block
    if (block.children && block.children.length > 0) {
      const found = findBlockById(block.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * 블록 업데이트 (immutable)
 */
export const updateBlockContent = (blocks, targetId, newContent) => {
  return blocks.map(block => {
    if (block.id === targetId) {
      return { ...block, content: newContent }
    }
    if (block.children && block.children.length > 0) {
      return {
        ...block,
        children: updateBlockContent(block.children, targetId, newContent)
      }
    }
    return block
  })
}

/**
 * 블록 삭제 (immutable)
 */
export const deleteBlock = (blocks, targetId) => {
  return blocks
    .filter(block => block.id !== targetId)
    .map(block => {
      if (block.children && block.children.length > 0) {
        return {
          ...block,
          children: deleteBlock(block.children, targetId)
        }
      }
      return block
    })
}

/**
 * 자식 블록 추가 (immutable)
 */
export const addChildBlock = (blocks, parentId) => {
  const newBlockId = generateUUID()

  const addChild = (blockList) => {
    return blockList.map(block => {
      if (block.id === parentId) {
        const newBlock = {
          id: newBlockId,
          type: 'toggle',
          content: '',
          children: [],
          isOpen: true,
          depth: (block.depth || 0) + 1,
        }
        return {
          ...block,
          children: [...(block.children || []), newBlock]
        }
      }
      if (block.children && block.children.length > 0) {
        return {
          ...block,
          children: addChild(block.children)
        }
      }
      return block
    })
  }

  return { blocks: addChild(blocks), newBlockId }
}
