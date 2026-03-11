import React, { useState } from 'react'
import { HardDrive } from 'lucide-react'
import ShareModal from '../Share/ShareModal'
import ProjectModal from '../Project/ProjectModal'
import BackupModal from '../Backup/BackupModal'
import { SidebarHeader } from './components/SidebarHeader'
import { PageTree } from './components/PageTree'
import { useProjectContext } from '../../contexts/ProjectContext'
import { usePageContext } from '../../contexts/PageContext'
import { useSharingContext } from '../../contexts/SharingContext'
import { useBackupContext } from '../../contexts/BackupContext'
import './Sidebar.css'

/**
 * 패널 내 사이드바 (오버레이)
 * - 프로젝트 선택 + 페이지 트리
 * - 각 분할 패널에 독립적으로 렌더링
 */
function Sidebar({ isOpen, onClose, onPageSelect, onProjectSelect }) {
  const { projects, currentProjectId, createProject, renameProject, deleteProject } = useProjectContext()
  const { pages, pageTree, currentPageId, createPage, renamePage, deletePage, reorderPages, getDescendantCount, expandedPages, saveExpandedPages } = usePageContext()
  const { sharedWithMe, sharingLoading, createShare, updateSharePermission, deleteShare, getSharesForResource } = useSharingContext()
  const { backups, backupLoading, createBackup, restoreBackup, deleteBackup, exportBackup, importBackup, refreshBackups } = useBackupContext()

  const [sharedOpen, setSharedOpen] = useState(false)
  const [backupModalOpen, setBackupModalOpen] = useState(false)

  // 공유 모달 상태
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState({ type: null, id: null, name: '' })

  // 프로젝트 모달 상태
  const [projectModalOpen, setProjectModalOpen] = useState(false)

  const currentProject = projects.find(p => p.id === currentProjectId)
  const hasSharedItems = sharedWithMe.projects.length > 0 || sharedWithMe.pages.length > 0

  const openShareModal = (type, id, name, e) => {
    e?.stopPropagation()
    setShareTarget({ type, id, name })
    setShareModalOpen(true)
  }

  const handlePageSelect = (pageId) => {
    if (onPageSelect) onPageSelect(pageId)
  }

  const handleProjectSelect = (projectId) => {
    if (onProjectSelect) onProjectSelect(projectId)
  }

  return (
    <>
      {/* 오버레이 (패널 내) */}
      {isOpen && (
        <div className="pane-sidebar-overlay" onClick={onClose} />
      )}

      <div className={`pane-sidebar ${isOpen ? 'open' : ''}`}>
        {/* 헤더: 프로젝트 선택 */}
        <SidebarHeader
          currentProject={currentProject}
          onOpenProjectModal={() => setProjectModalOpen(true)}
          onClose={onClose}
        />

        {/* 페이지 리스트 */}
        <div className="sidebar-content">
          <div className="sidebar-pages-header">Pages</div>

          <PageTree
            pages={pages}
            pageTree={pageTree}
            currentPageId={currentPageId}
            onPageSelect={handlePageSelect}
            onPageCreate={createPage}
            onPageRename={renamePage}
            onPageDelete={deletePage}
            onReorderPages={reorderPages}
            getDescendantCount={getDescendantCount}
            savedExpandedPages={expandedPages}
            onExpandedPagesChange={saveExpandedPages}
            onOpenShare={openShareModal}
          />

          {/* 공유받은 항목 */}
          {hasSharedItems && (
            <>
              <div className="sidebar-section-divider" />
              <div className="sidebar-shared-section">
                <button
                  className="sidebar-shared-toggle"
                  onClick={() => setSharedOpen(!sharedOpen)}
                >
                  <span>공유받은 항목</span>
                  <span className="shared-chevron">{sharedOpen ? '▴' : '▾'}</span>
                </button>

                {sharedOpen && (
                  <div className="shared-items-list">
                    {sharedWithMe.projects.map((project) => (
                      <div
                        key={project.id}
                        className="shared-item shared-project"
                        onClick={() => handleProjectSelect(project.id)}
                      >
                        <span className="shared-item-name">{project.name}</span>
                        <span className={`shared-permission ${project.shareInfo?.permission}`}>
                          {project.shareInfo?.permission === 'editor' ? '편집' : '뷰어'}
                        </span>
                      </div>
                    ))}
                    {sharedWithMe.pages.map((page) => (
                      <div
                        key={page.id}
                        className="shared-item shared-page"
                        onClick={() => {
                          if (page.project_id) handleProjectSelect(page.project_id)
                          handlePageSelect(page.id)
                        }}
                      >
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

          {/* 백업 */}
          <div className="sidebar-backup-section">
            <button
              className="sidebar-backup-button"
              onClick={() => setBackupModalOpen(true)}
            >
              <HardDrive size={15} />
              <span>프로젝트 백업</span>
            </button>
          </div>
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
        onProjectSelect={handleProjectSelect}
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
    </>
  )
}

export default Sidebar
