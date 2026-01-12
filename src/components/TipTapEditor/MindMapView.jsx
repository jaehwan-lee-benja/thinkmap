import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, ZoomIn, ZoomOut, Maximize2, ArrowRight, ArrowLeft, ArrowDown, ArrowUp } from 'lucide-react'
import {
  generateUUID,
  findBlockById,
  updateBlockContent,
  deleteBlock,
  addChildBlock,
} from './utils/columnViewUtils'
import './MindMapView.css'

// 방향 상수
const DIRECTIONS = {
  RIGHT_TO_LEFT: 'rtl',   // 오른쪽 → 왼쪽 (기본, 좌우 분산)
  LEFT_TO_RIGHT: 'ltr',   // 왼쪽 → 오른쪽 (좌우 분산)
  TOP_TO_BOTTOM: 'ttb',   // 위 → 아래
  BOTTOM_TO_TOP: 'btt',   // 아래 → 위
}

/**
 * 마인드맵 노드 컴포넌트
 */
function MindMapNode({
  node,
  isSelected,
  isEditing,
  editingText,
  onSelect,
  onEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onAddChild,
  onDelete,
  side,
  level,
  direction,
}) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSaveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancelEdit()
    }
  }

  return (
    <div
      className={`mindmap-node ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''} level-${level} side-${side}`}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node.id)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onEdit(node.id)
      }}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="mindmap-node-input"
          value={editingText}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onSaveEdit}
        />
      ) : (
        <span className="mindmap-node-text">
          {node.content || '내용 입력'}
        </span>
      )}

      {isSelected && !isEditing && (
        <div className="mindmap-node-actions">
          <button onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }} title="하위 추가">+</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(node.id); }} title="삭제" className="delete">×</button>
        </div>
      )}
    </div>
  )
}

/**
 * 마인드맵 브랜치 (노드 + 자식들)
 */
function MindMapBranch({
  node,
  selectedId,
  editingId,
  editingText,
  onSelect,
  onEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onAddChild,
  onDelete,
  side,
  level,
  parentPos,
  nodePositions,
  setNodePositions,
  direction,
}) {
  const nodeRef = useRef(null)
  const hasChildren = node.children && node.children.length > 0

  useEffect(() => {
    if (nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect()
      const container = nodeRef.current.closest('.mindmap-canvas')
      if (container) {
        const containerRect = container.getBoundingClientRect()
        setNodePositions(prev => ({
          ...prev,
          [node.id]: {
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.top - containerRect.top + rect.height / 2,
            width: rect.width,
            height: rect.height,
          }
        }))
      }
    }
  }, [node.id, selectedId, setNodePositions])

  // 수직 방향인지 확인
  const isVertical = direction === DIRECTIONS.TOP_TO_BOTTOM || direction === DIRECTIONS.BOTTOM_TO_TOP

  // 자식을 먼저 렌더링해야 하는지 (노드 기준으로 자식이 앞에 오는 경우)
  // RTL left side: 자식이 왼쪽에 있으므로 자식 먼저
  // BTT: 자식이 위에 있으므로 자식 먼저
  const childrenFirst =
    (direction === DIRECTIONS.RIGHT_TO_LEFT && side === 'left') ||
    (direction === DIRECTIONS.BOTTOM_TO_TOP)

  const childrenElements = hasChildren && (
    <div className={`mindmap-children ${isVertical ? 'vertical' : ''}`}>
      {node.children.map((child) => (
        <MindMapBranch
          key={child.id}
          node={child}
          selectedId={selectedId}
          editingId={editingId}
          editingText={editingText}
          onSelect={onSelect}
          onEdit={onEdit}
          onEditChange={onEditChange}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onAddChild={onAddChild}
          onDelete={onDelete}
          side={side}
          level={level + 1}
          parentPos={nodePositions[node.id]}
          nodePositions={nodePositions}
          setNodePositions={setNodePositions}
          direction={direction}
        />
      ))}
    </div>
  )

  const nodeElement = (
    <div ref={nodeRef} className="mindmap-node-wrapper">
      <MindMapNode
        node={node}
        isSelected={selectedId === node.id}
        isEditing={editingId === node.id}
        editingText={editingText}
        onSelect={onSelect}
        onEdit={onEdit}
        onEditChange={onEditChange}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
        onAddChild={onAddChild}
        onDelete={onDelete}
        side={side}
        level={level}
        direction={direction}
      />
    </div>
  )

  return (
    <div className={`mindmap-branch side-${side} level-${level} dir-${direction}`}>
      {childrenFirst ? (
        <>
          {childrenElements}
          {nodeElement}
        </>
      ) : (
        <>
          {nodeElement}
          {childrenElements}
        </>
      )}
    </div>
  )
}

