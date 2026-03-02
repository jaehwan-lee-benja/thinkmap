import React, { useState, useEffect } from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'

/**
 * 순서 번호 계산 - 같은 레벨에서 연속된 ordered 블록 수를 셈
 * 비-ordered 블록을 만나면 카운트 리셋
 */
function computeOrderedNumber(editor, getPos) {
  try {
    const pos = getPos()
    if (pos === undefined) return null
    // pos+1 로 resolve하면 toggle 노드 안쪽 depth로 들어감
    const $pos = editor.state.doc.resolve(pos + 1)
    const depth = $pos.depth
    const parent = $pos.node(depth - 1)
    const indexInParent = $pos.index(depth - 1)
    let count = 0
    for (let i = 0; i <= indexInParent; i++) {
      const child = parent.child(i)
      if (child.attrs?.blockType === 'ordered') count++
      else count = 0
    }
    return count > 0 ? count : null
  } catch {
    return null
  }
}

function ToggleView({ node, updateAttributes, editor, getPos }) {
  const { isOpen: isOpenAttr, blockType } = node.attrs

  // Local state for immediate visual feedback — decoupled from ProseMirror's flushSync path
  const [isOpen, setIsOpen] = useState(isOpenAttr)

  // Sync local state when ProseMirror attribute changes externally (e.g., undo/redo)
  useEffect(() => {
    setIsOpen(isOpenAttr)
  }, [isOpenAttr])

  // ordered 블록의 순서 번호 (sibling 변경 시에도 갱신)
  const [orderedNumber, setOrderedNumber] = useState(() => {
    if (blockType !== 'ordered' || !editor || !getPos) return null
    return computeOrderedNumber(editor, getPos)
  })

  useEffect(() => {
    if (blockType !== 'ordered' || !editor || !getPos) {
      setOrderedNumber(null)
      return
    }
    // 초기값 설정
    setOrderedNumber(computeOrderedNumber(editor, getPos))
    // editor 업데이트 시 재계산 (sibling 변경 반영)
    const onUpdate = () => {
      setOrderedNumber(computeOrderedNumber(editor, getPos))
    }
    editor.on('update', onUpdate)
    return () => editor.off('update', onUpdate)
  }, [editor, blockType, getPos])

  // onMouseDown + preventDefault: ProseMirror-idiomatic 방식
  // onClick 대신 onMouseDown을 써야 ProseMirror가 cursor/selection 이벤트를
  // 가로채기 전에 토글 동작을 먼저 처리할 수 있음
  const handleToggleMouseDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const newIsOpen = !isOpen
    setIsOpen(newIsOpen)
    updateAttributes({ isOpen: newIsOpen })
  }

  return (
    <NodeViewWrapper
      className="toggle-block"
      data-block-type={blockType || 'paragraph'}
      data-is-open={isOpen}
    >
      <button
        className="toggle-button"
        contentEditable={false}
        onMouseDown={handleToggleMouseDown}
      >
        {isOpen ? '▼' : '▶'}
      </button>
      <span
        className="toggle-marker"
        contentEditable={false}
        data-number={orderedNumber ?? undefined}
      />
      <NodeViewContent className={`toggle-content ${isOpen ? 'open' : 'closed'}`} />
    </NodeViewWrapper>
  )
}

export default ToggleView
