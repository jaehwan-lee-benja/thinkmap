import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import { GlobalTopBar } from './components/GlobalTopBar/GlobalTopBar'
import Sidebar from './components/Sidebar/Sidebar'
import { TabBar } from './components/TabBar/TabBar'
import TipTapEditorPage from './components/TipTapEditor/TipTapTestPage'
import { useAuth } from './hooks/useAuth'
import { useUserPreferences } from './hooks/useUserPreferences'
import { useImpersonation } from './hooks/useImpersonation'
import { useTabs } from './hooks/useTabs'
import { useProjects } from './hooks/useProjects'
import { usePages } from './hooks/usePages'
import { useSharing } from './hooks/useSharing'
import { useBackup } from './hooks/useBackup'
import { useUsers } from './hooks/useUsers'
import DeleteToast from './components/Common/DeleteToast'
import ProjectContext from './contexts/ProjectContext'
import PageContext from './contexts/PageContext'
import SharingContext from './contexts/SharingContext'
import BackupContext from './contexts/BackupContext'
import AuthContext from './contexts/AuthContext'
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

  // 탭 관리 (패널 기반)
  const {
    panes,
    splitMode,
    activePaneIndex,
    activeTab,
    activeTabId,
    initialized: tabsInitialized,
    addTab,
    removeTab,
    switchTab,
    updateActiveTab,
    toggleSplit,
    focusPane,
  } = useTabs(prefs)

  // 탭 전환 시 임퍼소네이션 및 네비게이션 동기화
  const prevActiveTabIdRef = useRef(null)
  useEffect(() => {
    if (!tabsInitialized || !activeTab) return

    // 첫 마운트: 기존 초기화 로직이 처리 (useImpersonation의 auto-restore)
    if (prevActiveTabIdRef.current === null) {
      prevActiveTabIdRef.current = activeTabId
      return
    }

    // 동일 탭이면 무시
    if (prevActiveTabIdRef.current === activeTabId) return
    prevActiveTabIdRef.current = activeTabId

    // 임퍼소네이션 상태 변경 필요?
    const tabImpUserId = activeTab.impersonatedUserId || null
    const currentImpUserId = impersonatedUser?.id || null

    if (tabImpUserId !== currentImpUserId) {
      if (tabImpUserId) {
        startImpersonation(tabImpUserId, activeTab.impersonatedUserEmail)
      } else {
        stopImpersonation()
      }
    } else {
      // 같은 임퍼소네이션: 프로젝트/페이지 수동 전환
      if (activeTab.projectId && activeTab.projectId !== currentProjectId) {
        setCurrentProjectId(activeTab.projectId)
      } else if (activeTab.pageId && activeTab.pageId !== currentPageId) {
        setCurrentPageId(activeTab.pageId)
      }
    }
  }, [activeTabId, tabsInitialized])

  // 위치 저장: 탭 + 레거시 프리퍼런스 동시 업데이트
  const handleProjectChange = useCallback((projectId) => {
    updateActiveTab({ projectId })
    if (isImpersonatingRef.current) saveLastImpersonatedProject(projectId)
    else saveLastProject(projectId)
  }, [updateActiveTab, saveLastImpersonatedProject, saveLastProject])

  const handlePageChange = useCallback((pageId) => {
    updateActiveTab({ pageId })
    if (isImpersonatingRef.current) saveLastImpersonatedPage(pageId)
    else saveLastPage(pageId)
  }, [updateActiveTab, saveLastImpersonatedPage, saveLastPage])

  // initialProjectId/initialPageId: 탭 초기화 완료 후 탭 기반, 아니면 레거시 폴백
  const initialProjectId = tabsInitialized
    ? (activeTab?.projectId || null)
    : (isImpersonating ? lastImpersonatedProjectId : lastProjectId)
  const initialPageId = tabsInitialized
    ? (activeTab?.pageId || null)
    : (isImpersonating ? lastImpersonatedPageId : lastPageId)

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

  // 임퍼소네이션 래핑: 변경 시 활성 탭도 업데이트
  const handleStartImpersonation = useCallback((userId, userEmail) => {
    startImpersonation(userId, userEmail)
    updateActiveTab({
      impersonatedUserId: userId,
      impersonatedUserEmail: userEmail,
    })
  }, [startImpersonation, updateActiveTab])

  const handleStopImpersonation = useCallback(async () => {
    await stopImpersonation()
    updateActiveTab({
      impersonatedUserId: null,
      impersonatedUserEmail: null,
    })
  }, [stopImpersonation, updateActiveTab])

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

  // 패널별 사이드바 상태
  const [paneSidebarOpen, setPaneSidebarOpen] = useState([false, false])

  const togglePaneSidebar = useCallback((paneIndex) => {
    setPaneSidebarOpen(prev => prev.map((v, i) => i === paneIndex ? !v : v))
  }, [])

  const closePaneSidebar = useCallback((paneIndex) => {
    setPaneSidebarOpen(prev => prev.map((v, i) => i === paneIndex ? false : v))
  }, [])

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
    startImpersonation: handleStartImpersonation,
    stopImpersonation: handleStopImpersonation,
    users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers,
  }), [effectiveSession?.user?.email, userAvatarUrl, handleLogout, isMaster, isImpersonating, impersonatedUser?.email, handleStartImpersonation, handleStopImpersonation, users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers])

  // ─── Breadcrumb ───

  const buildBreadcrumb = useCallback((tab) => {
    const parts = []
    const proj = projects.find(p => p.id === tab.projectId)
    if (proj) parts.push({ type: 'project', id: proj.id, name: proj.name })
    if (tab.pageId && pages.length > 0) {
      const path = []
      let cur = pages.find(p => p.id === tab.pageId)
      while (cur) {
        path.unshift({ type: 'page', id: cur.id, name: cur.name, parentId: cur.parent_id || null })
        cur = cur.parent_id ? pages.find(p => p.id === cur.parent_id) : null
      }
      parts.push(...path)
    }
    return parts.length > 0 ? parts : [{ type: 'none', id: null, name: '새 탭' }]
  }, [projects, pages])

  const getBreadcrumbSiblings = useCallback((part) => {
    if (part.type === 'project') {
      return projects.map(p => ({ id: p.id, name: p.name }))
    }
    if (part.type === 'page') {
      return pages
        .filter(p => (p.parent_id || null) === (part.parentId || null))
        .sort((a, b) => a.position - b.position)
        .map(p => ({ id: p.id, name: p.name }))
    }
    return []
  }, [projects, pages])

  const handleBreadcrumbNavigate = useCallback((type, id) => {
    if (type === 'project') {
      setCurrentProjectId(id)
    } else if (type === 'page') {
      setCurrentPageId(id)
    }
  }, [setCurrentProjectId, setCurrentPageId])

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

  // ─── 패널 콘텐츠 렌더링 ───

  const renderPaneContent = (paneIndex) => {
    const pane = panes[paneIndex]
    if (!pane) return null
    const tab = pane.tabs.find(t => t.id === pane.activeTabId) || pane.tabs[0]
    if (!tab) return null

    // 활성 패널이면 앱의 currentPageId를 사용, 비활성이면 탭의 pageId를 직접 사용
    const pageId = paneIndex === activePaneIndex ? currentPageId : (tab.pageId || null)
    const pageName = pages.find(p => p.id === pageId)?.name || ''

    if (!pageId) {
      return (
        <div className="no-page-selected">
          <p>페이지를 선택하세요</p>
        </div>
      )
    }
    return (
      <TipTapEditorPage
        key={`pane-${paneIndex}-${pageId}`}
        session={effectiveSession}
        currentPageId={pageId}
        currentPageName={pageName}
        onPageRename={renamePage}
      />
    )
  }

  const renderPane = (paneIndex) => {
    const pane = panes[paneIndex]
    if (!pane) return null
    const isActive = paneIndex === activePaneIndex
    const isSidebarOpen = paneSidebarOpen[paneIndex] || false

    return (
      <div
        className={`pane ${isActive ? 'pane-active' : ''}`}
        onMouseDown={() => focusPane(paneIndex)}
      >
        {tabsInitialized && pane.tabs.length > 0 && (
          <TabBar
            tabs={pane.tabs}
            activeTabId={pane.activeTabId}
            onSwitch={(tabId) => switchTab(paneIndex, tabId)}
            onAdd={() => addTab(paneIndex)}
            onRemove={(tabId) => removeTab(paneIndex, tabId)}
            onSplitToggle={toggleSplit}
            splitMode={splitMode}
            buildBreadcrumb={buildBreadcrumb}
            getBreadcrumbSiblings={getBreadcrumbSiblings}
            onBreadcrumbNavigate={(type, id) => {
              focusPane(paneIndex)
              handleBreadcrumbNavigate(type, id)
            }}
            sidebarOpen={isSidebarOpen}
            onToggleSidebar={() => togglePaneSidebar(paneIndex)}
            paneIndex={paneIndex}
          />
        )}
        <div className="content-scrollable">
          {renderPaneContent(paneIndex)}
        </div>

        {/* 패널별 사이드바 */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => closePaneSidebar(paneIndex)}
          onPageSelect={(pageId) => {
            focusPane(paneIndex)
            setCurrentPageId(pageId)
          }}
          onProjectSelect={(projectId) => {
            focusPane(paneIndex)
            setCurrentProjectId(projectId)
          }}
        />
      </div>
    )
  }

  return (
    <AuthContext.Provider value={authCtx}>
    <ProjectContext.Provider value={projectCtx}>
    <PageContext.Provider value={pageCtx}>
    <SharingContext.Provider value={sharingCtx}>
    <BackupContext.Provider value={backupCtx}>
      <div className="app">
        <GlobalTopBar />

        <div className={`container ${splitMode ? 'split-active' : ''}`}>
          {splitMode ? (
            <div className="split-container">
              {renderPane(0)}
              <div className="split-divider" />
              {renderPane(1)}
            </div>
          ) : (
            renderPane(0)
          )}
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
    </BackupContext.Provider>
    </SharingContext.Provider>
    </PageContext.Provider>
    </ProjectContext.Provider>
    </AuthContext.Provider>
  )
}

export default App
