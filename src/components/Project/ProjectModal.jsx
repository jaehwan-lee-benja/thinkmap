import React, { useState } from 'react'
import { X, FolderOpen, Plus, Trash2, Edit3, Check } from 'lucide-react'
import './ProjectModal.css'

/**
 * 프로젝트 선택 모달
 */
function ProjectModal({
  isOpen,
  onClose,
  projects = [],
  currentProjectId,
  onProjectSelect,
  onProjectCreate,
  onProjectRename,
  onProjectDelete,
}) {
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  if (!isOpen) return null

  // 프로젝트 선택
  const handleSelectProject = (projectId) => {
    if (editingProjectId) return
    onProjectSelect(projectId)
    onClose()
  }

  // 이름 수정 시작
  const handleStartEdit = (project, e) => {
    e.stopPropagation()
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
  const handleCancelEdit = () => {
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

  // 새 프로젝트 생성 시작
  const handleStartCreate = () => {
    setIsCreating(true)
    setNewProjectName('')
  }

  // 새 프로젝트 생성 완료
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setIsCreating(false)
      return
    }
    const newProject = await onProjectCreate(newProjectName.trim())
    if (newProject) {
      onProjectSelect(newProject.id)
      onClose()
    }
    setIsCreating(false)
    setNewProjectName('')
  }

  // 새 프로젝트 생성 취소
  const handleCancelCreate = () => {
    setIsCreating(false)
    setNewProjectName('')
  }

  return (
    <div className="project-modal-overlay" onClick={onClose}>
      <div className="project-modal" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="project-modal-header">
          <div className="project-modal-title">
            <FolderOpen size={20} />
            <span>프로젝트 선택</span>
          </div>
          <button className="project-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 프로젝트 목록 */}
        <div className="project-modal-list">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`project-modal-item ${currentProjectId === project.id ? 'active' : ''}`}
              onClick={() => handleSelectProject(project.id)}
            >
              {editingProjectId === project.id ? (
                <div className="project-edit-form" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    className="project-edit-input"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename()
                      else if (e.key === 'Escape') handleCancelEdit()
                    }}
                    autoFocus
                  />
                  <button className="project-edit-save" onClick={handleSaveRename}>
                    <Check size={16} />
                  </button>
                  <button className="project-edit-cancel" onClick={handleCancelEdit}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="project-item-info">
                    <span className="project-item-icon">
                      <FolderOpen size={18} />
                    </span>
                    <span className="project-item-name">{project.name}</span>
                    {currentProjectId === project.id && (
                      <span className="project-item-current">현재</span>
                    )}
                  </div>
                  <div className="project-item-actions">
                    <button
                      className="project-action-button"
                      onClick={(e) => handleStartEdit(project, e)}
                      title="이름 변경"
                    >
                      <Edit3 size={16} />
                    </button>
                    {projects.length > 1 && (
                      <button
                        className="project-action-button delete"
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        title="삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {/* 새 프로젝트 생성 */}
          {isCreating ? (
            <div className="project-modal-item creating">
              <div className="project-edit-form">
                <input
                  type="text"
                  className="project-edit-input"
                  placeholder="새 프로젝트 이름"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProject()
                    else if (e.key === 'Escape') handleCancelCreate()
                  }}
                  autoFocus
                />
                <button className="project-edit-save" onClick={handleCreateProject}>
                  <Check size={16} />
                </button>
                <button className="project-edit-cancel" onClick={handleCancelCreate}>
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button className="project-modal-add" onClick={handleStartCreate}>
              <Plus size={18} />
              <span>새 프로젝트</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProjectModal
