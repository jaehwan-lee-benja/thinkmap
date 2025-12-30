import React, { useState, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import './ViewerPage.css'

/**
 * UUID 생성 함수 (브라우저 호환)
 */
const generateUUID = () => {
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
 * 드래그 가능한 블럭 컴포넌트
 */
function SortableBlock({
  block,
  depth,
  isSelected,
  isCurrent,
  isOver,
  dropPosition,
  activeId,
  hasChildren,
  text,
  onClick,
  isEditing,
  editingText,
  onDoubleClick,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onAddChildBlock,
  onDeleteBlock,
  isReference,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
  } = useSortable({ id: block.id })

  const textareaRef = useRef(null)
  const skipBlurRef = useRef(false)

  // textarea 높이 자동 조정
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [isEditing, editingText])

  const isActive = block.id === activeId
  const showTopLine = isOver && dropPosition === 'top' && activeId && activeId !== block.id
  const showBottomLine = isOver && dropPosition === 'bottom' && activeId && activeId !== block.id
  const showAsChild = isOver && dropPosition === 'center' && activeId && activeId !== block.id

  const style = {
    cursor: isEditing ? 'text' : 'grab',
    opacity: isActive ? 0.4 : 1,
  }

  // 편집 중일 때는 드래그 비활성화
  const dragHandlers = isEditing ? {} : { ...attributes, ...listeners }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-block-id={block.id}
      data-drop-zone={isOver ? dropPosition : ''}
      className={`viewer-block ${isSelected ? 'selected' : ''} ${isCurrent ? 'current-selected' : ''} ${hasChildren ? 'has-children' : ''} ${showTopLine ? 'show-drop-line-top' : ''} ${showBottomLine ? 'show-drop-line-bottom' : ''} ${showAsChild ? 'show-as-child-target' : ''} ${isEditing ? 'editing' : ''} ${isReference ? 'is-reference' : ''}`}
      onClick={isEditing ? undefined : onClick}
      onDoubleClick={isEditing ? undefined : onDoubleClick}
      {...dragHandlers}
    >
      <div className="block-content-area">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="block-edit-input"
            value={editingText}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.stopPropagation()
                skipBlurRef.current = true
                onSaveEdit()
                if (textareaRef.current) {
                  textareaRef.current.blur()
                }
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                skipBlurRef.current = true
                onCancelEdit()
                if (textareaRef.current) {
                  textareaRef.current.blur()
                }
              }
            }}
            onBlur={() => {
              if (!skipBlurRef.current) {
                onSaveEdit()
              }
              skipBlurRef.current = false
            }}
            autoFocus
            rows={1}
          />
        ) : (
          <div className="block-text">
            {isReference && <span className="reference-badge">🔗</span>}
            {text || '내용 입력'}
          </div>
        )}
      </div>

      <div className="block-actions-area">
        {isEditing ? (
          <div className="block-edit-buttons">
            <button
              className="add-child-button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                onSaveEdit()
                onAddChildBlock(block.id)
              }}
              title="하위 블럭 만들기"
            >
              추가
            </button>
            <button
              className="delete-block-button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm('이 블럭을 삭제하시겠습니까?')) {
                  onDeleteBlock(block.id)
                }
              }}
              title="블럭 삭제"
            >
              삭제
            </button>
          </div>
        ) : (
          hasChildren && <div className="block-arrow">{isSelected ? '▶' : '▷'}</div>
        )}
      </div>
    </div>
  )
}

/**
 * ThinkMap 뷰어 페이지 (전체 화면 모드)
 */
