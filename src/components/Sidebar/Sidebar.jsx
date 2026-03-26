import React, { useState } from 'react'
import { HardDrive, PenLine, Columns3, GitBranch, CalendarDays } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useIsMobile } from '../../hooks/useIsMobile'
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
function Sidebar({ isOpen, onClose, onPageSelect, onProjectSelect, mobileView, onMobileViewChange }) {
  const { isTablet } = useIsMobile()
  const { projects, currentProjectId, createProject, renameProject, deleteProject } = useProjectContext()
  const { pages, pageTree, currentPageId, createPage, renamePage, deletePage, reorderPages, getDescendantCount, expandedPages, saveExpandedPages } = usePageContext()
  const { sharedWithMe, sharingLoading, createShare, updateSharePermission, deleteShare, getSharesForResource } = useSharingContext()
  const { backups, backupLoading, createBackup, restoreBackup, deleteBackup, exportBackup, importBackup, refreshBackups } = useBackupContext()

  const [sharedOpen, setSharedOpen] = useState(false)
  const [backupModalOpen, setBackupModalOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)

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
          {/*
            업무일지 고정 항목 — 모든 계정의 사이드바 최상단에 표시
            [향후] 계정별 개인 업무일지 분리 시, 여기서 owner_id 기반 필터링 추가
          */}
          <div className="sidebar-worklog-fixed">
            <button
              className={`sidebar-worklog-btn ${currentPageId && pages.find(p => p.id === currentPageId)?.page_type === 'calendar' ? 'active' : ''}`}
              onClick={async () => {
                // page_type='calendar'인 페이지 찾기
                let calendarPage = pages.find(p => p.page_type === 'calendar')

                if (!calendarPage) {
                  // DB에서 page_type='calendar' 확인
                  const { data } = await supabase
                    .from('pages')
                    .select('id')
                    .eq('project_id', currentProjectId)
                    .eq('page_type', 'calendar')
                    .limit(1)
                    .single()

                  if (data) {
                    handlePageSelect(data.id)
                    window.location.reload()
                    return
                  }

                  // calendar 페이지가 없으면 새로 생성 (기존 페이지를 변환하지 않음)
                  const newPage = await createPage('업무일지', null, null)
                  if (newPage) {
                    await supabase
                      .from('pages')
                      .update({ page_type: 'calendar' })
                      .eq('id', newPage.id)
                    // 로컬 상태에 page_type 반영을 위해 리로드
                    handlePageSelect(newPage.id)
                    window.location.reload()
                    return
                  }
                } else {
                  handlePageSelect(calendarPage.id)
                }
              }}
            >
              <CalendarDays size={16} />
              <span>업무일지(개발중)</span>
            </button>
          </div>

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

          {/* 모드 변경 (모바일/태블릿만) */}
          {isTablet && onMobileViewChange && (
            <>
              <div className="sidebar-section-divider" />
              <div className="sidebar-mode-section">
                <button
                  className="sidebar-mode-toggle"
                  onClick={() => setModeOpen(!modeOpen)}
                >
                  <span>모드 변경</span>
                  <span className="shared-chevron">{modeOpen ? '▴' : '▾'}</span>
                </button>
                {modeOpen && (
                  <div className="sidebar-mode-list">
                    <button
                      className={`sidebar-mode-item ${mobileView === 'editor' ? 'active' : ''}`}
                      onClick={() => { onMobileViewChange('editor'); onClose() }}
                    >
                      <PenLine size={16} />
                      <span>에디터</span>
                    </button>
                    <button
                      className={`sidebar-mode-item ${mobileView === 'column' ? 'active' : ''}`}
                      onClick={() => { onMobileViewChange('column'); onClose() }}
                    >
                      <Columns3 size={16} />
                      <span>칼럼</span>
                    </button>
                    <button
                      className={`sidebar-mode-item ${mobileView === 'mindmap' ? 'active' : ''}`}
                      onClick={() => { onMobileViewChange('mindmap'); onClose() }}
                    >
                      <GitBranch size={16} />
                      <span>마인드맵</span>
                    </button>
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
