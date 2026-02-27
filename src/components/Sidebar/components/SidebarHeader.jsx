import React from 'react'

export function SidebarHeader({ currentProject, onOpenProjectModal, onClose }) {
  return (
    <div className="sidebar-header">
      <div className="sidebar-project-section">
        <button
          className="sidebar-project-toggle"
          onClick={onOpenProjectModal}
        >
          <span className="project-icon">📁</span>
          <span className="project-name">{currentProject?.name || 'My Project'}</span>
        </button>
      </div>
      <button className="sidebar-close-button sidebar-close-button-desktop" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}
