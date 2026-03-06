import React, { useEffect, useState, useCallback } from 'react'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import Header from './components/Navigation/Header'
import Sidebar from './components/Sidebar/Sidebar'
import TipTapEditorPage from './components/TipTapEditor/TipTapTestPage'
import { useAuth } from './hooks/useAuth'
import { useUserPreferences } from './hooks/useUserPreferences'
import { useImpersonation } from './hooks/useImpersonation'
import { useProjects } from './hooks/useProjects'
import { usePages } from './hooks/usePages'
import { useSharing } from './hooks/useSharing'
import { useBackup } from './hooks/useBackup'
import { useUsers } from './hooks/useUsers'
import DeleteToast from './components/Common/DeleteToast'
import './App.css'

function App() {
  const { session, authLoading, isMaster, handleGoogleLogin, handleLogout } = useAuth()

  // 환경설정 (항상 실제 session 기준)
  const prefs = useUserPreferences(session)
  const {
    preferencesLoading,
    lastProjectId, lastPageId,
    lastImpersonatedProjectId, lastImpersonatedPageId,
    expandedPages,
    saveLastProject, saveLastPage,
    saveLastImpersonatedProject, saveLastImpersonatedPage,
    saveExpandedPages,
  } = prefs

  // 임퍼소네이션
  const {
    impersonatedUser,
    isImpersonatingRef,
    effectiveSession,
    isImpersonating,
    startImpersonation,
    stopImpersonation,
  } = useImpersonation(session, isMaster, prefs)

  // 위치 저장: 임퍼소네이션 중이면 마스터 row의 별도 컬럼에 저장 (실제 계정 오염 방지)
  // isImpersonatingRef로 stale closure 없이 항상 최신값 참조
  const handleProjectChange = useCallback((projectId) => {
    if (isImpersonatingRef.current) saveLastImpersonatedProject(projectId)
    else saveLastProject(projectId)
  }, [saveLastImpersonatedProject, saveLastProject])

  const handlePageChange = useCallback((pageId) => {
    if (isImpersonatingRef.current) saveLastImpersonatedPage(pageId)
    else saveLastPage(pageId)
  }, [saveLastImpersonatedPage, saveLastPage])

  const initialProjectId = isImpersonating ? lastImpersonatedProjectId : lastProjectId
  const initialPageId    = isImpersonating ? lastImpersonatedPageId    : lastPageId

  // 프로젝트 관리
  const {
    projects,
    currentProjectId,
    setCurrentProjectId,
    projectsLoading,
    createProject,
    renameProject,
    deleteProject,
  } = useProjects(effectiveSession, {
    initialProjectId,
    onProjectChange: handleProjectChange,
    preferencesLoaded: !preferencesLoading,
  })

  // 페이지 관리
  const {
    pages,
    pageTree,
    currentPageId,
    setCurrentPageId,
    pagesLoading,
    createPage,
    renamePage,
    deletePage,
    undoDeletePage,
    getDescendantCount,
  } = usePages(effectiveSession, currentProjectId, {
    initialPageId,
    onPageChange: handlePageChange,
    preferencesLoaded: !preferencesLoading,
  })

  // 공유 관리
  const {
    sharedWithMe,
    sharingLoading,
    createShare,
    updateSharePermission,
    deleteShare,
    getSharesForResource,
  } = useSharing(effectiveSession)

  // 백업 관리
  const {
    isLoading: backupLoading,
    getBackups,
    createBackup,
    restoreBackup,
    deleteBackup,
    exportBackup,
    importBackup,
  } = useBackup(effectiveSession)

  // 사용자 관리 (마스터 전용 — 실제 session)
  const { users, usersLoading, fetchUsers, addUser, updateUserRole, updateUserStatus, deleteUser } =
    useUsers(session, isMaster)

  // 백업 목록
  const [backups, setBackups] = useState([])
  const refreshBackups = useCallback(async () => {
    if (currentProjectId) setBackups(await getBackups(currentProjectId))
  }, [currentProjectId, getBackups])
  useEffect(() => { refreshBackups() }, [refreshBackups])

  const handleCreateBackup = useCallback(async (description) => {
    const result = await createBackup(projects.find(p => p.id === currentProjectId), pages, description)
    if (result) refreshBackups()
    return result
  }, [currentProjectId, projects, pages, createBackup, refreshBackups])

  const handleRestoreBackup = useCallback((backupId) => restoreBackup(currentProjectId, backupId),
    [currentProjectId, restoreBackup])

  const handleDeleteBackup = useCallback((backupId) => {
    const ok = deleteBackup(currentProjectId, backupId)
    if (ok) refreshBackups()
    return ok
  }, [currentProjectId, deleteBackup, refreshBackups])

  const handleImportBackup = useCallback(async () => {
    const result = await importBackup(currentProjectId)
    if (result) refreshBackups()
    return result
  }, [currentProjectId, importBackup, refreshBackups])

  // 삭제 토스트 상태
  const [deleteToast, setDeleteToast] = useState(null)

  const handleDeletePage = useCallback(async (pageId) => {
    const pageName = await deletePage(pageId)
    if (pageName) {
      setDeleteToast({ key: Date.now(), pageName })
    }
  }, [deletePage])

  const handleUndoDelete = useCallback(() => {
    undoDeletePage()
    setDeleteToast(null)
  }, [undoDeletePage])

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768)

  // 인증 화면
  const authScreen = GoogleAuthButton({ authLoading, session, handleGoogleLogin })
  if (authScreen) return authScreen

  // 환경설정 로딩 중
  if (preferencesLoading) {
    return (
      <div className="app loading">
        <div className="loading-spinner">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        // 프로젝트
        projects={projects}
        currentProjectId={currentProjectId}
        onProjectSelect={setCurrentProjectId}
        onProjectCreate={createProject}
        onProjectRename={renameProject}
        onProjectDelete={deleteProject}
        // 페이지
        pages={pages}
        pageTree={pageTree}
        currentPageId={currentPageId}
        onPageSelect={setCurrentPageId}
        onPageCreate={createPage}
        onPageRename={renamePage}
        onPageDelete={handleDeletePage}
        getDescendantCount={getDescendantCount}
        expandedPages={expandedPages}
        onExpandedPagesChange={saveExpandedPages}
        // 사용자
        userEmail={effectiveSession?.user?.email}
        userAvatarUrl={impersonatedUser ? null : session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture}
        onLogout={handleLogout}
        isImpersonating={isImpersonating}
        impersonatedEmail={impersonatedUser?.email}
        onStopImpersonation={stopImpersonation}
        onStartImpersonation={startImpersonation}
        // 공유
        sharedWithMe={sharedWithMe}
        getSharesForResource={getSharesForResource}
        onCreateShare={createShare}
        onUpdateSharePermission={updateSharePermission}
        onDeleteShare={deleteShare}
        sharingLoading={sharingLoading}
        // 백업
        backups={backups}
        backupLoading={backupLoading}
        onCreateBackup={handleCreateBackup}
        onRestoreBackup={handleRestoreBackup}
        onDeleteBackup={handleDeleteBackup}
        onExportBackup={exportBackup}
        onImportBackup={handleImportBackup}
        onRefreshBackups={refreshBackups}
        // 관리자
        isMaster={isMaster}
        users={users}
        usersLoading={usersLoading}
        onAddUser={addUser}
        onUpdateUserRole={updateUserRole}
        onUpdateUserStatus={updateUserStatus}
        onDeleteUser={deleteUser}
        onRefreshUsers={fetchUsers}
      />

      <div className={`container ${sidebarOpen ? 'with-sidebar' : ''}`}>
        <Header
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          currentProjectId={currentProjectId}
          currentProjectName={projects.find(p => p.id === currentProjectId)?.name}
          onProjectRename={renameProject}
          sidebarOpen={sidebarOpen}
        />

        <div className="content-scrollable">
          {currentPageId ? (
            <TipTapEditorPage
              session={effectiveSession}
              currentPageId={currentPageId}
              currentPageName={pages.find(p => p.id === currentPageId)?.name}
              onPageRename={renamePage}
            />
          ) : (
            <div className="no-page-selected">
              <p>페이지를 선택하거나 새 페이지를 만드세요</p>
            </div>
          )}
        </div>
      </div>

      {/* 삭제 취소 토스트 */}
      {deleteToast && (
        <DeleteToast
          key={deleteToast.key}
          pageName={deleteToast.pageName}
          onUndo={handleUndoDelete}
          onDismiss={() => setDeleteToast(null)}
          duration={5000}
        />
      )}
    </div>
  )
}

export default App
