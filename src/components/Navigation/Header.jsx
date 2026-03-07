import React, { useRef, useEffect } from 'react'
import { useEditableField } from '../../hooks/useEditableField'
import { useProjectContext } from '../../contexts/ProjectContext'
import { useUIContext } from '../../contexts/UIContext'

function Header() {
  const { projects, currentProjectId, renameProject } = useProjectContext()
  const { sidebarOpen, toggleSidebar } = useUIContext()

  const currentProjectName = projects.find(p => p.id === currentProjectId)?.name
  const inputRef = useRef(null)

  const editing = useEditableField((id, name) => {
    renameProject(id, name)
  })

  useEffect(() => {
    if (editing.editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing.editingId])

  return (
    <div className="header-fixed">
      <div className="settings-bar">
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="header-hamburger-button"
            title="사이드바 열기"
          >
            ☰
          </button>
        )}
        {editing.editingId ? (
          <input
            ref={inputRef}
            type="text"
            className="header-title-input"
            value={editing.editingValue}
            onChange={(e) => editing.setEditingValue(e.target.value)}
            onKeyDown={editing.handleKeyDown}
            onBlur={editing.saveEdit}
          />
        ) : (
          <h1
            className="app-title editable-title"
            onClick={() => editing.startEdit(currentProjectId, currentProjectName || 'My Project')}
            title="클릭하여 프로젝트 이름 수정"
          >
            {currentProjectName || 'My Project'}
          </h1>
        )}
      </div>
    </div>
  )
}

export default Header
