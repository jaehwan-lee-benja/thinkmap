import React, { useState, useEffect } from 'react'
import { useEditableField } from '../../../hooks/useEditableField'

export function PageTree({
  pages,
  pageTree,
  currentPageId,
  onPageSelect,
  onPageCreate,
  onPageRename,
  onPageDelete,
  getDescendantCount,
  savedExpandedPages = {},
  onExpandedPagesChange,
  onOpenShare,
}) {
  const editing = useEditableField(onPageRename)
  const [expandedPages, setExpandedPages] = useState(savedExpandedPages)

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

  const renderPageItem = (page, depth = 0) => {
    const hasChildren = page.children && page.children.length > 0
    const isExpanded = expandedPages[page.id]

    return (
      <div key={page.id} className="page-tree-node">
        <div
          className={`page-item ${currentPageId === page.id ? 'active' : ''}`}
          style={{ '--depth': depth }}
          onClick={() => {
            if (!editing.isEditing(page.id)) {
              onPageSelect(page.id)
            }
          }}
          onDoubleClick={() => editing.startEdit(page.id, page.name)}
        >
          {hasChildren ? (
            <button
              className={`page-toggle-arrow ${isExpanded ? 'expanded' : ''}`}
              onClick={(e) => toggleExpand(page.id, e)}
              title={isExpanded ? '접기' : '펼치기'}
            >
              ▸
            </button>
          ) : (
            <span className="page-toggle-spacer" />
          )}

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

        {hasChildren && isExpanded && (
          <div className="page-children">
            {page.children.map(child => renderPageItem(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="page-list">
        {pageTree.map((page) => renderPageItem(page, 0))}
      </div>
      <button className="add-page-button" onClick={handleCreatePage}>
        + 새 페이지
      </button>
    </>
  )
}
