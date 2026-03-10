import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import Header from './components/Navigation/Header'
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
    sidebarWidth: savedSidebarWidth, saveSidebarWidth,
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

  // 사이드바 너비 복원 (prefs 로드 후)
  useEffect(() => {
    if (!preferencesLoading && savedSidebarWidth) {
      setSidebarWidth(Math.max(200, Math.min(600, savedSidebarWidth)))
    }
  }, [preferencesLoading, savedSidebarWidth])

  // 탭 관리
  const {
    tabs,
    activeTab,
    activeTabId,
    initialized: tabsInitialized,
    addTab,
    removeTab,
    switchTab,
    updateActiveTab,
    renameTab,
  } = useTabs(prefs)

  // ─── 분할 뷰 상태 ───
  const [splitMode, setSplitMode] = useState(false)
  const [splitPanes, setSplitPanes] = useState([null, null]) // [leftTabId, rightTabId]
  const [activePaneIndex, setActivePaneIndex] = useState(0)

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

  // ─── 분할 뷰 핸들러 ───

  const handleSplitToggle = useCallback(() => {
    if (splitMode) {
      // 분할 닫기
      setSplitMode(false)
      setSplitPanes([null, null])
      setActivePaneIndex(0)
    } else {
      // 분할 열기: 왼쪽=현재 탭, 오른쪽=다음 탭 (없으면 새 탭 생성)
      const otherTab = tabs.find(t => t.id !== activeTabId)
      if (otherTab) {
        setSplitPanes([activeTabId, otherTab.id])
      } else {
        const newTab = addTab({ label: `탭 ${tabs.length + 1}` })
        if (newTab) {
          setSplitPanes([activeTabId, newTab.id])
        }
      }
      setSplitMode(true)
      setActivePaneIndex(0)
    }
  }, [splitMode, tabs, activeTabId, addTab])

  // 패널 클릭 → 활성 패널 전환 + 해당 탭 활성화
  const handlePaneClick = useCallback((paneIndex) => {
    if (!splitMode || activePaneIndex === paneIndex) return
    setActivePaneIndex(paneIndex)
    const tabId = splitPanes[paneIndex]
    if (tabId && tabId !== activeTabId) {
      switchTab(tabId)
    }
  }, [splitMode, activePaneIndex, splitPanes, activeTabId, switchTab])

  // 탭바에서 탭 전환 시 → 활성 패널에 해당 탭 배치
  const handleTabSwitch = useCallback((tabId) => {
    if (splitMode) {
      const newPanes = [...splitPanes]
      newPanes[activePaneIndex] = tabId
      setSplitPanes(newPanes)
    }
    switchTab(tabId)
  }, [splitMode, splitPanes, activePaneIndex, switchTab])

  // 탭 닫기 시 → 분할 패널에 포함된 탭이면 분할 해제
  const handleTabRemove = useCallback((tabId) => {
    if (splitMode && splitPanes.includes(tabId)) {
      const otherPaneIndex = splitPanes[0] === tabId ? 1 : 0
      const otherTabId = splitPanes[otherPaneIndex]
      setSplitMode(false)
      setSplitPanes([null, null])
      setActivePaneIndex(0)
      if (otherTabId && tabId === activeTabId) {
        switchTab(otherTabId)
      }
    }
    removeTab(tabId)
  }, [splitMode, splitPanes, activeTabId, switchTab, removeTab])

  // 분할 모드 패널별 페이지 ID 계산
  const getPageIdForPane = (paneIndex) => {
    if (!splitMode) return currentPageId
    if (paneIndex === activePaneIndex) return currentPageId
    const tabId = splitPanes[paneIndex]
    const tab = tabs.find(t => t.id === tabId)
    return tab?.pageId || null
  }

  const getPageNameForPane = (paneIndex) => {
    const pageId = getPageIdForPane(paneIndex)
    return pages.find(p => p.id === pageId)?.name || ''
  }

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
  const [sidebarWidth, setSidebarWidth] = useState(300)

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
    startImpersonation: handleStartImpersonation,
    stopImpersonation: handleStopImpersonation,
    users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers,
  }), [effectiveSession?.user?.email, userAvatarUrl, handleLogout, isMaster, isImpersonating, impersonatedUser?.email, handleStartImpersonation, handleStopImpersonation, users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers])

  const sidebarWidthSaveTimerRef = useRef(null)
  const handleSidebarWidthChange = useCallback((width) => {
    const clamped = Math.max(200, Math.min(600, width))
    setSidebarWidth(clamped)
    // 디바운스: 드래그 중 잦은 저장 방지
    if (sidebarWidthSaveTimerRef.current) clearTimeout(sidebarWidthSaveTimerRef.current)
    sidebarWidthSaveTimerRef.current = setTimeout(() => {
      saveSidebarWidth(clamped)
    }, 500)
  }, [saveSidebarWidth])

  const uiCtx = useMemo(() => ({
    sidebarOpen, setSidebarOpen,
    toggleSidebar: () => setSidebarOpen(prev => !prev),
    closeSidebar: () => setSidebarOpen(false),
    sidebarWidth, setSidebarWidth: handleSidebarWidthChange,
  }), [sidebarOpen, sidebarWidth, handleSidebarWidthChange])

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

  // 에디터 패널 렌더링 헬퍼
  const renderEditorPane = (paneIndex) => {
    const pageId = getPageIdForPane(paneIndex)
    const pageName = getPageNameForPane(paneIndex)
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

  return (
    <AuthContext.Provider value={authCtx}>
    <ProjectContext.Provider value={projectCtx}>
    <PageContext.Provider value={pageCtx}>
    <SharingContext.Provider value={sharingCtx}>
    <BackupContext.Provider value={backupCtx}>
    <UIContext.Provider value={uiCtx}>
      <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <Sidebar />

        <div
          className={`container ${sidebarOpen ? 'with-sidebar' : ''}`}
          style={sidebarOpen ? { '--sidebar-width': `${sidebarWidth}px` } : undefined}
        >
          <Header />

          {tabsInitialized && tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              splitMode={splitMode}
              splitPanes={splitPanes}
              activePaneIndex={activePaneIndex}
              onSwitch={handleTabSwitch}
              onAdd={() => addTab()}
              onRemove={handleTabRemove}
              onRename={renameTab}
              onSplitToggle={handleSplitToggle}
            />
          )}

          {splitMode ? (
            <div className="split-container">
              <div
                className={`split-pane ${activePaneIndex === 0 ? 'active' : ''}`}
                onMouseDown={() => handlePaneClick(0)}
              >
                <div className="split-pane-header">
                  <span className="split-pane-dot left" />
                  <span className="split-pane-label">
                    {tabs.find(t => t.id === splitPanes[0])?.label || ''}
                  </span>
                </div>
                <div className="content-scrollable">
                  {renderEditorPane(0)}
                </div>
              </div>
              <div className="split-divider" />
              <div
                className={`split-pane ${activePaneIndex === 1 ? 'active' : ''}`}
                onMouseDown={() => handlePaneClick(1)}
              >
                <div className="split-pane-header">
                  <span className="split-pane-dot right" />
                  <span className="split-pane-label">
                    {tabs.find(t => t.id === splitPanes[1])?.label || ''}
                  </span>
                </div>
                <div className="content-scrollable">
                  {renderEditorPane(1)}
                </div>
              </div>
            </div>
          ) : (
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
    </UIContext.Provider>
    </BackupContext.Provider>
    </SharingContext.Provider>
    </PageContext.Provider>
    </ProjectContext.Provider>
    </AuthContext.Provider>
  )
}

export default App
