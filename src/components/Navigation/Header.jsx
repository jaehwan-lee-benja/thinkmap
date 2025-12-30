import React, { useState, useRef, useEffect } from 'react'

// 헤더 컴포넌트 (노션 스타일)
function Header({
  onToggleSidebar,
  currentProjectId,
  currentProjectName,
  onProjectRename,
  sidebarOpen,
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = () => {
    setEditingName(currentProjectName || 'My Project')
    setIsEditing(true)
  }

  const handleSave = () => {
    if (editingName.trim() && currentProjectId) {
      onProjectRename(currentProjectId, editingName.trim())
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditingName('')
  }

  return (
    <>
      {!sidebarOpen && (
        <button
          onClick={onToggleSidebar}
          className="index-button-fixed"
          title="사이드바 열기"
        >
          ☰
        </button>
      )}
      <div className="header-fixed">
        <div className="settings-bar">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="header-title-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave()
                } else if (e.key === 'Escape') {
                  handleCancel()
                }
              }}
              onBlur={handleSave}
            />
          ) : (
            <h1
              className="app-title editable-title"
              onClick={handleStartEdit}
              title="클릭하여 프로젝트 이름 수정"
            >
              {currentProjectName || 'My Project'}
            </h1>
          )}
        </div>
      </div>
    </>
  )
}

export default Header