/**
 * 연결선 SVG
 */
function ConnectionLines({ nodePositions, blocks, rootId, direction, leftBlocks, rightBlocks }) {
  const lines = []
  const isVertical = direction === DIRECTIONS.TOP_TO_BOTTOM || direction === DIRECTIONS.BOTTOM_TO_TOP

  // 연결선 계산
  const getConnectionPoints = (parentPos, childPos, side) => {
    if (isVertical) {
      // 수직 방향
      const isDownward = direction === DIRECTIONS.TOP_TO_BOTTOM
      const startX = parentPos.x
      const startY = isDownward ? parentPos.y + parentPos.height / 2 : parentPos.y - parentPos.height / 2
      const endX = childPos.x
      const endY = isDownward ? childPos.y - childPos.height / 2 : childPos.y + childPos.height / 2
      return { startX, startY, endX, endY }
    } else {
      // 수평 방향 - LTR은 오른쪽으로, RTL은 양쪽으로
      if (direction === DIRECTIONS.LEFT_TO_RIGHT) {
        // LTR: 부모 오른쪽에서 자식 왼쪽으로
        const startX = parentPos.x + parentPos.width / 2
        const startY = parentPos.y
        const endX = childPos.x - childPos.width / 2
        const endY = childPos.y
        return { startX, startY, endX, endY }
      } else {
        // RTL: 좌우 분산
        const startX = side === 'right' ? parentPos.x + parentPos.width / 2 : parentPos.x - parentPos.width / 2
        const startY = parentPos.y
        const endX = side === 'right' ? childPos.x - childPos.width / 2 : childPos.x + childPos.width / 2
        const endY = childPos.y
        return { startX, startY, endX, endY }
      }
    }
  }

  // 베지어 곡선 경로 생성
  const createPath = (startX, startY, endX, endY, side) => {
    if (isVertical) {
      const controlOffset = Math.abs(endY - startY) * 0.5
      const isDownward = direction === DIRECTIONS.TOP_TO_BOTTOM
      return `M ${startX} ${startY} C ${startX} ${startY + (isDownward ? controlOffset : -controlOffset)}, ${endX} ${endY + (isDownward ? -controlOffset : controlOffset)}, ${endX} ${endY}`
    } else {
      const controlOffset = Math.abs(endX - startX) * 0.5
      if (direction === DIRECTIONS.LEFT_TO_RIGHT) {
        // LTR: 항상 오른쪽으로
        return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`
      } else {
        // RTL: 좌우 분산
        return `M ${startX} ${startY} C ${startX + (side === 'right' ? controlOffset : -controlOffset)} ${startY}, ${endX + (side === 'right' ? -controlOffset : controlOffset)} ${endY}, ${endX} ${endY}`
      }
    }
  }

  const drawLines = (parentId, children, side) => {
    const parentPos = nodePositions[parentId]
    if (!parentPos || !children) return

    children.forEach(child => {
      const childPos = nodePositions[child.id]
      if (childPos) {
        const { startX, startY, endX, endY } = getConnectionPoints(parentPos, childPos, side)
        const path = createPath(startX, startY, endX, endY, side)

        lines.push(
          <path
            key={`${parentId}-${child.id}`}
            d={path}
            className="mindmap-connection"
          />
        )

        if (child.children && child.children.length > 0) {
          drawLines(child.id, child.children, side)
        }
      }
    })
  }

  // 루트에서 노드로 연결
  const rootPos = nodePositions[rootId]
  if (rootPos) {
    // 첫 번째 그룹 (왼쪽 또는 위쪽)
    leftBlocks.forEach(block => {
      const childPos = nodePositions[block.id]
      if (childPos) {
        const side = isVertical ? 'top' : 'left'
        const { startX, startY, endX, endY } = getConnectionPoints(rootPos, childPos, side)
        const path = createPath(startX, startY, endX, endY, side)

        lines.push(
          <path key={`root-${block.id}`} d={path} className="mindmap-connection root-connection" />
        )

        if (block.children && block.children.length > 0) {
          drawLines(block.id, block.children, side)
        }
      }
    })

    // 두 번째 그룹 (오른쪽 또는 아래쪽)
    rightBlocks.forEach(block => {
      const childPos = nodePositions[block.id]
      if (childPos) {
        const side = isVertical ? 'bottom' : 'right'
        const { startX, startY, endX, endY } = getConnectionPoints(rootPos, childPos, side)
        const path = createPath(startX, startY, endX, endY, side)

        lines.push(
          <path key={`root-${block.id}`} d={path} className="mindmap-connection root-connection" />
        )

        if (block.children && block.children.length > 0) {
          drawLines(block.id, block.children, side)
        }
      }
    })
  }

  return (
    <svg className="mindmap-connections">
      {lines}
    </svg>
  )
}

/**
 * 마인드맵 뷰 메인 컴포넌트
 */
function MindMapView({ blocks, setBlocks, onSave, onClose, pageName = 'ThinkMap' }) {
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [nodePositions, setNodePositions] = useState({})
  const [direction, setDirection] = useState(DIRECTIONS.RIGHT_TO_LEFT)

  const canvasRef = useRef(null)
  const rootId = 'mindmap-root'

  // 루트 노드 위치 추적
  useEffect(() => {
    const rootEl = document.querySelector('.mindmap-root-node')
    if (rootEl && canvasRef.current) {
      const rect = rootEl.getBoundingClientRect()
      const containerRect = canvasRef.current.getBoundingClientRect()
      setNodePositions(prev => ({
        ...prev,
        [rootId]: {
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        }
      }))
    }
  }, [blocks, zoom, pan, direction])

  // 키보드 핸들러
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (editingId) return

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          if (selectedId) {
            setSelectedId(null)
          } else {
            onClose()
          }
          break
        case 'Enter':
          e.preventDefault()
          if (selectedId) {
            const node = findBlockById(blocks, selectedId)
            if (node) {
              setEditingId(selectedId)
              setEditingText(node.content || '')
            }
          }
          break
        case 'Tab':
          e.preventDefault()
          if (selectedId) {
            handleAddChild(selectedId)
          }
          break
        case 'Delete':
        case 'Backspace':
          if (selectedId && !editingId) {
            e.preventDefault()
            handleDelete(selectedId)
          }
          break
        case '+':
        case '=':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            setZoom(z => Math.min(z + 0.1, 2))
          }
          break
        case '-':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            setZoom(z => Math.max(z - 0.1, 0.5))
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, editingId, blocks, onClose])

  // 패닝
  const handleMouseDown = (e) => {
    if (e.target.closest('.mindmap-node')) return
    setIsPanning(true)
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e) => {
    if (!isPanning) return
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  // 노드 선택
  const handleSelect = (id) => {
    setSelectedId(id)
  }

  // 노드 편집 시작
  const handleEdit = (id) => {
    const node = findBlockById(blocks, id)
    if (node) {
      setEditingId(id)
      setEditingText(node.content || '')
    }
  }

  // 편집 저장
  const handleSaveEdit = () => {
    if (!editingId) return
    const newBlocks = updateBlockContent(blocks, editingId, editingText)
    setBlocks(newBlocks)
    setEditingId(null)
    setEditingText('')
    if (onSave) setTimeout(onSave, 100)
  }

  // 편집 취소
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingText('')
  }

  // 자식 추가
  const handleAddChild = (parentId) => {
    const { blocks: newBlocks, newBlockId } = addChildBlock(blocks, parentId)
    setBlocks(newBlocks)
    setSelectedId(newBlockId)
    if (onSave) setTimeout(onSave, 100)
  }

  // 루트에 노드 추가
  const handleAddRootChild = () => {
    const newBlockId = generateUUID()
    const newBlock = {
      id: newBlockId,
      type: 'toggle',
      content: '',
      children: [],
      isOpen: true,
      depth: 0,
    }
    setBlocks([...blocks, newBlock])
    setSelectedId(newBlockId)
    if (onSave) setTimeout(onSave, 100)
  }

  // 노드 삭제
  const handleDelete = (id) => {
    if (!window.confirm('이 노드를 삭제하시겠습니까?')) return
    const newBlocks = deleteBlock(blocks, id)
    setBlocks(newBlocks)
    setSelectedId(null)
    if (onSave) setTimeout(onSave, 100)
  }

  // 줌 리셋
  const handleResetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // 수직 방향인지 확인
  const isVertical = direction === DIRECTIONS.TOP_TO_BOTTOM || direction === DIRECTIONS.BOTTOM_TO_TOP

  // 단방향인지 확인 (LTR, TTB, BTT는 모든 블록이 한 방향으로)
  const isUnidirectional = direction === DIRECTIONS.LEFT_TO_RIGHT || isVertical

  // 블록을 분배 (좌우 또는 상하)
  const leftBlocks = isUnidirectional ? [] : blocks.filter((_, i) => i % 2 === 0)
  const rightBlocks = isUnidirectional ? blocks : blocks.filter((_, i) => i % 2 === 1)

  return (
    <div className="mindmap-page">
      <div className="mindmap-header">
        <button className="mindmap-close-button" onClick={onClose}>
          <X size={20} />
        </button>
        <h1 className="mindmap-title">{pageName} - 마인드맵</h1>
        {/* 방향 선택 버튼 */}
        <div className="mindmap-direction-selector">
          <button
            className={direction === DIRECTIONS.LEFT_TO_RIGHT ? 'active' : ''}
            onClick={() => setDirection(DIRECTIONS.LEFT_TO_RIGHT)}
            title="왼쪽 → 오른쪽"
          >
            <ArrowRight size={16} />
          </button>
          <button
            className={direction === DIRECTIONS.RIGHT_TO_LEFT ? 'active' : ''}
            onClick={() => setDirection(DIRECTIONS.RIGHT_TO_LEFT)}
            title="오른쪽 → 왼쪽"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            className={direction === DIRECTIONS.TOP_TO_BOTTOM ? 'active' : ''}
            onClick={() => setDirection(DIRECTIONS.TOP_TO_BOTTOM)}
            title="위 → 아래"
          >
            <ArrowDown size={16} />
          </button>
          <button
            className={direction === DIRECTIONS.BOTTOM_TO_TOP ? 'active' : ''}
            onClick={() => setDirection(DIRECTIONS.BOTTOM_TO_TOP)}
            title="아래 → 위"
          >
            <ArrowUp size={16} />
          </button>
        </div>

        <div className="mindmap-controls">
          <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))} title="축소">
            <ZoomOut size={18} />
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(z + 0.1, 2))} title="확대">
            <ZoomIn size={18} />
          </button>
          <button onClick={handleResetView} title="리셋">
            <Maximize2 size={18} />
          </button>
        </div>
        <div className="mindmap-hint">
          <span>Enter: 편집</span>
          <span>Tab: 하위 추가</span>
          <span>Del: 삭제</span>
          <span>드래그: 이동</span>
        </div>
      </div>

      <div
        className="mindmap-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={canvasRef}
          className={`mindmap-canvas dir-${direction}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <ConnectionLines
            nodePositions={nodePositions}
            blocks={blocks}
            rootId={rootId}
            direction={direction}
            leftBlocks={leftBlocks}
            rightBlocks={rightBlocks}
          />

          {/* 첫 번째 그룹 (왼쪽 또는 위쪽) - 단방향일 때는 숨김 */}
          {leftBlocks.length > 0 && (
            <div className={`mindmap-side ${isVertical ? 'top' : 'left'}`}>
              {leftBlocks.map((block) => (
                <MindMapBranch
                  key={block.id}
                  node={block}
                  selectedId={selectedId}
                  editingId={editingId}
                  editingText={editingText}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                  onEditChange={setEditingText}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                  onAddChild={handleAddChild}
                  onDelete={handleDelete}
                  side={isVertical ? 'top' : 'left'}
                  level={1}
                  parentPos={nodePositions[rootId]}
                  nodePositions={nodePositions}
                  setNodePositions={setNodePositions}
                  direction={direction}
                />
              ))}
            </div>
          )}

          {/* 루트 노드 */}
          <div
            className={`mindmap-root-node ${selectedId === null ? '' : 'dimmed'}`}
            onClick={() => setSelectedId(null)}
          >
            <span>{pageName}</span>
            <button className="add-root-child" onClick={handleAddRootChild} title="노드 추가">
              +
            </button>
          </div>

          {/* 두 번째 그룹 (오른쪽 또는 아래쪽) */}
          <div className={`mindmap-side ${isVertical ? 'bottom' : 'right'}`}>
            {rightBlocks.map((block) => (
              <MindMapBranch
                key={block.id}
                node={block}
                selectedId={selectedId}
                editingId={editingId}
                editingText={editingText}
                onSelect={handleSelect}
                onEdit={handleEdit}
                onEditChange={setEditingText}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                onAddChild={handleAddChild}
                onDelete={handleDelete}
                side={isVertical ? 'bottom' : 'right'}
                level={1}
                parentPos={nodePositions[rootId]}
                nodePositions={nodePositions}
                setNodePositions={setNodePositions}
                direction={direction}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MindMapView
