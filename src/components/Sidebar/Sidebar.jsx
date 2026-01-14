import React, { useState } from 'react'
import ShareModal from '../Share/ShareModal'
import './Sidebar.css'

/**
 * 노션 스타일 사이드바
 */
function Sidebar({
  isOpen,
  onClose,
  // 프로젝트 관련
  projects = [],
  currentProjectId,
  onProjectSelect,
  onProjectCreate,
  onProjectRename,
  onProjectDelete,
  // 페이지 관련
  pages = [],
  currentPageId,
  onPageSelect,
  onPageCreate,
  onPageRename,
  onPageDelete,
  // 사용자
  userEmail,
  userAvatarUrl,
  onLogout,
  // 공유 관련
  sharedWithMe = { projects: [], pages: [] },
  getSharesForResource,
  onCreateShare,
  onUpdateSharePermission,
  onDeleteShare,
  sharingLoading = false,
}) {
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [sharedOpen, setSharedOpen] = useState(false)
  const [editingPageId, setEditingPageId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingProjectName, setEditingProjectName] = useState('')

  // 공유 모달 상태
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState({ type: null, id: null, name: '' })

  // 현재 프로젝트
  const currentProject = projects.find(p => p.id === currentProjectId)

  // 공유받은 항목이 있는지 확인
  const hasSharedItems = sharedWithMe.projects.length > 0 || sharedWithMe.pages.length > 0

  // 공유 모달 열기
  const openShareModal = (type, id, name, e) => {
    e?.stopPropagation()
    setShareTarget({ type, id, name })
    setShareModalOpen(true)
  }

  // 페이지 더블클릭 → 이름 수정
  const handlePageDoubleClick = (page) => {
    setEditingPageId(page.id)
    setEditingName(page.name)
  }

  const handleSaveRename = () => {
    if (editingPageId && editingName.trim()) {
      onPageRename(editingPageId, editingName.trim())
    }
    setEditingPageId(null)
    setEditingName('')
  }

  const handleCancelRename = () => {
    setEditingPageId(null)
    setEditingName('')
  }

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

  // 프로젝트 더블클릭 → 이름 수정
  const handleProjectDoubleClick = (project, e) => {
    e.stopPropagation()
    setEditingProjectId(project.id)
    setEditingProjectName(project.name)
  }

  const handleSaveProjectRename = () => {
    if (editingProjectId && editingProjectName.trim()) {
      onProjectRename(editingProjectId, editingProjectName.trim())
    }
    setEditingProjectId(null)
    setEditingProjectName('')
  }

  const handleCancelProjectRename = () => {
    setEditingProjectId(null)
    setEditingProjectName('')
  }

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

  const handleCreateProject = async () => {
    const name = prompt('새 프로젝트 이름을 입력하세요:', 'Untitled Project')
    if (name) {
      const newProject = await onProjectCreate(name)
      if (newProject) {
        onProjectSelect(newProject.id)
        setProjectsOpen(false)
      }
    }
  }

  const handleCreatePage = async () => {
    const name = prompt('새 페이지 이름을 입력하세요:', 'Untitled')
    if (name) {
      await onPageCreate(name)
    }
  }

  return (
    <>
      {/* 오버레이 */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={onClose}></div>
      )}

      {/* 사이드바 */}
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* 헤더: 프로젝트 선택 */}
        <div className="sidebar-header">
          <div className="sidebar-project-section">
            <button
              className="sidebar-project-toggle"
              onClick={() => setProjectsOpen(!projectsOpen)}
            >
              <span className="project-icon">📁</span>
              <span className="project-name">{currentProject?.name || 'My Project'}</span>
            </button>

            {/* 프로젝트 드롭다운 */}
            {projectsOpen && (
              <div className="sidebar-projects-dropdown">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={`sidebar-project-item ${currentProjectId === project.id ? 'active' : ''}`}
                    onClick={() => {
                      if (editingProjectId !== project.id) {
                        onProjectSelect(project.id)
                        setProjectsOpen(false)
                      }
                    }}
                    onDoubleClick={(e) => handleProjectDoubleClick(project, e)}
                  >
                    {editingProjectId === project.id ? (
                      <input
                        type="text"
                        className="project-name-input"
                        value={editingProjectName}
                        onChange={(e) => setEditingProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveProjectRename()
                          } else if (e.key === 'Escape') {
                            handleCancelProjectRename()
                          }
                        }}
                        onBlur={handleSaveProjectRename}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span className="project-item-icon">📁</span>
                        <span className="project-item-name">{project.name}</span>
                        <div className="project-item-actions">
                          <button
                            className="project-share-button"
                            onClick={(e) => openShareModal('project', project.id, project.name, e)}
                            title="프로젝트 공유"
                          >
                            공유
                          </button>
                          {projects.length > 1 && (
                            <button
                              className="project-delete-button"
                              onClick={(e) => handleDeleteProject(project.id, e)}
                              title="프로젝트 삭제"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <button className="add-project-button" onClick={handleCreateProject}>
                  + 새 프로젝트
                </button>
              </div>
            )}
          </div>

          <button className="sidebar-close-button sidebar-close-button-desktop" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* 콘텐츠: 페이지 리스트 */}
        <div className="sidebar-content">
          <div className="sidebar-pages-header">Pages</div>

          {/* 페이지 목록 */}
          <div className="page-list">
            {pages.map((page) => (
              <div
                key={page.id}
                className={`page-item ${currentPageId === page.id ? 'active' : ''}`}
                onClick={() => {
                  if (editingPageId !== page.id) {
                    onPageSelect(page.id)
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
                    <span className="page-icon">📄</span>
                    <span className="page-name">{page.name}</span>
                    <div className="page-item-actions">
                      <button
                        className="page-share-button"
                        onClick={(e) => openShareModal('page', page.id, page.name, e)}
                        title="페이지 공유"
                      >
                        공유
                      </button>
                      {pages.length > 1 && (
                        <button
                          className="page-delete-button"
                          onClick={(e) => handleDeletePage(page.id, e)}
                          title="페이지 삭제"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* 새 페이지 추가 버튼 */}
          <button className="add-page-button" onClick={handleCreatePage}>
            + 새 페이지
          </button>

          {/* 공유받은 항목 섹션 */}
          {hasSharedItems && (
            <>
              <div className="sidebar-section-divider"></div>
              <div className="sidebar-shared-section">
                <button
                  className="sidebar-shared-toggle"
                  onClick={() => setSharedOpen(!sharedOpen)}
                >
                  👥
                  <span>공유받은 항목</span>
                  <span className="shared-chevron">{sharedOpen ? '▴' : '▾'}</span>
                </button>

                {sharedOpen && (
                  <div className="shared-items-list">
                    {/* 공유받은 프로젝트 */}
                    {sharedWithMe.projects.map((project) => (
                      <div
                        key={project.id}
                        className="shared-item shared-project"
                        onClick={() => onProjectSelect(project.id)}
                      >
                        <span className="shared-item-icon">📁</span>
                        <span className="shared-item-name">{project.name}</span>
                        <span className={`shared-permission ${project.shareInfo?.permission}`}>
                          {project.shareInfo?.permission === 'editor' ? '편집' : '뷰어'}
                        </span>
                      </div>
                    ))}

                    {/* 공유받은 페이지 */}
                    {sharedWithMe.pages.map((page) => (
                      <div
                        key={page.id}
                        className="shared-item shared-page"
                        onClick={() => {
                          if (page.project_id) {
                            onProjectSelect(page.project_id)
                          }
                          onPageSelect(page.id)
                        }}
                      >
                        <span className="shared-item-icon">📄</span>
                        <span className="shared-item-name">{page.name}</span>
                        <span className={`shared-permission ${page.shareInfo?.permission}`}>
                          {page.shareInfo?.permission === 'editor' ? '편집' : '뷰어'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 사이드바 푸터: 사용자 프로필 + 로그아웃 */}
        <div className="sidebar-footer">
          <div className="sidebar-user-profile">
            <div className="user-avatar">
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt="Profile" className="user-avatar-image" />
              ) : (
                userEmail ? userEmail.charAt(0).toUpperCase() : 'U'
              )}
            </div>
            <div className="user-info">
              <div className="user-email">{userEmail || 'User'}</div>
            </div>
          </div>
          <button
            className="sidebar-logout-button"
            onClick={() => {
              if (window.confirm('로그아웃 하시겠습니까?')) {
                onLogout()
              }
            }}
            title="로그아웃"
          >
            <span className="logout-icon">⎋</span>
            <span className="logout-text">로그아웃</span>
          </button>
        </div>
      </div>

      {/* 공유 모달 */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        resourceType={shareTarget.type}
        resourceId={shareTarget.id}
        resourceName={shareTarget.name}
        shares={getSharesForResource?.(shareTarget.type, shareTarget.id) || []}
        onCreateShare={onCreateShare}
        onUpdatePermission={onUpdateSharePermission}
        onDeleteShare={onDeleteShare}
        isLoading={sharingLoading}
      />
    </>
  )
}

export default Sidebar
