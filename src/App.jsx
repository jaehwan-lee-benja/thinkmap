import React, { useEffect, useState, useCallback, useMemo } from 'react'
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
import { useIsMobile } from './hooks/useIsMobile'
import { useSwipeGesture } from './hooks/useSwipeGesture'
import DeleteToast from './components/Common/DeleteToast'
import ProjectContext from './contexts/ProjectContext'
import PageContext from './contexts/PageContext'
import SharingContext from './contexts/SharingContext'
import BackupContext from './contexts/BackupContext'
import AuthContext from './contexts/AuthContext'
import UIContext from './contexts/UIContext'
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
    reorderPages,
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
  const { isTablet, isTouch } = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768)

  // 모바일 스와이프로 사이드바 열기/닫기
  useSwipeGesture({
    onSwipeRight: useCallback(() => { if (isTablet) setSidebarOpen(true) }, [isTablet]),
    onSwipeLeft: useCallback(() => { if (isTablet && sidebarOpen) setSidebarOpen(false) }, [isTablet, sidebarOpen]),
  })

  // Context values (Hooks 규칙: early return 전에 모든 Hook 호출)
  const userAvatarUrl = impersonatedUser ? null : session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture

  const projectCtx = useMemo(() => ({
    projects, currentProjectId, setCurrentProjectId,
    createProject, renameProject, deleteProject,
  }), [projects, currentProjectId, setCurrentProjectId, createProject, renameProject, deleteProject])

  const pageCtx = useMemo(() => ({
    pages, pageTree, currentPageId, setCurrentPageId,
    createPage, renamePage, deletePage: handleDeletePage, reorderPages, getDescendantCount,
    expandedPages, saveExpandedPages,
  }), [pages, pageTree, currentPageId, setCurrentPageId, createPage, renamePage, handleDeletePage, reorderPages, getDescendantCount, expandedPages, saveExpandedPages])

  const sharingCtx = useMemo(() => ({
    sharedWithMe, sharingLoading,
    createShare, updateSharePermission, deleteShare, getSharesForResource,
  }), [sharedWithMe, sharingLoading, createShare, updateSharePermission, deleteShare, getSharesForResource])

  const backupCtx = useMemo(() => ({
    backups, backupLoading,
    createBackup: handleCreateBackup, restoreBackup: handleRestoreBackup,
    deleteBackup: handleDeleteBackup, exportBackup, importBackup: handleImportBackup,
    refreshBackups,
  }), [backups, backupLoading, handleCreateBackup, handleRestoreBackup, handleDeleteBackup, exportBackup, handleImportBackup, refreshBackups])

  const authCtx = useMemo(() => ({
    userEmail: effectiveSession?.user?.email, userAvatarUrl,
    handleLogout, isMaster,
    isImpersonating, impersonatedEmail: impersonatedUser?.email,
    startImpersonation, stopImpersonation,
    users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers,
  }), [effectiveSession?.user?.email, userAvatarUrl, handleLogout, isMaster, isImpersonating, impersonatedUser?.email, startImpersonation, stopImpersonation, users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers])

  const uiCtx = useMemo(() => ({
    sidebarOpen, setSidebarOpen,
    toggleSidebar: () => setSidebarOpen(prev => !prev),
    closeSidebar: () => setSidebarOpen(false),
  }), [sidebarOpen])

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
    <AuthContext.Provider value={authCtx}>
    <ProjectContext.Provider value={projectCtx}>
    <PageContext.Provider value={pageCtx}>
    <SharingContext.Provider value={sharingCtx}>
    <BackupContext.Provider value={backupCtx}>
    <UIContext.Provider value={uiCtx}>
      <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <Sidebar />

        <div className={`container ${sidebarOpen ? 'with-sidebar' : ''}`}>
          <Header />

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
    </UIContext.Provider>
    </BackupContext.Provider>
    </SharingContext.Provider>
    </PageContext.Provider>
    </ProjectContext.Provider>
    </AuthContext.Provider>
  )
}

export default App
