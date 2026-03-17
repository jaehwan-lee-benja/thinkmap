import React, { useState, useCallback, useMemo, useRef } from 'react'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import { GlobalTopBar } from './components/GlobalTopBar/GlobalTopBar'
import Sidebar from './components/Sidebar/Sidebar'
import { TabBar } from './components/TabBar/TabBar'
import TipTapEditorPage from './components/TipTapEditor/TipTapTestPage'
import { useAuth } from './hooks/useAuth'
import { useUserPreferences } from './hooks/useUserPreferences'
import { useTabs } from './hooks/useTabs'
import { useUsers } from './hooks/useUsers'
import { useLinkedAccounts, useLinkedAccountsAdmin } from './hooks/useLinkedAccounts'
import { PaneProvider, usePaneData } from './components/PaneProvider'
import { usePageContext } from './contexts/PageContext'
import { useProjectContext } from './contexts/ProjectContext'
import DeleteToast from './components/Common/DeleteToast'
import AuthContext from './contexts/AuthContext'
import './App.css'

// 에러 바운더리 — React 크래시 시 에러 메시지 표시
class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    console.error('AppErrorBoundary:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return <div style={{ padding: 20, color: '#f66', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
        {'CRASH: ' + this.state.error.message + '\n\n' + (this.state.error.stack || '').slice(0, 1000)}
      </div>
    }
    return this.props.children
  }
}

