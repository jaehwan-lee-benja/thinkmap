import React, { useState } from 'react'
import { HardDrive, Shield } from 'lucide-react'
import ShareModal from '../Share/ShareModal'
import ProjectModal from '../Project/ProjectModal'
import BackupModal from '../Backup/BackupModal'
import AdminModal from '../Admin/AdminModal'
import { SidebarHeader } from './components/SidebarHeader'
import { PageTree } from './components/PageTree'
import { useProjectContext } from '../../contexts/ProjectContext'
import { usePageContext } from '../../contexts/PageContext'
import { useSharingContext } from '../../contexts/SharingContext'
import { useBackupContext } from '../../contexts/BackupContext'
import { useAuthContext } from '../../contexts/AuthContext'
import { useUIContext } from '../../contexts/UIContext'
import './Sidebar.css'

/**
 * 노션 스타일 사이드바
 */
function Sidebar() {
  const { projects, currentProjectId, setCurrentProjectId, createProject, renameProject, deleteProject } = useProjectContext()
  const { pages, pageTree, currentPageId, setCurrentPageId, createPage, renamePage, deletePage, reorderPages, getDescendantCount, expandedPages, saveExpandedPages } = usePageContext()
  const { sharedWithMe, sharingLoading, createShare, updateSharePermission, deleteShare, getSharesForResource } = useSharingContext()
  const { backups, backupLoading, createBackup, restoreBackup, deleteBackup, exportBackup, importBackup, refreshBackups } = useBackupContext()
  const { userEmail, userAvatarUrl, handleLogout, isMaster, isImpersonating, impersonatedEmail, startImpersonation, stopImpersonation, users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers } = useAuthContext()
  const { sidebarOpen: isOpen, closeSidebar: onClose } = useUIContext()

  const [sharedOpen, setSharedOpen] = useState(false)

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

  // 공유 모달 열기
  const openShareModal = (type, id, name, e) => {
    e?.stopPropagation()
    setShareTarget({ type, id, name })
    setShareModalOpen(true)
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
        <SidebarHeader
          currentProject={currentProject}
          onOpenProjectModal={() => setProjectModalOpen(true)}
          onClose={onClose}
        />

        {/* 콘텐츠: 페이지 리스트 */}
        <div className="sidebar-content">
          <div className="sidebar-pages-header">Pages</div>

          {/* 페이지 트리 */}
          <PageTree
            pages={pages}
            pageTree={pageTree}
            currentPageId={currentPageId}
            onPageSelect={setCurrentPageId}
            onPageCreate={createPage}
            onPageRename={renamePage}
            onPageDelete={deletePage}
            onReorderPages={reorderPages}
            getDescendantCount={getDescendantCount}
            savedExpandedPages={expandedPages}
            onExpandedPagesChange={saveExpandedPages}
            onOpenShare={openShareModal}
          />

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
                        onClick={() => setCurrentProjectId(project.id)}
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
                            setCurrentProjectId(page.project_id)
                          }
                          setCurrentPageId(page.id)
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
              onClick={stopImpersonation}
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
                handleLogout()
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
        onCreateShare={createShare}
        onUpdatePermission={updateSharePermission}
        onDeleteShare={deleteShare}
        isLoading={sharingLoading}
      />

      {/* 프로젝트 모달 */}
      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        projects={projects}
        currentProjectId={currentProjectId}
        onProjectSelect={setCurrentProjectId}
        onProjectCreate={createProject}
        onProjectRename={renameProject}
        onProjectDelete={deleteProject}
      />

      {/* 백업 모달 */}
      <BackupModal
        isOpen={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        project={currentProject}
        pages={pages}
        backups={backups}
        isLoading={backupLoading}
        onCreateBackup={createBackup}
        onRestoreBackup={restoreBackup}
        onDeleteBackup={deleteBackup}
        onExportBackup={exportBackup}
        onImportBackup={importBackup}
        onRefresh={refreshBackups}
      />

      {/* 관리자 모달 (마스터 전용) */}
      {isMaster && (
        <AdminModal
          isOpen={adminModalOpen}
          onClose={() => setAdminModalOpen(false)}
          users={users}
          usersLoading={usersLoading}
          onAddUser={addUser}
          onUpdateUserRole={updateUserRole}
          onUpdateUserStatus={updateUserStatus}
          onDeleteUser={deleteUser}
          onRefresh={fetchUsers}
          onStartImpersonation={startImpersonation}
        />
      )}
    </>
  )
}

export default Sidebar
