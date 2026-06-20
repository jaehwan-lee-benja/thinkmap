import React, { useState } from 'react'
import { HardDrive, PenLine, Columns3, GitBranch, CalendarDays, Target, Calendar, Receipt, LayoutDashboard, Users, Flag } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { generateUUID } from '../../utils/uuid'
import { useIsMobile } from '../../hooks/useIsMobile'
import ShareModal from '../Share/ShareModal'
import ProjectModal from '../Project/ProjectModal'
import BackupModal from '../Backup/BackupModal'
import CreateCanvasModal from '../Canvas/CreateCanvasModal'
import { SidebarHeader } from './components/SidebarHeader'
import { PageTree } from './components/PageTree'
import { useProjectContext } from '../../contexts/ProjectContext'
import { usePageContext } from '../../contexts/PageContext'
import { useSharingContext } from '../../contexts/SharingContext'
import { useBackupContext } from '../../contexts/BackupContext'
import { usePaneData } from '../PaneProvider'
import { isCalendarPage, isSchedulePage, isPayrollPage, isDashboardPage, isMembersPage, isGoalPage } from '../../utils/pageTypes'
import { findOrCreateMembersPage } from '../../utils/membersPage'
import './Sidebar.css'

/**
 * 패널 내 사이드바 (오버레이)
 * - 프로젝트 선택 + 페이지 트리
 * - 각 분할 패널에 독립적으로 렌더링
 */
