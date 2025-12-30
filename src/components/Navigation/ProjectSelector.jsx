import React, { useState, useRef, useEffect } from 'react'
import './ProjectSelector.css'

/**
 * 프로젝트 선택 드롭다운
 */
function ProjectSelector({
  projects = [],
  currentProjectId,
  onProjectSelect,
  onProjectCreate,
  onProjectRename,
  onProjectDelete,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const dropdownRef = useRef(null)

  // 현재 프로젝트
  const currentProject = projects.find(p => p.id === currentProjectId)

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        setEditingProjectId(null)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // 프로젝트 더블클릭 → 이름 수정
  const handleProjectDoubleClick = (project) => {
    setEditingProjectId(project.id)
    setEditingName(project.name)
  }

  // 이름 수정 저장
  const handleSaveRename = () => {
    if (editingProjectId && editingName.trim()) {
      onProjectRename(editingProjectId, editingName.trim())
    }
    setEditingProjectId(null)
    setEditingName('')
  }

  // 이름 수정 취소
  const handleCancelRename = () => {
    setEditingProjectId(null)
    setEditingName('')
  }

  // 프로젝트 삭제
  const handleDeleteProject = (projectId, e) => {
    e.stopPropagation()
    if (projects.length <= 1) {
      alert('마지막 프로젝트는 삭제할 수 없습니다.')
      return
    }
    if (window.confirm('이 프로젝트를 삭제하시겠습니까?\n프로젝트의 모든 페이지와 블록이 삭제됩니다.')) {
      onProjectDelete(projectId)
    }
  }

  // 새 프로젝트 생성
  const handleCreateProject = async () => {
    const name = prompt('새 프로젝트 이름을 입력하세요:', 'Untitled Project')
    if (name) {
      const newProject = await onProjectCreate(name)
      if (newProject) {
        onProjectSelect(newProject.id)
        setIsOpen(false)
      }
    }
  }

  return (
    <div className="project-selector" ref={dropdownRef}>
      {/* 프로젝트 버튼 */}
      <button
        className="project-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        title="프로젝트 선택"
      >
        <span className="project-icon">📁</span>
        <span className="project-name">{currentProject?.name || 'My Project'}</span>
        <span className="project-chevron">{isOpen ? '▴' : '▾'}</span>
      </button>

      {/* 드롭다운 */}
      {isOpen && (
        <div className="project-dropdown">
          <div className="project-dropdown-header">프로젝트</div>

          <div className="project-list">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`project-item ${currentProjectId === project.id ? 'active' : ''}`}
                onClick={() => {
                  if (editingProjectId !== project.id) {
                    onProjectSelect(project.id)
                    setIsOpen(false)
                  }
                }}
                onDoubleClick={() => handleProjectDoubleClick(project)}
              >
                {editingProjectId === project.id ? (
                  <input
                    type="text"
                    className="project-name-input"
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
                    <span className="project-item-icon">📁</span>
                    <span className="project-item-name">{project.name}</span>
                    {projects.length > 1 && (
                      <button
                        className="project-delete-button"
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        title="프로젝트 삭제"
                      >
                        🗑️
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* 새 프로젝트 버튼 */}
          <button className="add-project-button" onClick={handleCreateProject}>
            + 새 프로젝트
          </button>
        </div>
      )}
    </div>
  )
}

export default ProjectSelector
