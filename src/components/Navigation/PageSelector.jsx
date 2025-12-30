import React, { useState, useRef, useEffect } from 'react'
import './PageSelector.css'

/**
 * 페이지 선택 드롭다운
 */
function PageSelector({
  pages = [],
  currentPageId,
  onPageSelect,
  onPageCreate,
  onPageRename,
  onPageDelete,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingPageId, setEditingPageId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const dropdownRef = useRef(null)

  // 현재 페이지
  const currentPage = pages.find(p => p.id === currentPageId)

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        setEditingPageId(null)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // 페이지 더블클릭 → 이름 수정
  const handlePageDoubleClick = (page) => {
    setEditingPageId(page.id)
    setEditingName(page.name)
  }

  // 이름 수정 저장
  const handleSaveRename = () => {
    if (editingPageId && editingName.trim()) {
      onPageRename(editingPageId, editingName.trim())
    }
    setEditingPageId(null)
    setEditingName('')
  }

  // 이름 수정 취소
  const handleCancelRename = () => {
    setEditingPageId(null)
    setEditingName('')
  }

  // 페이지 삭제
  const handleDeletePage = (pageId, e) => {
    e.stopPropagation()
    if (pages.length <= 1) {
      alert('마지막 페이지는 삭제할 수 없습니다.')
      return
    }
    if (window.confirm('이 페이지를 삭제하시겠습니까?\n페이지의 모든 블록이 삭제됩니다.')) {
      onPageDelete(pageId)
    }
  }

  // 새 페이지 생성
  const handleCreatePage = async () => {
    const name = prompt('새 페이지 이름을 입력하세요:', 'Untitled')
    if (name) {
      const newPage = await onPageCreate(name)
      if (newPage) {
        onPageSelect(newPage.id)
        setIsOpen(false)
      }
    }
  }

  return (
    <div className="page-selector" ref={dropdownRef}>
      {/* 페이지 버튼 */}
      <button
        className="page-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        title="페이지 선택"
      >
        <span className="page-icon">💡</span>
        <span className="page-name">{currentPage?.name || 'Main'}</span>
        <span className="page-chevron">{isOpen ? '▴' : '▾'}</span>
      </button>

      {/* 드롭다운 */}
      {isOpen && (
        <div className="page-dropdown">
          <div className="page-dropdown-header">페이지</div>

          <div className="page-list">
            {pages.map((page) => (
              <div
                key={page.id}
                className={`page-item ${currentPageId === page.id ? 'active' : ''}`}
                onClick={() => {
                  if (editingPageId !== page.id) {
                    onPageSelect(page.id)
                    setIsOpen(false)
                  }
                }}
                onDoubleClick={() => handlePageDoubleClick(page)}
              >
                {editingPageId === page.id ? (
                  <input
                    type="text"
                    className="page-name-input"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveRename()
                      } else if (e.key === 'Escape') {
                        handleCancelRename()
                      }
                    }}
                    onBlur={handleSaveRename}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="page-item-icon">📄</span>
                    <span className="page-item-name">{page.name}</span>
                    {pages.length > 1 && (
                      <button
                        className="page-delete-button"
                        onClick={(e) => handleDeletePage(page.id, e)}
                        title="페이지 삭제"
                      >
                        🗑️
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* 새 페이지 버튼 */}
          <button className="add-page-button" onClick={handleCreatePage}>
            + 새 페이지
          </button>
        </div>
      )}
    </div>
  )
}

export default PageSelector