function Sidebar({ isOpen, onClose, onPageSelect, onProjectSelect, mobileView, onMobileViewChange }) {
  const { isTablet } = useIsMobile()
  const { effectiveSession, isMaster } = usePaneData()
  const { projects, currentProjectId, createProject, renameProject, deleteProject } = useProjectContext()
  const { pages, pageTree, currentPageId, createPage, renamePage, deletePage, reorderPages, getDescendantCount, expandedPages, saveExpandedPages, fetchPages } = usePageContext()
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

  // 마케팅 캔버스 생성 모달
  const [canvasModalOpen, setCanvasModalOpen] = useState(false)

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
            {/* 목표 — 최상위 레이어. 일반 페이지처럼 자유 텍스트로 동작(독립 엔티티).
                계정별 단일 목표 페이지를 find-or-create. 트리에서는 이 아래로 페이지를 끌어 모은다. */}
            <button
              className={`sidebar-worklog-btn ${currentPageId && isGoalPage(pages.find(p => p.id === currentPageId)) ? 'active' : ''}`}
              onClick={async () => {
                // 메모리 캐시 우선 (fetchPages 가 owner 범위로 가져온 내 목표)
                let goalPage = pages.find(p => isGoalPage(p))

                // DB 직접 조회 (캐시에 없을 수 있음) — 내 소유로 한정 (마스터는 전부 보이므로 user_id 필터 필수)
                if (!goalPage) {
                  const { data } = await supabase
                    .from('pages')
                    .select('id')
                    .eq('page_type', 'goal')
                    .eq('user_id', effectiveSession.user.id)
                    .is('deleted_at', null)
                    .limit(1)
                    .maybeSingle()
                  if (data) goalPage = { id: data.id, page_type: 'goal' }
                }

                // 없으면 신규 생성 (독립 엔티티 — project_id=null, 트리 최상단)
                if (!goalPage) {
                  const newPageId = generateUUID()
                  const { error } = await supabase
                    .from('pages')
                    .insert([{
                      id: newPageId,
                      user_id: effectiveSession.user.id,
                      name: '목표',
                      page_type: 'goal',
                      project_id: null,
                      parent_id: null,
                      position: -2,    // 캘린더(-1)보다 위
                    }])
                  if (error) {
                    console.error('목표 페이지 생성 실패:', error)
                    return
                  }
                  goalPage = { id: newPageId, page_type: 'goal' }
                }

                // 캐시 갱신 후 선택 (reload 없음)
                if (typeof fetchPages === 'function') await fetchPages()
                handlePageSelect(goalPage.id)
              }}
            >
              <Flag size={16} />
              <span>목표</span>
            </button>

            {/* 캘린더 — 업무일지 위쪽 */}
            <button
              className={`sidebar-worklog-btn ${currentPageId && isSchedulePage(pages.find(p => p.id === currentPageId)) ? 'active' : ''}`}
              onClick={async () => {
                // 메모리 캐시 우선
                let schedulePage = pages.find(p => isSchedulePage(p))

                // DB 직접 조회 (캐시에 없을 수 있음 — 다른 사용자/계정이 만든 경우 포함)
                if (!schedulePage) {
                  const { data } = await supabase
                    .from('pages')
                    .select('id')
                    .eq('page_type', 'schedule')
                    .is('deleted_at', null)
                    .limit(1)
                    .maybeSingle()
                  if (data) schedulePage = { id: data.id, page_type: 'schedule' }
                }

                // 그래도 없으면 신규 생성
                if (!schedulePage) {
                  const newPageId = generateUUID()
                  const { error } = await supabase
                    .from('pages')
                    .insert([{
                      id: newPageId,
                      user_id: effectiveSession.user.id,
                      name: '캘린더',
                      page_type: 'schedule',
                      project_id: null,
                      parent_id: null,
                      position: -1,    // 업무일지보다 위
                    }])
                  if (error) {
                    console.error('캘린더 페이지 생성 실패:', error)
                    return
                  }
                  schedulePage = { id: newPageId, page_type: 'schedule' }
                }

                // PageContext 캐시 갱신 후 선택 (reload 없음)
                if (typeof fetchPages === 'function') await fetchPages()
                handlePageSelect(schedulePage.id)
              }}
            >
              <Calendar size={16} />
              <span>캘린더</span>
            </button>

            {/* 대시보드 — 캘린더 아래. 마스터 전용 (비마스터에겐 진입 자체를 숨김). */}
            {isMaster && (
            <button
              className={`sidebar-worklog-btn ${currentPageId && isDashboardPage(pages.find(p => p.id === currentPageId)) ? 'active' : ''}`}
              onClick={async () => {
                // 메모리 캐시 우선
                let dashboardPage = pages.find(p => isDashboardPage(p))

                // DB 직접 조회 (캐시에 없을 수 있음 — 다른 사용자/계정이 만든 경우 포함)
                if (!dashboardPage) {
                  const { data } = await supabase
                    .from('pages')
                    .select('id')
                    .eq('page_type', 'dashboard')
                    .is('deleted_at', null)
                    .limit(1)
                    .maybeSingle()
                  if (data) dashboardPage = { id: data.id, page_type: 'dashboard' }
                }

                // 그래도 없으면 신규 생성 (단 1번)
                if (!dashboardPage) {
                  const newPageId = generateUUID()
                  const { error } = await supabase
                    .from('pages')
                    .insert([{
                      id: newPageId,
                      user_id: effectiveSession.user.id,
                      name: '대시보드',
                      page_type: 'dashboard',
                      project_id: null,
                      parent_id: null,
                      position: -1,
                    }])
                  if (error) {
                    console.error('대시보드 페이지 생성 실패:', error)
                    return
                  }
                  dashboardPage = { id: newPageId, page_type: 'dashboard' }
                }

                // PageContext 캐시 갱신 후 선택 (reload 없음)
                if (typeof fetchPages === 'function') await fetchPages()
                handlePageSelect(dashboardPage.id)
              }}
            >
              <LayoutDashboard size={16} />
              <span>대시보드</span>
            </button>
            )}

            <button
              className={`sidebar-worklog-btn ${currentPageId && isCalendarPage(pages.find(p => p.id === currentPageId)) ? 'active' : ''}`}
              onClick={async () => {
                // page_type='calendar'인 페이지 찾기 (프로젝트 무관 — 업무일지는 독립 엔티티)
                let calendarPage = pages.find(p => isCalendarPage(p))

                if (!calendarPage) {
                  // DB에서 page_type='calendar' 확인 (project_id 필터 없음)
                  const { data } = await supabase
                    .from('pages')
                    .select('id')
                    .eq('page_type', 'calendar')
                    .is('deleted_at', null)
                    .limit(1)
                    .single()

                  if (data) {
                    handlePageSelect(data.id)
                    window.location.reload()
                    return
                  }

                  // calendar 페이지가 없으면 새로 생성 (project_id = null)
                  const newPageId = generateUUID()
                  const { error } = await supabase
                    .from('pages')
                    .insert([{
                      id: newPageId,
                      user_id: effectiveSession.user.id,
                      name: '업무일지',
                      page_type: 'calendar',
                      project_id: null,
                      parent_id: null,
                      position: 0,
                    }])
                  if (!error) {
                    handlePageSelect(newPageId)
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
            {/* 마케팅 캔버스 + 급여명세서 — 마스터 전용 */}
            {isMaster && (
              <>
                <button
                  className="sidebar-worklog-btn"
                  onClick={() => setCanvasModalOpen(true)}
                  title="새 마케팅 캔버스 만들기"
                >
                  <Target size={16} />
                  <span>+ 마케팅 캔버스</span>
                </button>

                <button
                  className={`sidebar-worklog-btn ${currentPageId && isPayrollPage(pages.find(p => p.id === currentPageId)) ? 'active' : ''}`}
                  title="급여명세서 (마스터 전용)"
                  onClick={async () => {
                    // 메모리 캐시 우선
                    let payrollPage = pages.find(p => isPayrollPage(p))

                    // DB 직접 조회 (캐시에 없을 수 있음)
                    if (!payrollPage) {
                      const { data, error } = await supabase
                        .from('pages')
                        .select('id')
                        .eq('page_type', 'payroll')
                        .is('deleted_at', null)
                        .limit(1)
                        .maybeSingle()
                      if (error) { alert('급여명세서 조회 실패: ' + error.message); return }
                      if (data) payrollPage = { id: data.id, page_type: 'payroll' }
                    }

                    // 없으면 신규 생성
                    if (!payrollPage) {
                      const newPageId = generateUUID()
                      const { error } = await supabase
                        .from('pages')
                        .insert([{
                          id: newPageId,
                          user_id: effectiveSession.user.id,
                          name: '급여명세서',
                          page_type: 'payroll',
                          project_id: null,
                          parent_id: null,
                          position: -1,
                        }])
                      if (error) {
                        alert('급여명세서 페이지 생성 실패: ' + error.message)
                        return
                      }
                      payrollPage = { id: newPageId, page_type: 'payroll' }
                    }

                    if (typeof fetchPages === 'function') await fetchPages()
                    handlePageSelect(payrollPage.id)
                  }}
                >
                  <Receipt size={16} />
                  <span>급여명세서</span>
                </button>

                <button
                  className={`sidebar-worklog-btn ${currentPageId && isMembersPage(pages.find(p => p.id === currentPageId)) ? 'active' : ''}`}
                  title="멤버 관리 (마스터 전용)"
                  onClick={async () => {
                    // 캐시 우선 → 없으면 공유 헬퍼로 find-or-create (배치도 모달과 동일 경로)
                    let pageId = pages.find(p => isMembersPage(p))?.id
                    if (!pageId) pageId = await findOrCreateMembersPage(effectiveSession.user.id)
                    if (!pageId) return
                    if (typeof fetchPages === 'function') await fetchPages()
                    handlePageSelect(pageId)
                  }}
                >
                  <Users size={16} />
                  <span>멤버 관리</span>
                </button>
              </>
            )}
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

      {/* 마케팅 캔버스 생성 모달 */}
      <CreateCanvasModal
        isOpen={canvasModalOpen}
        onClose={() => setCanvasModalOpen(false)}
        userId={effectiveSession?.user?.id}
        masterId={effectiveSession?.user?.id}
        onCreated={async (pairId, framePageId) => {
          // PageContext 가 새로 만든 frame/engine 페이지를 인식하도록 먼저 fetch
          if (typeof fetchPages === 'function') {
            await fetchPages()
          } else {
            window.dispatchEvent(new CustomEvent('pages-refresh'))
          }
          // 그 다음 새 frame 페이지로 이동
          handlePageSelect(framePageId)
        }}
      />
    </>
  )
}

export default Sidebar
