import React, { useState, useEffect } from 'react'
import { HardDrive, Shield } from 'lucide-react'
import ShareModal from '../Share/ShareModal'
import ProjectModal from '../Project/ProjectModal'
import BackupModal from '../Backup/BackupModal'
import AdminModal from '../Admin/AdminModal'
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
  pageTree = [],
  currentPageId,
  onPageSelect,
  onPageCreate,
  onPageRename,
  onPageDelete,
  getDescendantCount,
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
  // 백업 관련
  backups = [],
  backupLoading = false,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  onExportBackup,
  onImportBackup,
  onRefreshBackups,
  // 마스터 관련
  isMaster = false,
  users = [],
  usersLoading = false,
  onAddUser,
  onUpdateUserRole,
  onUpdateUserStatus,
  onDeleteUser,
  onRefreshUsers,
  // 펼침 상태 동기화
  expandedPages: savedExpandedPages = {},
  onExpandedPagesChange,
  // 임퍼소네이션
  isImpersonating = false,
  impersonatedEmail,
  onStopImpersonation,
  onStartImpersonation,
}) {
  const [sharedOpen, setSharedOpen] = useState(false)
  const [editingPageId, setEditingPageId] = useState(null)
  const [editingName, setEditingName] = useState('')

  // 트리 접기/펼치기 상태 (pageId → boolean)
  const [expandedPages, setExpandedPages] = useState(savedExpandedPages)

  // 공유 모달 상태
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState({ type: null, id: null, name: '' })

  // 프로젝트 모달 상태
  const [projectModalOpen, setProjectModalOpen] = useState(false)

  // 백업 모달 상태
  const [backupModalOpen, setBackupModalOpen] = useState(false)

  // 관리자 모달 상태 (마스터 전용)
  const [adminModalOpen, setAdminModalOpen] = useState(false)

  // 현재 프로젝트
  const currentProject = projects.find(p => p.id === currentProjectId)

  // 공유받은 항목이 있는지 확인
  const hasSharedItems = sharedWithMe.projects.length > 0 || sharedWithMe.pages.length > 0

  // DB에서 불러온 상태가 변경되면 로컬에 반영
  useEffect(() => {
    if (savedExpandedPages && Object.keys(savedExpandedPages).length > 0) {
      setExpandedPages(savedExpandedPages)
    }
  }, [savedExpandedPages])

  // 트리 토글
  const toggleExpand = (pageId, e) => {
    e.stopPropagation()
    const updated = { ...expandedPages, [pageId]: !expandedPages[pageId] }
    setExpandedPages(updated)
    onExpandedPagesChange?.(updated)
  }

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

    // 최상위 페이지가 하나뿐인지 확인
    const rootPages = pages.filter(p => !p.parent_id)
    const targetPage = pages.find(p => p.id === pageId)
    if (!targetPage) return

    if (!targetPage.parent_id && rootPages.length <= 1) {
      alert('마지막 최상위 페이지는 삭제할 수 없습니다.')
      return
    }

    // 자손 수 확인 후 경고 메시지
    const descendantCount = getDescendantCount?.(pageId) || 0
    let confirmMessage = '이 페이지를 삭제하시겠습니까?\n페이지의 모든 블록이 삭제됩니다.'
    if (descendantCount > 0) {
      confirmMessage = `이 페이지를 삭제하시겠습니까?\n하위 페이지 ${descendantCount}개도 함께 삭제됩니다.`
    }

    if (window.confirm(confirmMessage)) {
      onPageDelete(pageId)
    }
  }

  // 하위 페이지 추가
  const handleCreateSubPage = async (parentId, e) => {
    e.stopPropagation()
    const name = prompt('하위 페이지 이름을 입력하세요:', 'Untitled')
    if (name) {
      const newPage = await onPageCreate(name, parentId)
      if (newPage) {
        // 부모 페이지 자동 펼침
        const updated = { ...expandedPages, [parentId]: true }
        setExpandedPages(updated)
        onExpandedPagesChange?.(updated)
        onPageSelect(newPage.id)
      }
    }
  }

  // 최상위 페이지 추가
  const handleCreatePage = async () => {
    const name = prompt('새 페이지 이름을 입력하세요:', 'Untitled')
    if (name) {
      const newPage = await onPageCreate(name)
      if (newPage) {
        onPageSelect(newPage.id)
      }
    }
  }

  // 재귀 페이지 아이템 렌더링
  const renderPageItem = (page, depth = 0) => {
    const hasChildren = page.children && page.children.length > 0
    const isExpanded = expandedPages[page.id]

    return (
      <div key={page.id} className="page-tree-node">
        <div
          className={`page-item ${currentPageId === page.id ? 'active' : ''}`}
          style={{ paddingLeft: `${10 + depth * 20}px` }}
          onClick={() => {
            if (editingPageId !== page.id) {
              onPageSelect(page.id)
            }
          }}
          onDoubleClick={() => handlePageDoubleClick(page)}
        >
          {/* 토글 화살표 */}
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
                  className="page-subpage-button"
                  onClick={(e) => handleCreateSubPage(page.id, e)}
                  title="하위 페이지 추가"
                >
                  +
                </button>
                <button
                  className="page-share-button"
                  onClick={(e) => openShareModal('page', page.id, page.name, e)}
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

        {/* 자식 페이지 (펼쳐진 경우만 렌더링) */}
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
              onClick={() => setProjectModalOpen(true)}
            >
              <span className="project-icon">📁</span>
              <span className="project-name">{currentProject?.name || 'My Project'}</span>
            </button>
          </div>

          <button className="sidebar-close-button sidebar-close-button-desktop" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* 콘텐츠: 페이지 리스트 */}
        <div className="sidebar-content">
          <div className="sidebar-pages-header">Pages</div>

          {/* 페이지 트리 목록 */}
          <div className="page-list">
            {pageTree.map((page) => renderPageItem(page, 0))}
          </div>

          {/* 새 페이지 추가 버튼 */}
          <button className="add-page-button" onClick={handleCreatePage}>
            + 새 페이지
          </button>

          {/* 도구 모음 */}
          <div className="sidebar-tools-section">
            <div className="sidebar-tools-header">도구</div>
            <button
              className="sidebar-tool-button"
              onClick={() => setBackupModalOpen(true)}
            >
              <HardDrive size={16} />
              <span>프로젝트 백업</span>
            </button>
            {isMaster && (
              <button
                className="sidebar-tool-button master-button"
                onClick={() => setAdminModalOpen(true)}
              >
                <Shield size={16} />
                <span>관리자 패널</span>
              </button>
            )}
          </div>

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

        {/* 임퍼소네이션 배너 */}
        {isImpersonating && (
          <div className="impersonation-banner">
            <div className="impersonation-info">
              <span className="impersonation-icon">👤</span>
              <span className="impersonation-text">
                {impersonatedEmail} 계정으로 활동 중
              </span>
            </div>
            <button
              className="impersonation-exit-button"
              onClick={onStopImpersonation}
            >
              원래 계정으로 돌아가기
            </button>
          </div>
        )}

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

      {/* 프로젝트 모달 */}
      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        projects={projects}
        currentProjectId={currentProjectId}
        onProjectSelect={onProjectSelect}
        onProjectCreate={onProjectCreate}
        onProjectRename={onProjectRename}
        onProjectDelete={onProjectDelete}
      />

      {/* 백업 모달 */}
      <BackupModal
        isOpen={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        project={currentProject}
        pages={pages}
        backups={backups}
        isLoading={backupLoading}
        onCreateBackup={onCreateBackup}
        onRestoreBackup={onRestoreBackup}
        onDeleteBackup={onDeleteBackup}
        onExportBackup={onExportBackup}
        onImportBackup={onImportBackup}
        onRefresh={onRefreshBackups}
      />

      {/* 관리자 모달 (마스터 전용) */}
      {isMaster && (
        <AdminModal
          isOpen={adminModalOpen}
          onClose={() => setAdminModalOpen(false)}
          users={users}
          usersLoading={usersLoading}
          onAddUser={onAddUser}
          onUpdateUserRole={onUpdateUserRole}
          onUpdateUserStatus={onUpdateUserStatus}
          onDeleteUser={onDeleteUser}
          onRefresh={onRefreshUsers}
          onStartImpersonation={onStartImpersonation}
        />
      )}
    </>
  )
}

export default Sidebar
