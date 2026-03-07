import React, { useState } from 'react'
import { FolderOpen, Plus, Trash2, Edit3, Check, X } from 'lucide-react'
import { Modal, ModalHeader } from '../Common/Modal/Modal'
import { useEditableField } from '../../hooks/useEditableField'
import { useConfirmAction } from '../../hooks/useConfirmAction'
import './ProjectModal.css'

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
  const [isCreating, setIsCreating] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  const editing = useEditableField(onProjectRename)

  const { execute: handleDelete } = useConfirmAction(onProjectDelete, {
    items: projects,
    minRequired: 1,
    blockMessage: '마지막 프로젝트는 삭제할 수 없습니다.',
    confirmMessage: '이 프로젝트를 삭제하시겠습니까?\n프로젝트의 모든 페이지와 블록이 삭제됩니다.',
  })

  const handleSelectProject = (projectId) => {
    if (editing.editingId) return
    onProjectSelect(projectId)
    onClose()
  }

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="project-modal">
      <ModalHeader icon={FolderOpen} title="프로젝트 선택" onClose={onClose} />

      <div className="project-modal-list">
        {projects.map((project) => (
          <div
            key={project.id}
            className={`project-modal-item ${currentProjectId === project.id ? 'active' : ''}`}
            onClick={() => handleSelectProject(project.id)}
          >
            {editing.isEditing(project.id) ? (
              <div className="project-edit-form" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  className="project-edit-input"
                  value={editing.editingValue}
                  onChange={(e) => editing.setEditingValue(e.target.value)}
                  onKeyDown={editing.handleKeyDown}
                  autoFocus
                />
                <button className="project-edit-save" onClick={editing.saveEdit}>
                  <Check size={16} />
                </button>
                <button className="project-edit-cancel" onClick={editing.cancelEdit}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="project-item-info">
                  <span className="project-item-icon"><FolderOpen size={18} /></span>
                  <span className="project-item-name">{project.name}</span>
                  {currentProjectId === project.id && (
                    <span className="project-item-current">현재</span>
                  )}
                </div>
                <div className="project-item-actions">
                  <button
                    className="project-action-button"
                    onClick={(e) => { e.stopPropagation(); editing.startEdit(project.id, project.name) }}
                    title="이름 변경"
                  >
                    <Edit3 size={16} />
                  </button>
                  {projects.length > 1 && (
                    <button
                      className="project-action-button delete"
                      onClick={(e) => handleDelete(project.id, e)}
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
                  else if (e.key === 'Escape') { setIsCreating(false); setNewProjectName('') }
                }}
                autoFocus
              />
              <button className="project-edit-save" onClick={handleCreateProject}>
                <Check size={16} />
              </button>
              <button className="project-edit-cancel" onClick={() => { setIsCreating(false); setNewProjectName('') }}>
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <button className="project-modal-add" onClick={() => { setIsCreating(true); setNewProjectName('') }}>
            <Plus size={18} />
            <span>새 프로젝트</span>
          </button>
        )}
      </div>
    </Modal>
  )
}

export default ProjectModal
