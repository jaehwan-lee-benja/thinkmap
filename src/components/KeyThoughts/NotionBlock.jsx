import React, { useState, useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'

// 노션 스타일 블록 컴포넌트
// 드래그 가능한 Notion 블록 (Sortable 래퍼)
function SortableNotionBlock({
  block,
  blocks,
  setBlocks,
  focusedBlockId,
  setFocusedBlockId,
  parentBlock,
  rootSetBlocks,
  draggingChildIds = [],
  activeId,
  overId,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  // 노션 방식: 드래그 중에는 블록들이 움직이지 않음
  const isActive = block.id === activeId
  // over 위치인 경우 얇은 선 표시
  const isOver = block.id === overId && activeId && activeId !== overId

  const style = {
    // transform 제거 - 블록이 움직이지 않도록
    cursor: 'grab',
    opacity: isActive ? 0.4 : 1, // 드래그 중인 블록은 약간 투명하게
    borderTop: isOver
      ? '2px solid rgba(99, 102, 241, 0.8)' // over 시 보라색 선
      : '2px solid transparent', // 기본은 투명 (공간 확보)
  }

  return (
    <div ref={setNodeRef} style={style}>
      <NotionBlock
        block={block}
        blocks={blocks}
        setBlocks={setBlocks}
        focusedBlockId={focusedBlockId}
        setFocusedBlockId={setFocusedBlockId}
        dragHandleProps={{ ...attributes, ...listeners }}
        parentBlock={parentBlock}
        rootSetBlocks={rootSetBlocks}
        draggingChildIds={draggingChildIds}
        activeId={activeId}
        overId={overId}
      />
    </div>
  )
}

// Notion 블록 컴포넌트
function NotionBlock({
  block,
  blocks,
  setBlocks,
  focusedBlockId,
  setFocusedBlockId,
  dragHandleProps,
  parentBlock,
  rootSetBlocks,
  draggingChildIds = [],
  activeId,
  overId,
}) {
  const inputRef = useRef(null)
  const isProcessingEnter = useRef(false)

  useEffect(() => {
    if (focusedBlockId === block.id && inputRef.current) {
      inputRef.current.focus()
      // 커서를 끝으로 이동
      const length = inputRef.current.value.length
      inputRef.current.setSelectionRange(length, length)
    }
  }, [focusedBlockId, block.id])

  // textarea 높이 자동 조정
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px'
    }
  }, [block.content])

  const updateBlockInTree = (blocks, blockId, updater) => {
    return blocks.map(b => {
      if (b.id === blockId) {
        const updated = updater(b)
        // children이 없거나 배열이 아니면 빈 배열로 초기화 (불변성 유지)
        return {
          ...updated,
          children: Array.isArray(updated.children) ? updated.children : []
        }
      }
      if (Array.isArray(b.children) && b.children.length > 0) {
        return { ...b, children: updateBlockInTree(b.children, blockId, updater) }
      }
      return b
    })
  }

  const updateBlockContent = (content) => {
    setBlocks(prevBlocks =>
      updateBlockInTree(prevBlocks, block.id, (b) => ({ ...b, content }))
    )
  }

  const updateChildBlocks = (newChildren) => {
    setBlocks(prevBlocks =>
      updateBlockInTree(prevBlocks, block.id, (b) => ({
        ...b,
        children: typeof newChildren === 'function' ? newChildren(b.children) : newChildren
      }))
    )
  }

  const handleBlockControlClick = () => {
    // 토글 열기/닫기
    setBlocks(prevBlocks =>
      updateBlockInTree(prevBlocks, block.id, (b) => {
        const newIsOpen = !b.isOpen

        // 토글을 열 때 자식이 없으면 자동으로 1개 생성
        if (newIsOpen && (!Array.isArray(b.children) || b.children.length === 0)) {
          const newChildBlock = {
            id: Date.now() + Math.random(),
            type: 'toggle',
            content: '',
            children: [],
            isOpen: true
          }
          return { ...b, isOpen: newIsOpen, children: [newChildBlock] }
        }

        return { ...b, isOpen: newIsOpen, children: Array.isArray(b.children) ? b.children : [] }
      })
    )
  }

  const addChildBlock = () => {
    const newChildBlock = {
      id: Date.now() + Math.random(),
      type: 'toggle',
      content: '',
      children: [],
      isOpen: true
    }
    setBlocks(prevBlocks =>
      updateBlockInTree(prevBlocks, block.id, (b) => ({
        ...b,
        children: [...(Array.isArray(b.children) ? b.children : []), newChildBlock],
        isOpen: true // 자식 추가 시 자동으로 열기
      }))
    )
    setTimeout(() => setFocusedBlockId(newChildBlock.id), 0)
  }

  // 블록을 들여쓰기 (Tab) - 바로 위 형제 블록의 자식으로 이동
  const indentBlock = () => {
    const currentIndex = blocks.findIndex(b => b.id === block.id)
    if (currentIndex <= 0) return // 첫 번째 블록이면 들여쓰기 불가

    const prevSibling = blocks[currentIndex - 1]

    setBlocks(prevBlocks => {
      const newBlocks = [...prevBlocks]
      // 현재 블록을 현재 레벨에서 제거
      newBlocks.splice(currentIndex, 1)
      // 이전 형제 블록의 children에 추가
      const updatedPrevSibling = {
        ...prevSibling,
        children: [...(Array.isArray(prevSibling.children) ? prevSibling.children : []), block],
        isOpen: true // 자동으로 열기
      }
      newBlocks[currentIndex - 1] = updatedPrevSibling
      return newBlocks
    })
  }

  // 블록을 상위 레벨로 이동 (Shift+Tab)
  const outdentBlock = () => {
    if (!parentBlock || !rootSetBlocks) return

    rootSetBlocks(prevBlocks => {
      const outdentInTree = (blocks, targetParentId, childToMove) => {
        const result = []

        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i]

          // 부모 블록을 찾았을 때
          if (b.id === targetParentId) {
            // 부모의 children에서 현재 블록 제거
            const newChildren = b.children.filter(c => c.id !== childToMove.id)
            const updatedParent = { ...b, children: newChildren }
            result.push(updatedParent)
            // 부모 다음에 현재 블록 추가
            result.push(childToMove)
          } else {
            // 자식들을 재귀적으로 처리
            if (Array.isArray(b.children) && b.children.length > 0) {
              const newChildren = outdentInTree(b.children, targetParentId, childToMove)
              // children이 변경되었는지 확인
              if (newChildren !== b.children) {
                result.push({ ...b, children: newChildren })
              } else {
                result.push(b)
              }
            } else {
              result.push(b)
            }
          }
        }

        return result
      }

      // 자식이 없는 블록은 자동으로 닫기
      const autoCloseEmptyBlocks = (blockList) => {
        return blockList.map(block => {
          const hasChildren = Array.isArray(block.children) && block.children.length > 0
          if (!hasChildren && block.isOpen) {
            return { ...block, isOpen: false }
          }
          if (hasChildren) {
            return { ...block, children: autoCloseEmptyBlocks(block.children) }
          }
          return block
        })
      }

      const updated = outdentInTree(prevBlocks, parentBlock.id, block)
      return autoCloseEmptyBlocks(updated)
    })
  }

  // 보이는 블록들을 평탄화 (열려있는 블록의 자식들만 포함)
  const getFlattenedVisibleBlocks = (blocks) => {
    const result = []
    const traverse = (blockList) => {
      for (const b of blockList) {
        result.push(b)
        if (b.isOpen && Array.isArray(b.children) && b.children.length > 0) {
          traverse(b.children)
        }
      }
    }
    traverse(blocks)
    return result
  }

  const handleKeyDown = (e) => {
    // Enter 관련 처리를 먼저 체크
    if (e.key === 'Enter') {
      // Shift+Enter: textarea 내 줄바꿈 (기본 동작 허용)
      if (e.shiftKey) {
        // textarea의 기본 줄바꿈 동작 허용
        return
      }
      // Enter만: 새 블록 추가 (줄바꿈 방지)
      else {
        // 중복 실행 방지
        if (isProcessingEnter.current) {
          e.preventDefault()
          e.stopPropagation()
          return
        }

        e.preventDefault()
        e.stopPropagation()

        isProcessingEnter.current = true

        // 커서 위치 확인
        const cursorPosition = e.target.selectionStart

        const newBlock = {
          id: Date.now() + Math.random(),
          type: 'toggle',
          content: '',
          children: [],
          isOpen: true
        }

        if (cursorPosition === 0) {
          // 커서가 맨 앞: 현재 블록 앞에 빈 블록 추가
          setBlocks(prevBlocks => {
            const currentIndex = prevBlocks.findIndex(b => b.id === block.id)
            if (currentIndex === -1) return prevBlocks
            const newBlocks = [...prevBlocks]
            newBlocks.splice(currentIndex, 0, newBlock)  // 현재 블록 앞에 삽입
            return newBlocks
          })

          // 포커스는 현재 블록 유지 (텍스트가 있는 블록)
          setTimeout(() => {
            setFocusedBlockId(block.id)
            // 플래그 초기화
            setTimeout(() => {
              isProcessingEnter.current = false
            }, 100)
          }, 0)
        } else {
          // 커서가 맨 앞이 아님: 현재 블록 다음에 빈 블록 추가 (기존 로직)
          setBlocks(prevBlocks => {
            const currentIndex = prevBlocks.findIndex(b => b.id === block.id)
            if (currentIndex === -1) return prevBlocks
            const newBlocks = [...prevBlocks]
            newBlocks.splice(currentIndex + 1, 0, newBlock)
            return newBlocks
          })

          setTimeout(() => {
            setFocusedBlockId(newBlock.id)
            // 플래그 초기화
            setTimeout(() => {
              isProcessingEnter.current = false
            }, 100)
          }, 0)
        }
      }
    }
    // Shift+Tab: 상위 레벨로 이동 (outdent)
    else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      if (parentBlock && rootSetBlocks) {
        outdentBlock()
      }
    }
    // Tab: 바로 위 블록의 자식으로 들여쓰기 (indent)
    else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      indentBlock()
    }
    // Backspace: 커서가 맨 앞이고 내용이 비어있으면 블록 삭제
    else if (e.key === 'Backspace') {
      const cursorPosition = e.target.selectionStart
      const isEmpty = block.content === ''
      const isAtStart = cursorPosition === 0

      // 비어있거나 커서가 맨 앞에 있을 때 삭제
      if ((isEmpty || isAtStart)) {
        // 전체 트리의 루트 블록 가져오기
        const getRootBlocks = () => {
          if (rootSetBlocks) {
            let rootBlocks = []
            rootSetBlocks(prev => {
              rootBlocks = prev
              return prev
            })
            return rootBlocks
          }
          return blocks
        }
        const rootBlocks = getRootBlocks()
        const visibleBlocks = getFlattenedVisibleBlocks(rootBlocks)
        const currentIndex = visibleBlocks.findIndex(b => b.id === block.id)

        // 첫 번째 블록이 아닐 때만 삭제
        if (currentIndex > 0) {
          e.preventDefault()
          e.stopPropagation()

          // 이전 블록으로 포커스 이동
          const prevBlock = visibleBlocks[currentIndex - 1]

          // 현재 블록 삭제 - 트리 전체에서 삭제
          const deleteBlockFromTree = (blocks, blockIdToDelete) => {
            return blocks
              .filter(b => b.id !== blockIdToDelete)
              .map(b => {
                if (Array.isArray(b.children) && b.children.length > 0) {
                  return { ...b, children: deleteBlockFromTree(b.children, blockIdToDelete) }
                }
                return b
              })
          }

          // 자식이 없는 블록은 자동으로 닫기
          const autoCloseEmptyBlocks = (blockList) => {
            return blockList.map(block => {
              const hasChildren = Array.isArray(block.children) && block.children.length > 0
              if (!hasChildren && block.isOpen) {
                return { ...block, isOpen: false }
              }
              if (hasChildren) {
                return { ...block, children: autoCloseEmptyBlocks(block.children) }
              }
              return block
            })
          }

          if (rootSetBlocks) {
            rootSetBlocks(prevBlocks => {
              const updated = deleteBlockFromTree(prevBlocks, block.id)
              return autoCloseEmptyBlocks(updated)
            })
          } else {
            setBlocks(prevBlocks => {
              const updated = deleteBlockFromTree(prevBlocks, block.id)
              return autoCloseEmptyBlocks(updated)
            })
          }

          // 이전 블록으로 포커스 이동 및 커서를 끝으로
          setTimeout(() => {
            setFocusedBlockId(prevBlock.id)
          }, 0)
        }
      }
    }
    // ArrowUp: 시각적으로 위에 보이는 블록으로 이동
    else if (e.key === 'ArrowUp' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      // 전체 트리의 루트 블록 가져오기
      const getRootBlocks = () => {
        // rootSetBlocks가 있으면 최상위, 없으면 현재 레벨
        if (rootSetBlocks) {
          let rootBlocks = []
          rootSetBlocks(prev => {
            rootBlocks = prev
            return prev
          })
          return rootBlocks
        }
        return blocks
      }
      const rootBlocks = getRootBlocks()
      const visibleBlocks = getFlattenedVisibleBlocks(rootBlocks)
      const currentIndex = visibleBlocks.findIndex(b => b.id === block.id)
      if (currentIndex > 0) {
        setFocusedBlockId(visibleBlocks[currentIndex - 1].id)
      }
    }
    // ArrowDown: 시각적으로 아래에 보이는 블록으로 이동
    else if (e.key === 'ArrowDown' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      // 전체 트리의 루트 블록 가져오기
      const getRootBlocks = () => {
        if (rootSetBlocks) {
          let rootBlocks = []
          rootSetBlocks(prev => {
            rootBlocks = prev
            return prev
          })
          return rootBlocks
        }
        return blocks
      }
      const rootBlocks = getRootBlocks()
      const visibleBlocks = getFlattenedVisibleBlocks(rootBlocks)
      const currentIndex = visibleBlocks.findIndex(b => b.id === block.id)
      if (currentIndex < visibleBlocks.length - 1) {
        setFocusedBlockId(visibleBlocks[currentIndex + 1].id)
      }
    }
  }

  return (
    <div className="notion-block">
      {/* 드래그 핸들 */}
      {dragHandleProps && (
        <div className="notion-drag-handle" {...dragHandleProps} title="드래그하여 이동">
          ∷
        </div>
      )}

      <div className="notion-block-controls">
        <button
          className="block-type-button"
          onClick={handleBlockControlClick}
          title="클릭: 열기/닫기"
          style={{
            transform: block.isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}
        >
          ▶
        </button>
      </div>
      <div className="notion-block-content">
        <textarea
          ref={inputRef}
          value={block.content}
          onChange={(e) => updateBlockContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocusedBlockId(block.id)}
          placeholder=""
          className="notion-block-input"
          rows={1}
        />
      </div>

      {/* 자식 블록들 렌더링 */}
      {block.isOpen && Array.isArray(block.children) && block.children.length > 0 && (
        <div className="notion-block-children">
          {block.children.map((childBlock) => (
            <SortableNotionBlock
              key={childBlock.id}
              block={childBlock}
              blocks={block.children}
              setBlocks={updateChildBlocks}
              focusedBlockId={focusedBlockId}
              setFocusedBlockId={setFocusedBlockId}
              parentBlock={block}
              rootSetBlocks={rootSetBlocks || setBlocks}
              draggingChildIds={draggingChildIds}
              activeId={activeId}
              overId={overId}
            />
          ))}
        </div>
      )}
    </div>
  )
}


export { SortableNotionBlock, NotionBlock }