// ─── PaneInner: PaneProvider 내부에서 Context를 통해 데이터에 접근하는 패널 콘텐츠 ───
function PaneInner({
  pane,
  paneIndex,
  tabSidebarOpen,
  toggleTabSidebar,
  closeTabSidebar,
  mobileView,
  setMobileView,
  focusPane,
  switchTab,
  addTab,
  removeTab,
  reorderTab,
  moveTabToPane,
  tabsInitialized,
}) {
  const {
    effectiveSession, isImpersonating, projectsLoading, pagesLoading,
    projects, buildBreadcrumb, getBreadcrumbSiblings, handleBreadcrumbNavigate,
    activeTab, viewerToggleOverrides, saveViewerToggleOverrides,
  } = usePaneData()

  const { pages, currentPageId, setCurrentPageId, renamePage } = usePageContext()
  const { setCurrentProjectId } = useProjectContext()

  const tab = activeTab
  if (!tab) return null

  const tabId = tab.id
  const isSidebarOpen = tabSidebarOpen[tabId] || false
  const pageId = currentPageId
  const pageName = pages.find(p => p.id === pageId)?.name || ''

  return (
    <>
      {tabsInitialized && (
        <TabBar
          tabs={pane.tabs}
          activeTabId={pane.activeTabId}
          onSwitch={(id) => switchTab(paneIndex, id)}
          onAdd={() => addTab(paneIndex, {
            projectId: projects.length === 1 ? projects[0].id : null,
            pageId: null,
          })}
          onRemove={(id) => removeTab(paneIndex, id)}
          onReorder={(from, to) => reorderTab(paneIndex, from, to)}
          onMoveTab={(fromPane, fromTabIndex, toIndex) => moveTabToPane(fromPane, fromTabIndex, paneIndex, toIndex)}
          buildBreadcrumb={buildBreadcrumb}
          getBreadcrumbSiblings={getBreadcrumbSiblings}
          onBreadcrumbNavigate={(type, id) => {
            focusPane(paneIndex)
            handleBreadcrumbNavigate(type, id)
          }}
          paneIndex={paneIndex}
        />
      )}
      <div className="pane-content-area">
        <div className="content-scrollable">
          {!pageId ? (
            <div className="no-page-selected">
              <button
                className="content-sidebar-toggle"
                onMouseDown={e => e.stopPropagation()}
                onClick={() => toggleTabSidebar(tabId, paneIndex)}
                title={isSidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <p>{projectsLoading || pagesLoading ? '로딩 중...' : '페이지를 선택하세요'}</p>
            </div>
          ) : (
            <TipTapEditorPage
              key={`pane-${paneIndex}-${pageId}`}
              session={effectiveSession}
              currentPageId={pageId}
              currentPageName={pageName}
              onPageRename={renamePage}
              isImpersonating={isImpersonating}
              sidebarOpen={isSidebarOpen}
              onToggleSidebar={() => toggleTabSidebar(tabId, paneIndex)}
              mobileView={mobileView}
              onMobileViewChange={setMobileView}
              viewerToggleOverrides={viewerToggleOverrides}
              saveViewerToggleOverrides={saveViewerToggleOverrides}
            />
          )}
        </div>

        {/* 탭별 사이드바 */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => closeTabSidebar(tabId)}
          onPageSelect={(id) => {
            focusPane(paneIndex)
            setCurrentPageId(id)
          }}
          onProjectSelect={(id) => {
            focusPane(paneIndex)
            setCurrentProjectId(id)
          }}
          mobileView={mobileView}
          onMobileViewChange={setMobileView}
        />
      </div>
    </>
  )
}

// ─── App ───
function App() {
  const { session, authLoading, isMaster, handleGoogleLogin, handleLogout } = useAuth()

  // 환경설정 (항상 실제 session 기준)
  const prefs = useUserPreferences(session)
  const { preferencesLoading } = prefs

  // 탭 관리 (패널 기반)
  const {
    panes,
    splitMode,
    activePaneIndex,
    initialized: tabsInitialized,
    addTab,
    removeTab,
    switchTab,
    updateTabInPane,
    toggleSplit,
    focusPane,
    reorderTab,
    moveTabToPane,
  } = useTabs(prefs)

  // 사용자 관리 (마스터 전용 — 실제 session)
  const { users, usersLoading, fetchUsers, addUser, updateUserRole, updateUserStatus, deleteUser } =
    useUsers(session, isMaster)

  // 연결 계정
  const { linkedAccounts } = useLinkedAccounts(session)
  const linkedAdmin = useLinkedAccountsAdmin(session, isMaster)

  // 삭제 토스트 상태
  const [deleteToast, setDeleteToast] = useState(null)

  const handleUndoDelete = useCallback(() => {
    if (deleteToast?.undoFn) deleteToast.undoFn()
    setDeleteToast(null)
  }, [deleteToast])

  // 모바일 뷰 모드
  const [mobileView, setMobileView] = useState('editor')

  // 탭별 사이드바 상태 (더 이상 deferred 로직 불필요 — 각 패널이 독립 데이터)
  const [tabSidebarOpen, setTabSidebarOpen] = useState({})

  const toggleTabSidebar = useCallback((tabId, paneIdx) => {
    if (paneIdx != null && paneIdx !== activePaneIndex) {
      focusPane(paneIdx)
    }
    setTabSidebarOpen(prev => ({ ...prev, [tabId]: !prev[tabId] }))
  }, [focusPane, activePaneIndex])

  const closeTabSidebar = useCallback((tabId) => {
    setTabSidebarOpen(prev => ({ ...prev, [tabId]: false }))
  }, [])

  // 분할 리사이즈
  const [splitRatio, setSplitRatio] = useState(0.5)
  const splitContainerRef = useRef(null)
  const isDraggingRef = useRef(false)

  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault()
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (e) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  // ─── AuthContext — 임퍼소네이션은 활성 패널의 탭 정보에서 파생 ───
  const activeTabForAuth = panes[activePaneIndex]?.tabs?.find(
    t => t.id === panes[activePaneIndex]?.activeTabId
  ) || panes[activePaneIndex]?.tabs?.[0]

  // 뷰어 모드 = 관리자 패널 "활동하기"로 진입한 경우만 (탭의 viewerMode 플래그)
  const isImpersonating = !!activeTabForAuth?.viewerMode
  const impersonatedEmail = activeTabForAuth?.impersonatedUserEmail || null
  const isActingAsOther = !!activeTabForAuth?.impersonatedUserId
  // 연결 계정 전환 (편집 모드로 다른 계정 사용 중)
  const isLinkedAccountSwitch = isActingAsOther && !isImpersonating
  const userEmail = impersonatedEmail || session?.user?.email
  const userAvatarUrl = isActingAsOther
    ? null
    : session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture

  const handleStartImpersonation = useCallback((userId, userEmail, viewerMode = false) => {
    updateTabInPane(activePaneIndex, {
      impersonatedUserId: userId,
      impersonatedUserEmail: userEmail,
      viewerMode,
      projectId: null,
      pageId: null,
    })
    prefs.saveLastImpersonation(userId, userEmail)
  }, [updateTabInPane, activePaneIndex, prefs.saveLastImpersonation])

  const handleStopImpersonation = useCallback(() => {
    updateTabInPane(activePaneIndex, {
      impersonatedUserId: null,
      impersonatedUserEmail: null,
      viewerMode: false,
      projectId: null,
      pageId: null,
    })
    prefs.clearLastImpersonation()
  }, [updateTabInPane, activePaneIndex, prefs.clearLastImpersonation])

  const ownEmail = session?.user?.email
  const authCtx = useMemo(() => ({
    userEmail, ownEmail, userAvatarUrl,
    handleLogout, isMaster,
    isImpersonating, impersonatedEmail,
    isLinkedAccountSwitch,
    linkedAccounts, linkedAdmin,
    startImpersonation: handleStartImpersonation,
    stopImpersonation: handleStopImpersonation,
    users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers,
  }), [userEmail, ownEmail, userAvatarUrl, handleLogout, isMaster, isImpersonating, impersonatedEmail, isLinkedAccountSwitch, linkedAccounts, linkedAdmin, handleStartImpersonation, handleStopImpersonation, users, usersLoading, addUser, updateUserRole, updateUserStatus, deleteUser, fetchUsers])

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

  // ─── 패널 렌더링 ───
  const renderPane = (paneIndex) => {
    const pane = panes[paneIndex]
    if (!pane) return null
    const isActive = paneIndex === activePaneIndex

    return (
      <PaneProvider
        session={session}
        isMaster={isMaster}
        pane={pane}
        paneIndex={paneIndex}
        prefs={prefs}
        updateTab={(fields) => updateTabInPane(paneIndex, fields)}
        users={users}
        linkedAccounts={linkedAccounts}
        ownEmail={session?.user?.email}
        onDeletePage={(pageName, undoFn) => setDeleteToast({ key: Date.now(), pageName, undoFn })}
      >
        <div
          className={`pane ${isActive ? 'pane-active' : ''}`}
          onMouseDown={() => focusPane(paneIndex)}
        >
          <PaneInner
            pane={pane}
            paneIndex={paneIndex}
            tabSidebarOpen={tabSidebarOpen}
            toggleTabSidebar={toggleTabSidebar}
            closeTabSidebar={closeTabSidebar}
            mobileView={mobileView}
            setMobileView={setMobileView}
            focusPane={focusPane}
            switchTab={switchTab}
            addTab={addTab}
            removeTab={removeTab}
            reorderTab={reorderTab}
            moveTabToPane={moveTabToPane}
            tabsInitialized={tabsInitialized}
          />
        </div>
      </PaneProvider>
    )
  }

  return (
    <AuthContext.Provider value={authCtx}>
      <div className="app app-main">
        <GlobalTopBar splitMode={splitMode} onSplitToggle={toggleSplit} />

        <div className={`container ${splitMode ? 'split-active' : ''}`}>
          {splitMode ? (
            <div className="split-container" ref={splitContainerRef}>
              <div style={{ flex: `0 0 ${splitRatio * 100}%`, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                {renderPane(0)}
              </div>
              <div className="split-divider" onMouseDown={handleDividerMouseDown} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                {renderPane(1)}
              </div>
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
    </AuthContext.Provider>
  )
}

export { AppErrorBoundary }
export default App
