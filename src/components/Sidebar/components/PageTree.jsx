import React, { useState, useEffect, useRef } from 'react'
import { useEditableField } from '../../../hooks/useEditableField'

export function PageTree({
  pages,
  pageTree,
  currentPageId,
  onPageSelect,
  onPageCreate,
  onPageRename,
  onPageDelete,
  onReorderPages,
  getDescendantCount,
  savedExpandedPages = {},
  onExpandedPagesChange,
  onOpenShare,
}) {
  const editing = useEditableField(onPageRename)
  const [expandedPages, setExpandedPages] = useState(savedExpandedPages)

  // 드래그 상태
  const [dragId, setDragId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null) // { id, position: 'before' | 'after' | 'inside' }
  const dragRef = useRef(null)

  // DB에서 불러온 상태가 변경되면 로컬에 반영
  useEffect(() => {
    if (savedExpandedPages && Object.keys(savedExpandedPages).length > 0) {
      setExpandedPages(savedExpandedPages)
    }
  }, [savedExpandedPages])

  const toggleExpand = (pageId, e) => {
    e.stopPropagation()
    const updated = { ...expandedPages, [pageId]: !expandedPages[pageId] }
    setExpandedPages(updated)
    onExpandedPagesChange?.(updated)
  }

  const handleDeletePage = (pageId, e) => {
    e.stopPropagation()

    const rootPages = pages.filter(p => !p.parent_id)
    const targetPage = pages.find(p => p.id === pageId)
    if (!targetPage) return

    if (!targetPage.parent_id && rootPages.length <= 1) {
      alert('마지막 최상위 페이지는 삭제할 수 없습니다.')
      return
    }

    const descendantCount = getDescendantCount?.(pageId) || 0
    let confirmMessage = '이 페이지를 삭제하시겠습니까?\n페이지의 모든 블록이 삭제됩니다.'
    if (descendantCount > 0) {
      confirmMessage = `이 페이지를 삭제하시겠습니까?\n하위 페이지 ${descendantCount}개도 함께 삭제됩니다.`
    }

    if (window.confirm(confirmMessage)) {
      onPageDelete(pageId)
    }
  }

  const handleCreateSubPage = async (parentId, e) => {
    e.stopPropagation()
    const name = prompt('하위 페이지 이름을 입력하세요:', 'Untitled')
    if (name) {
      const newPage = await onPageCreate(name, parentId)
      if (newPage) {
        const updated = { ...expandedPages, [parentId]: true }
        setExpandedPages(updated)
        onExpandedPagesChange?.(updated)
        onPageSelect(newPage.id)
      }
    }
  }

  const handleCreatePage = async () => {
    const name = prompt('새 페이지 이름을 입력하세요:', 'Untitled')
    if (name) {
      const newPage = await onPageCreate(name)
      if (newPage) {
        onPageSelect(newPage.id)
      }
    }
  }

  // --- 드래그 앤 드롭 ---
  const getDescendantIdsLocal = (pageId) => {
    const ids = []
    const collect = (id) => {
      const children = pages.filter(p => p.parent_id === id)
      children.forEach(c => { ids.push(c.id); collect(c.id) })
    }
    collect(pageId)
    return ids
  }

  const handleDragStart = (e, pageId) => {
    setDragId(pageId)
    dragRef.current = pageId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', pageId)
    // 약간의 딜레이로 드래그 중 스타일 적용
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-page-id="${pageId}"]`)
      if (el) el.classList.add('dragging')
    })
  }

  const handleDragOver = (e, pageId) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragRef.current || dragRef.current === pageId) return

    // 자기 자신의 하위로 이동 방지
    const descendants = getDescendantIdsLocal(dragRef.current)
    if (descendants.includes(pageId)) return

    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const ratio = y / rect.height

    let position
    if (ratio < 0.35) position = 'before'
    else if (ratio > 0.65) position = 'after'
    else position = 'inside'

    setDropTarget({ id: pageId, position })
  }

  const handleDragLeave = (e) => {
    // 자식 요소로 이동할 때는 무시
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDropTarget(null)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragRef.current || !dropTarget) return

    const draggedId = dragRef.current
    const { id: targetId, position } = dropTarget
    const draggedPage = pages.find(p => p.id === draggedId)
    const targetPage = pages.find(p => p.id === targetId)
    if (!draggedPage || !targetPage) return

    let newParentId, newSiblings

    if (position === 'inside') {
      // 대상 안으로 이동
      newParentId = targetId
      newSiblings = pages.filter(p => p.parent_id === targetId && p.id !== draggedId)
      newSiblings.push({ ...draggedPage, parent_id: targetId })
    } else {
      // before/after: 대상의 형제로 이동
      newParentId = targetPage.parent_id
      const siblings = pages
        .filter(p => (p.parent_id || null) === (newParentId || null) && p.id !== draggedId)
        .sort((a, b) => a.position - b.position)

      const targetIndex = siblings.findIndex(p => p.id === targetId)
      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1
      siblings.splice(insertIndex, 0, { ...draggedPage, parent_id: newParentId })
      newSiblings = siblings
    }

    // position 재계산 + parent_id 업데이트
    const updatedPages = pages.map(p => {
      if (p.id === draggedId) {
        return { ...p, parent_id: newParentId || null }
      }
      return p
    })

    // 새 형제 목록의 position 업데이트
    newSiblings.forEach((sibling, index) => {
      const idx = updatedPages.findIndex(p => p.id === sibling.id)
      if (idx !== -1) {
        updatedPages[idx] = { ...updatedPages[idx], position: index, parent_id: newParentId || null }
      }
    })

    // inside로 이동 시 부모를 펼침
    if (position === 'inside') {
      const updated = { ...expandedPages, [targetId]: true }
      setExpandedPages(updated)
      onExpandedPagesChange?.(updated)
    }

    await onReorderPages(updatedPages)

    // 정리
    setDragId(null)
    setDropTarget(null)
    dragRef.current = null
  }

  const handleDragEnd = () => {
    const el = document.querySelector('.dragging')
    if (el) el.classList.remove('dragging')
    setDragId(null)
    setDropTarget(null)
    dragRef.current = null
  }

  const renderPageItem = (page, depth = 0) => {
    const hasChildren = page.children && page.children.length > 0
    const isExpanded = expandedPages[page.id]
    const isDragging = dragId === page.id
    const isDropTarget = dropTarget?.id === page.id

    let dropClass = ''
    if (isDropTarget) {
      dropClass = `drop-${dropTarget.position}`
    }

    return (
      <div key={page.id} className="page-tree-node" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <div
          className={`page-item ${currentPageId === page.id ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${dropClass}`}
          style={{ '--depth': depth }}
          data-page-id={page.id}
          draggable={!editing.isEditing(page.id)}
          onClick={() => {
            if (!editing.isEditing(page.id)) {
              onPageSelect(page.id)
            }
          }}
          onDoubleClick={() => editing.startEdit(page.id, page.name)}
          onDragStart={(e) => handleDragStart(e, page.id)}
          onDragOver={(e) => handleDragOver(e, page.id)}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        >
          <button
            className={`page-toggle-arrow ${isExpanded ? 'expanded' : ''} ${!hasChildren ? 'empty' : ''}`}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              toggleExpand(page.id, e)
            }}
            title={hasChildren ? (isExpanded ? '접기' : '펼치기') : '하위 페이지 추가'}
          >
            ▸
          </button>

          {editing.isEditing(page.id) ? (
            <input
              type="text"
              className="page-name-input"
              value={editing.editingValue}
              onChange={(e) => editing.setEditingValue(e.target.value)}
              onKeyDown={editing.handleKeyDown}
              onBlur={editing.saveEdit}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span className="page-icon">📄</span>
              <span className="page-name">{page.name}</span>
              <div className="page-item-actions">
                <button
                  className="page-subpage-button"
                  onClick={(e) => handleCreateSubPage(page.id, e)}
                  title="하위 페이지 추가"
                >
                  +
                </button>
                <button
                  className="page-share-button"
                  onClick={(e) => onOpenShare('page', page.id, page.name, e)}
                  title="페이지 공유"
                >
                  공유
                </button>
                <button
                  className="page-delete-button"
                  onClick={(e) => handleDeletePage(page.id, e)}
                  title="페이지 삭제"
                >
                  🗑️
                </button>
              </div>
            </>
          )}
        </div>

        {isExpanded && (
          <div className="page-children">
            {hasChildren && page.children.map(child => renderPageItem(child, depth + 1))}
            {!hasChildren && (
              <div
                className="page-item page-item-placeholder"
                style={{ '--depth': depth + 1 }}
                onClick={(e) => { e.stopPropagation(); handleCreateSubPage(page.id, e) }}
              >
                <span className="page-icon">＋</span>
                <span className="page-name">새 하위 페이지</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="page-list" onDragOver={(e) => e.preventDefault()}>
        {pageTree.map((page) => renderPageItem(page, 0))}
      </div>
      <button className="add-page-button" onClick={handleCreatePage}>
        + 새 페이지
      </button>
    </>
  )
}