function ViewerPage({ blocks = [], setBlocks, onSave, onClose }) {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [selectedPath, setSelectedPath] = useState([])
  const [activeBlock, setActiveBlock] = useState(null)
  const [overId, setOverId] = useState(null)
  const [dropPosition, setDropPosition] = useState(null)
  const [editingBlockId, setEditingBlockId] = useState(null)
  const [editingText, setEditingText] = useState('')

  const pointerPositionRef = useRef({ x: 0, y: 0 })
  const currentOverIdRef = useRef(null)
  const activeBlockIdRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 500,
        tolerance: 8,
      },
    })
  )

  // 선택된 블럭으로 자동 스크롤
  useEffect(() => {
    if (selectedPath.length === 0) return

    const currentDepth = selectedPath.length - 1
    const currentBlockId = selectedPath[currentDepth]

    if (currentBlockId) {
      setTimeout(() => {
        let element = null

        if (currentBlockId === 'ADD_BUTTON') {
          const columns = document.querySelectorAll('.viewer-column')
          if (columns[currentDepth]) {
            element = columns[currentDepth].querySelector('.add-block-button')
          }
        } else {
          element = document.querySelector(`[data-block-id="${currentBlockId}"]`)
        }

        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          })
        }
      }, 50)
    }
  }, [selectedPath])

  // 키보드 내비게이션
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (editingBlockId) return

      const currentDepth = selectedPath.length > 0 ? selectedPath.length - 1 : 0
      const currentBlockId = selectedPath[currentDepth]
      const isAddButtonSelected = currentBlockId === 'ADD_BUTTON'
      const currentBlocks = getBlocksAtDepth(currentDepth)
      const currentIndex = currentBlocks.findIndex(b => b.id === currentBlockId)

      switch (e.key) {
        case 'Enter': {
          e.preventDefault()
          if (isAddButtonSelected) {
            handleAddBlockToColumn(currentDepth)
          } else if (currentBlockId) {
            const block = findBlockById(blocks, currentBlockId)
            if (block) {
              setEditingBlockId(currentBlockId)
              setEditingText(block.content || '')
            }
          }
          break
        }

        case 'ArrowUp': {
          e.preventDefault()
          if (isAddButtonSelected) {
            if (currentBlocks.length > 0) {
              const newBlockId = currentBlocks[currentBlocks.length - 1].id
              const newPath = selectedPath.slice(0, currentDepth)
              newPath[currentDepth] = newBlockId
              setSelectedPath(newPath)
            }
          } else if (currentIndex > 0) {
            const newBlockId = currentBlocks[currentIndex - 1].id
            const newPath = selectedPath.slice(0, currentDepth)
            newPath[currentDepth] = newBlockId
            setSelectedPath(newPath)
          }
          break
        }

        case 'ArrowDown': {
          e.preventDefault()
          if (currentIndex === currentBlocks.length - 1) {
            const newPath = selectedPath.slice(0, currentDepth)
            newPath[currentDepth] = 'ADD_BUTTON'
            setSelectedPath(newPath)
          } else if (currentIndex < currentBlocks.length - 1 && !isAddButtonSelected) {
            const newBlockId = currentBlocks[currentIndex + 1].id
            const newPath = selectedPath.slice(0, currentDepth)
            newPath[currentDepth] = newBlockId
            setSelectedPath(newPath)
          }
          break
        }

        case 'ArrowLeft': {
          e.preventDefault()
          if (selectedPath.length > 0) {
            setSelectedPath(selectedPath.slice(0, -1))
          }
          break
        }

        case 'ArrowRight':
        case 'Tab': {
          e.preventDefault()
          if (currentBlockId && currentBlockId !== 'ADD_BUTTON') {
            const currentBlock = findBlockById(blocks, currentBlockId)
            if (currentBlock) {
              if (currentBlock.children && currentBlock.children.length > 0) {
                const newPath = [...selectedPath, currentBlock.children[0].id]
                setSelectedPath(newPath)
              } else {
                const newPath = [...selectedPath, 'ADD_BUTTON']
                setSelectedPath(newPath)
              }
            }
          } else if (currentBlocks.length > 0) {
            setSelectedPath([currentBlocks[0].id])
          }
          break
        }

        default:
          break
      }

      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        if (selectedPath.length > 0) {
          setSelectedPath(selectedPath.slice(0, -1))
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedPath, editingBlockId, blocks])

  const findBlockById = (blockList, id) => {
    for (const block of blockList) {
      if (block.id === id) return block
      if (block.children) {
        const found = findBlockById(block.children, id)
        if (found) return found
      }
    }
    return null
  }

  const getBlocksAtDepth = (depth) => {
    if (depth === 0) {
      return blocks || []
    }

    let currentBlocks = blocks
    for (let i = 0; i < depth; i++) {
      const selectedId = selectedPath[i]
      if (!selectedId) return []

      const selectedBlock = currentBlocks.find(b => b.id === selectedId)
      if (!selectedBlock || !selectedBlock.children || selectedBlock.children.length === 0) {
        return []
      }
      currentBlocks = selectedBlock.children
    }
    return currentBlocks
  }

  const handleBlockClick = (depth, blockId, e) => {
    if (editingBlockId) return
    if (activeBlock) return

    const newPath = selectedPath.slice(0, depth)
    newPath[depth] = blockId
    setSelectedPath(newPath)
  }

  const handleBlockDoubleClick = (blockId, e) => {
    e.stopPropagation()
    const block = findBlockById(blocks, blockId)
    if (block) {
      setEditingBlockId(blockId)
      setEditingText(block.content || '')
    }
  }

  const handleSaveEdit = () => {
    if (!editingBlockId || !setBlocks) return

    const clonedBlocks = JSON.parse(JSON.stringify(blocks))

    const updateBlockContent = (blockList, targetId, newContent) => {
      for (let i = 0; i < blockList.length; i++) {
        if (blockList[i].id === targetId) {
          blockList[i].content = newContent
          return true
        }
        if (blockList[i].children) {
          if (updateBlockContent(blockList[i].children, targetId, newContent)) return true
        }
      }
      return false
    }

    updateBlockContent(clonedBlocks, editingBlockId, editingText)
    setBlocks(clonedBlocks)
    setEditingBlockId(null)
    setEditingText('')

    if (onSave) {
      setTimeout(() => {
        onSave()
      }, 100)
    }
  }

  const handleCancelEdit = () => {
    setEditingBlockId(null)
    setEditingText('')
  }

  const handleAddChildBlock = (parentId) => {
    if (!setBlocks) return

    const clonedBlocks = JSON.parse(JSON.stringify(blocks))

    const addEmptyChild = (blockList, targetId) => {
      for (let i = 0; i < blockList.length; i++) {
        if (blockList[i].id === targetId) {
          const newBlockId = generateUUID()
          const emptyBlock = {
            id: newBlockId,
            content: '',
            type: 'toggle',
            children: [],
            isOpen: true,
            depth: (blockList[i].depth || 0) + 1,
          }

          if (!blockList[i].children) {
            blockList[i].children = []
          }
          blockList[i].children.push(emptyBlock)
          return newBlockId
        }
        if (blockList[i].children) {
          const result = addEmptyChild(blockList[i].children, targetId)
          if (result) return result
        }
      }
      return null
    }

    const newBlockId = addEmptyChild(clonedBlocks, parentId)
    if (newBlockId) {
      setBlocks(clonedBlocks)
      setEditingBlockId(null)
      setEditingText('')

      if (onSave) {
        setTimeout(() => {
          onSave()
        }, 100)
      }
    }
  }

  const handleDeleteBlock = (blockId) => {
    if (!setBlocks) return

    const clonedBlocks = JSON.parse(JSON.stringify(blocks))

    const deleteBlock = (blockList, targetId) => {
      for (let i = 0; i < blockList.length; i++) {
        if (blockList[i].id === targetId) {
          blockList.splice(i, 1)
          return true
        }
        if (blockList[i].children) {
          if (deleteBlock(blockList[i].children, targetId)) return true
        }
      }
      return false
    }

    if (deleteBlock(clonedBlocks, blockId)) {
      setBlocks(clonedBlocks)
      setEditingBlockId(null)
      setEditingText('')

      const newPath = selectedPath.filter(id => id !== blockId)
      setSelectedPath(newPath)

      if (onSave) {
        setTimeout(() => {
          onSave()
        }, 100)
      }
    }
  }

  const handleAddBlockToColumn = (depth) => {
    if (!setBlocks) return

    const clonedBlocks = JSON.parse(JSON.stringify(blocks))

    if (depth === 0) {
      const newBlockId = generateUUID()
      const emptyBlock = {
        id: newBlockId,
        content: '',
        type: 'toggle',
        children: [],
        isOpen: true,
        depth: 0,
      }
      clonedBlocks.push(emptyBlock)
      setBlocks(clonedBlocks)

      const newPath = [newBlockId]
      setSelectedPath(newPath)

      if (onSave) {
        setTimeout(() => {
          onSave()
        }, 100)
      }
    } else {
      const parentId = selectedPath[depth - 1]
      if (parentId) {
        handleAddChildBlock(parentId)
      }
    }
  }

  // 드래그 앤 드롭 핸들러 (간소화)
  const handleDragStart = (event) => {
    setActiveBlock(findBlockById(blocks, event.active.id))
    activeBlockIdRef.current = event.active.id
  }

  const handleDragOver = (event) => {
    const { over } = event
    if (!over) return

    setOverId(over.id)
    currentOverIdRef.current = over.id

    // 드롭 위치 계산 (간소화)
    const overElement = document.querySelector(`[data-block-id="${over.id}"]`)
    if (overElement) {
      const rect = overElement.getBoundingClientRect()
      const y = pointerPositionRef.current.y
      const relativeY = y - rect.top
      const height = rect.height

      if (relativeY < height * 0.25) {
        setDropPosition('top')
      } else if (relativeY > height * 0.75) {
        setDropPosition('bottom')
      } else {
        setDropPosition('center')
      }
    }
  }

  const handleDragEnd = (event) => {
    setActiveBlock(null)
    setOverId(null)
    setDropPosition(null)
    activeBlockIdRef.current = null
    currentOverIdRef.current = null
  }

  // 마우스 위치 추적
  useEffect(() => {
    const handleMouseMove = (e) => {
      pointerPositionRef.current = { x: e.clientX, y: e.clientY }
    }
    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        pointerPositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  // 컬럼별 렌더링
  const renderColumns = () => {
    const columns = []
    const maxDepth = 10

    for (let depth = 0; depth < maxDepth; depth++) {
      const blocksAtDepth = getBlocksAtDepth(depth)
      if (blocksAtDepth.length === 0 && depth > selectedPath.length) break

      const selectedIdAtDepth = selectedPath[depth]
      const isCurrentColumn = depth === selectedPath.length - 1

      columns.push(
        <div key={depth} className="viewer-column">
          <div className="column-header">
            {String.fromCharCode(65 + depth)}
          </div>
          <div className="column-blocks">
            <SortableContext
              items={blocksAtDepth.map(b => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {blocksAtDepth.map((block) => {
                const isSelected = selectedPath.includes(block.id)
                const isCurrent = isCurrentColumn && selectedIdAtDepth === block.id
                const hasChildren = block.children && block.children.length > 0
                const isReference = block._isReference === true

                return (
                  <SortableBlock
                    key={block.id}
                    block={block}
                    depth={depth}
                    isSelected={isSelected}
                    isCurrent={isCurrent}
                    isOver={overId === block.id}
                    dropPosition={dropPosition}
                    activeId={activeBlock?.id}
                    hasChildren={hasChildren}
                    text={block.content}
                    onClick={(e) => handleBlockClick(depth, block.id, e)}
                    onDoubleClick={(e) => handleBlockDoubleClick(block.id, e)}
                    isEditing={editingBlockId === block.id}
                    editingText={editingText}
                    onEditChange={setEditingText}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onAddChildBlock={handleAddChildBlock}
                    onDeleteBlock={handleDeleteBlock}
                    isReference={isReference}
                  />
                )
              })}
            </SortableContext>

            <button
              className={`add-block-button ${selectedIdAtDepth === 'ADD_BUTTON' ? 'selected' : ''}`}
              onClick={() => handleAddBlockToColumn(depth)}
            >
              + 새 블럭
            </button>
          </div>
        </div>
      )
    }

    return columns
  }

  return (
    <div className={`viewer-page ${isDarkMode ? 'dark-mode' : ''}`}>
      <div className="viewer-header">
        <button className="viewer-close-button" onClick={onClose}>
          ✕
        </button>
        <h1 className="viewer-title">ThinkMap</h1>
        <button className="dark-mode-toggle" onClick={() => setIsDarkMode(!isDarkMode)}>
          {isDarkMode ? '☀️ 라이트' : '🌙 다크'}
        </button>
      </div>

      <div className="viewer-content">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="columns-container">
            {renderColumns()}
          </div>

          <DragOverlay>
            {activeBlock ? (
              <div className="viewer-block dragging-overlay">
                <div className="block-content-area">
                  <div className="block-text">{activeBlock.content || '내용 입력'}</div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}

export default ViewerPage
