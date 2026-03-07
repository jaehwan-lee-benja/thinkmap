import React, { useState, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { X } from 'lucide-react'
import {
  generateUUID,
  findBlockById,
  updateBlockContent,
  deleteBlock,
  addChildBlock,
} from './utils/columnViewUtils'
import './ColumnView.css'

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
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
  } = useSortable({ id: block.id })

  const textareaRef = useRef(null)
  const skipBlurRef = useRef(false)

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

  const dragHandlers = isEditing ? {} : { ...attributes, ...listeners }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-block-id={block.id}
      data-drop-zone={isOver ? dropPosition : ''}
      className={`column-block ${isSelected ? 'selected' : ''} ${isCurrent ? 'current-selected' : ''} ${hasChildren ? 'has-children' : ''} ${showTopLine ? 'show-drop-line-top' : ''} ${showBottomLine ? 'show-drop-line-bottom' : ''} ${showAsChild ? 'show-as-child-target' : ''} ${isEditing ? 'editing' : ''}`}
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
 * 칼럼 뷰 컴포넌트
 */
function ColumnView({ blocks, setBlocks, onSave, onClose, pageName = 'ThinkMap' }) {
  const [selectedPath, setSelectedPath] = useState([])
  const [activeBlock, setActiveBlock] = useState(null)
  const [overId, setOverId] = useState(null)
  const [dropPosition, setDropPosition] = useState(null)
  const [editingBlockId, setEditingBlockId] = useState(null)
  const [editingText, setEditingText] = useState('')

  const pointerPositionRef = useRef({ x: 0, y: 0 })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 300,
        tolerance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 400,
        tolerance: 10,
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
          const columns = document.querySelectorAll('.column-view-column')
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
          if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault()
            if (selectedPath.length > 0) {
              setSelectedPath(selectedPath.slice(0, -1))
            }
            return
          }
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

        case 'Escape': {
          e.preventDefault()
          onClose()
          break
        }

        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedPath, editingBlockId, blocks, onClose])

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
    if (!editingBlockId) return

    const newBlocks = updateBlockContent(blocks, editingBlockId, editingText)
    setBlocks(newBlocks)
    setEditingBlockId(null)
    setEditingText('')

    if (onSave) {
      setTimeout(() => onSave(), 100)
    }
  }

  const handleCancelEdit = () => {
    setEditingBlockId(null)
    setEditingText('')
  }

  const handleAddChildBlock = (parentId) => {
    const { blocks: newBlocks, newBlockId } = addChildBlock(blocks, parentId)
    setBlocks(newBlocks)
    setEditingBlockId(null)
    setEditingText('')

    if (onSave) {
      setTimeout(() => onSave(), 100)
    }
  }

  const handleDeleteBlock = (blockId) => {
    const newBlocks = deleteBlock(blocks, blockId)
    setBlocks(newBlocks)
    setEditingBlockId(null)
    setEditingText('')

    const newPath = selectedPath.filter(id => id !== blockId)
    setSelectedPath(newPath)

    if (onSave) {
      setTimeout(() => onSave(), 100)
    }
  }

  const handleAddBlockToColumn = (depth) => {
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
      setBlocks([...blocks, emptyBlock])
      setSelectedPath([newBlockId])

      if (onSave) {
        setTimeout(() => onSave(), 100)
      }
    } else {
      const parentId = selectedPath[depth - 1]
      if (parentId) {
        handleAddChildBlock(parentId)
      }
    }
  }

  // 드래그 핸들러
  const handleDragStart = (event) => {
    setActiveBlock(findBlockById(blocks, event.active.id))
  }

  const handleDragOver = (event) => {
    const { over } = event
    if (!over) return

    setOverId(over.id)

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

  const handleDragEnd = () => {
    setActiveBlock(null)
    setOverId(null)
    setDropPosition(null)
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
        <div key={depth} className="column-view-column">
          <div className="column-header">
            {String.fromCharCode(65 + depth)}
          </div>
          <div className="column-blocks">
            <SortableContext
              items={blocksAtDepth.map(b => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {blocksAtDepth.map((block) => {
                // 해당 depth에서 선택된 블록인지 확인 (경로 상의 블록)
                const isSelected = selectedPath[depth] === block.id
                // 현재 포커스된 블록인지 확인 (경로의 마지막)
                const isCurrent = isCurrentColumn && selectedIdAtDepth === block.id
                const hasChildren = block.children && block.children.length > 0

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
    <div className="column-view-page">
      <div className="column-view-header">
        <button className="column-view-close-button" onClick={onClose}>
          <X size={20} />
        </button>
        <h1 className="column-view-title">{pageName} - 칼럼 모드</h1>
        <div className="column-view-hint">
          <span>방향키: 이동</span>
          <span>Enter: 편집</span>
          <span>Tab: 하위로</span>
          <span>ESC: 닫기</span>
        </div>
      </div>

      <div className="column-view-content">
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
              <div className="column-block dragging-overlay">
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

export default ColumnView
