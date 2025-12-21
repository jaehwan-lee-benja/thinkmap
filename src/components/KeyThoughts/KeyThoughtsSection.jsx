import React, { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { SortableNotionBlock, NotionBlock } from './NotionBlock'

function KeyThoughtsSection({ blocks, setBlocks, focusedBlockId, setFocusedBlockId, onShowHistory }) {
  const [activeBlock, setActiveBlock] = useState(null)
  const [overId, setOverId] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // 3px 이동 후 드래그 시작 (핸들 전용이므로 민감하게)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

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

  // blocks 변경 시 자식 없는 블록 자동 닫기
  useEffect(() => {
    const closedBlocks = autoCloseEmptyBlocks(blocks)
    // 변경사항이 있을 때만 업데이트 (무한 루프 방지)
    if (JSON.stringify(closedBlocks) !== JSON.stringify(blocks)) {
      setBlocks(closedBlocks)
    }
  }, [blocks])

  // 모든 블록을 평탄화 (시각적으로 보이는 순서대로)
  const flattenBlocks = (blockList) => {
    const result = []
    const traverse = (blocks) => {
      for (const block of blocks) {
        result.push(block)
        if (block.isOpen && Array.isArray(block.children) && block.children.length > 0) {
          traverse(block.children)
        }
      }
    }
    traverse(blockList)
    return result
  }

  // 블록의 모든 하위 블록 ID를 재귀적으로 수집
  const getAllChildIds = (block) => {
    const childIds = []
    const traverse = (b) => {
      if (Array.isArray(b.children) && b.children.length > 0) {
        for (const child of b.children) {
          childIds.push(child.id)
          traverse(child)
        }
      }
    }
    traverse(block)
    return childIds
  }

  const handleDragStart = (event) => {
    const { active } = event
    const flatBlocks = flattenBlocks(blocks)
    const block = flatBlocks.find(b => b.id === active.id)
    setActiveBlock(block)
  }

  const handleDragOver = (event) => {
    const { over } = event
    setOverId(over?.id || null)
  }

  // 드래그 중인 블록의 모든 하위 블록 ID 목록
  const draggingChildIds = React.useMemo(() => {
    if (!activeBlock) return []
    return getAllChildIds(activeBlock)
  }, [activeBlock])

  const handleDragEnd = (event) => {
    const { active, over } = event

    // 드래그 종료 시 activeBlock, overId 초기화
    setActiveBlock(null)
    setOverId(null)

    if (!over || active.id === over.id) return

    const flatBlocks = flattenBlocks(blocks)
    const activeBlock = flatBlocks.find(b => b.id === active.id)
    const overBlock = flatBlocks.find(b => b.id === over.id)

    if (!activeBlock || !overBlock) return

    // 드래그 중인 블록의 하위 블록으로 드롭하는 것을 방지
    const childIds = getAllChildIds(activeBlock)
    if (childIds.includes(over.id)) {
      return
    }

    // 깊은 복사로 activeBlock 보존
    const activeBlockCopy = JSON.parse(JSON.stringify(activeBlock))

    // 트리에서 블록 제거
    const removeBlockFromTree = (tree, blockId) => {
      return tree
        .filter(b => b.id !== blockId)
        .map(b => ({
          ...b,
          children: Array.isArray(b.children) ? removeBlockFromTree(b.children, blockId) : []
        }))
    }

    // 트리에서 블록 삽입 (특정 블록 다음에)
    const insertBlockAfter = (tree, targetId, blockToInsert) => {
      let inserted = false
      const result = []

      for (const block of tree) {
        result.push(block)
        if (block.id === targetId) {
          result.push(blockToInsert)
          inserted = true
        }

        if (Array.isArray(block.children) && block.children.length > 0) {
          const { newChildren, wasInserted } = insertBlockAfterWithFlag(block.children, targetId, blockToInsert)
          if (wasInserted) {
            result[result.length - 1] = { ...block, children: newChildren }
            inserted = true
          }
        }
      }

      return { newTree: result, inserted }
    }

    // 삽입 성공 여부를 반환하는 헬퍼 함수
    const insertBlockAfterWithFlag = (tree, targetId, blockToInsert) => {
      let inserted = false
      const result = []

      for (const block of tree) {
        result.push(block)
        if (block.id === targetId) {
          result.push(blockToInsert)
          inserted = true
        }

        if (Array.isArray(block.children) && block.children.length > 0) {
          const { newChildren, wasInserted } = insertBlockAfterWithFlag(block.children, targetId, blockToInsert)
          if (wasInserted) {
            result[result.length - 1] = { ...block, children: newChildren }
            inserted = true
          }
        }
      }

      return { newChildren: result, wasInserted: inserted }
    }

    // 1. 기존 위치에서 제거
    let newTree = removeBlockFromTree(blocks, activeBlock.id)

    // 2. 새 위치에 삽입
    // 첫 번째 블록(루트 레벨)인지 확인
    const isFirstBlock = newTree.length > 0 && newTree[0].id === overBlock.id

    let finalTree
    let inserted = false

    if (isFirstBlock) {
      // 첫 번째 블록 앞에 삽입
      finalTree = [activeBlockCopy, ...newTree]
      inserted = true
    } else {
      // 기존 로직: 특정 블록 다음에 삽입
      const result = insertBlockAfter(newTree, overBlock.id, activeBlockCopy)
      finalTree = result.newTree
      inserted = result.inserted
    }

    // 3. 삽입 실패 시 원래 상태 유지
    if (!inserted) {
      console.warn('Failed to insert block, keeping original state')
      return
    }

    // 4. 자식이 없는 블록은 자동으로 닫기
    const resultTree = autoCloseEmptyBlocks(finalTree)

    setBlocks(resultTree)
  }

  // 드래그 중인 블록의 하위 블록들은 sortable 대상에서 제외
  // (하위 블록들은 상위 블록과 함께 움직이므로 개별적으로 정렬되면 안됨)
  const allBlockIds = flattenBlocks(blocks)
    .filter(b => !draggingChildIds.includes(b.id))
    .map(b => b.id)

  // 전체 펴기/접기 함수
  const toggleAllBlocks = (open) => {
    const toggleRecursively = (blockList) => {
      return blockList.map(block => ({
        ...block,
        isOpen: open,
        children: Array.isArray(block.children) ? toggleRecursively(block.children) : []
      }))
    }
    setBlocks(toggleRecursively(blocks))
  }

  // 모든 블록이 열려있는지 확인
  const checkAllOpen = (blockList) => {
    for (const block of blockList) {
      if (!block.isOpen && Array.isArray(block.children) && block.children.length > 0) {
        return false
      }
      if (Array.isArray(block.children) && block.children.length > 0) {
        if (!checkAllOpen(block.children)) return false
      }
    }
    return true
  }

  const allOpen = checkAllOpen(blocks)

  return (
    <div className="key-thoughts-section section-block">
      <div className="section-header">
        <h3 className="section-title">💡 주요 생각정리</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="toggle-all-button"
            onClick={() => onShowHistory && onShowHistory()}
            title="버전 히스토리 보기"
          >
            🕐 히스토리
          </button>
          <button
            className="toggle-all-button"
            onClick={() => toggleAllBlocks(!allOpen)}
            title={allOpen ? "전체 접기" : "전체 펴기"}
          >
            {allOpen ? "전체 접기" : "전체 펴기"}
          </button>
        </div>
      </div>
      <div
        className="key-thoughts-content notion-editor"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
        >
          <SortableContext
            items={allBlockIds}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((block) => (
              <SortableNotionBlock
                key={block.id}
                block={block}
                blocks={blocks}
                setBlocks={setBlocks}
                focusedBlockId={focusedBlockId}
                setFocusedBlockId={setFocusedBlockId}
                rootSetBlocks={setBlocks}
                draggingChildIds={draggingChildIds}
                activeId={activeBlock?.id}
                overId={overId}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeBlock ? (
              <div className="drag-overlay-block">
                <NotionBlock
                  block={activeBlock}
                  blocks={blocks}
                  setBlocks={() => {}} // 드래그 중에는 수정 불가
                  focusedBlockId={null}
                  setFocusedBlockId={() => {}}
                  dragHandleProps={{}}
                  parentBlock={null}
                  rootSetBlocks={() => {}}
                  draggingChildIds={[]}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}

export default KeyThoughtsSection
