import React, { useState, useCallback, useMemo, useRef, useEffect, lazy, Suspense } from 'react'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import { GlobalTopBar } from './components/GlobalTopBar/GlobalTopBar'
import Sidebar from './components/Sidebar/Sidebar'
import { TabBar } from './components/TabBar/TabBar'
import TipTapEditorPage from './components/TipTapEditor/TipTapTestPage'
import CanvasViewer from './components/Canvas/CanvasViewer'
import SchedulePage from './components/Schedule/SchedulePage'
// 대시보드는 마스터 전용 + 비교적 무거운 트리이므로 코드 스플리팅.
// 대시보드를 열지 않는 멤버/세션에는 메인 번들에 포함되지 않는다.
const DashboardPage = lazy(() => import('./components/Dashboard/DashboardPage'))
import PayrollPage from './components/Payroll/PayrollPage'
// 글로벌 사이드바 (2026.3 즈음 즐겨찾기로 썼었음) — 향후 다른 용도로 활용 가능
// import { FavoritesRail } from './components/FavoritesRail/FavoritesRail'
import { useAuth } from './hooks/useAuth'
import { useUserPreferences } from './hooks/useUserPreferences'
import { useFavorites } from './hooks/useFavorites'
import { useTabs } from './hooks/useTabs'
import { useUsers } from './hooks/useUsers'
import { useLinkedAccounts, useLinkedAccountsAdmin } from './hooks/useLinkedAccounts'
import { useQuickMemo } from './hooks/useMemo'
import { PaneProvider, usePaneData } from './components/PaneProvider'
import { MemoPanel } from './components/MemoPanel/MemoPanel'
import { usePageContext } from './contexts/PageContext'
import { useProjectContext } from './contexts/ProjectContext'
import DeleteToast from './components/Common/DeleteToast'
import AuthContext from './contexts/AuthContext'
import FavoritesContext from './contexts/FavoritesContext'
import { supabase } from './supabaseClient'
import { generateUUID } from './utils/uuid'
import { dailyPageName } from './utils/dateUtils'
import { PAGE_TYPES, isSchedulePage, isPayrollPage, isDashboardPage } from './utils/pageTypes'
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
  paneNavRef,
  highlightedTabId,
}) {
  const {
    effectiveSession, isMaster, isImpersonating, projectsLoading, pagesLoading,
    projects, buildBreadcrumb, getBreadcrumbSiblings, handleBreadcrumbNavigate,
    activeTab, viewerToggleOverrides, saveViewerToggleOverrides,
  } = usePaneData()

  const { pages, currentPageId, setCurrentPageId, renamePage } = usePageContext()
  const { setCurrentProjectId } = useProjectContext()

  // 즐겨찾기에서 네비게이션할 때 사용할 함수 등록
  useEffect(() => {
    if (paneNavRef) {
      paneNavRef.current[paneIndex] = { setCurrentProjectId, setCurrentPageId }
    }
    return () => {
      if (paneNavRef) delete paneNavRef.current[paneIndex]
    }
  }, [paneIndex, setCurrentProjectId, setCurrentPageId, paneNavRef])

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
          highlightedTabId={highlightedTabId}
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
              <p>{projectsLoading || pagesLoading ? '로딩 중...' : '원하는 페이지를 상단 탭에서 선택해주세요 :)'}</p>
            </div>
          ) : (() => {
            const currentPage = pages.find(p => p.id === pageId)
            const pageType = currentPage?.page_type
            if (pageType === PAGE_TYPES.FRAME || pageType === PAGE_TYPES.ENGINE) {
              return (
                <CanvasViewer
                  key={`pane-${paneIndex}-${pageId}`}
                  pageId={pageId}
                  canvasType={pageType}
                  session={effectiveSession}
                />
              )
            }
            if (isSchedulePage(pageType)) {
              return (
                <SchedulePage
                  key={`pane-${paneIndex}-${pageId}`}
                  session={effectiveSession}
                />
              )
            }
            if (isDashboardPage(pageType)) {
              // 대시보드 = 마스터 전용. 비마스터 접근 시 거부 (payroll 과 동일).
              if (!isMaster) {
                return (
                  <div className="no-page-selected">
                    <p>접근 권한이 없습니다. (마스터 전용)</p>
                  </div>
                )
              }
              return (
                <Suspense fallback={<div className="no-page-selected"><p>대시보드 로딩 중...</p></div>}>
                  <DashboardPage
                    key={`pane-${paneIndex}-${pageId}`}
                    session={effectiveSession}
                  />
                </Suspense>
              )
            }
            if (isPayrollPage(pageType)) {
              // 급여명세서 — 마스터 전용. 비마스터 접근 시 거부.
              if (!isMaster) {
                return (
                  <div className="no-page-selected">
                    <p>접근 권한이 없습니다. (마스터 전용)</p>
                  </div>
                )
              }
              return (
                <PayrollPage
                  key={`pane-${paneIndex}-${pageId}`}
                  pageId={pageId}
                  session={effectiveSession}
                />
              )
            }
            return (
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
            )
          })()}
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
  const { session, authLoading, isMaster, userStatus, handleGoogleLogin, handleLogout } = useAuth()

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
    highlightedTabId,
  } = useTabs(prefs)

  // 사용자 관리 (마스터 전용 — 실제 session)
  const { users, usersLoading, fetchUsers, addUser, updateUserRole, updateUserStatus, deleteUser } =
    useUsers(session, isMaster)

  // 연결 계정
  const { linkedAccounts } = useLinkedAccounts(session)
  const linkedAdmin = useLinkedAccountsAdmin(session, isMaster)

  // 메모
  const { content: memoContent, updateContent: updateMemoContent, loading: memoLoading, saving: memoSaving } = useQuickMemo(session)
  const [memoOpen, setMemoOpen] = useState(false)
  const toggleMemo = useCallback(() => setMemoOpen(prev => !prev), [])

  // 즐겨찾기
  const favoritesHook = useFavorites(session)
  const paneNavRef = useRef({})

  const handleFavoriteNavigate = useCallback((fav) => {
    addTab(activePaneIndex, { projectId: fav.projectId, pageId: fav.pageId })
    setTimeout(() => {
      const nav = paneNavRef.current[activePaneIndex]
      if (nav) {
        if (fav.projectId) nav.setCurrentProjectId(fav.projectId)
        nav.setCurrentPageId(fav.pageId)
      }
    }, 0)
  }, [addTab, activePaneIndex])

  // 오늘 업무일지 바로가기 — 현재 탭에서 직접 이동 (v2)
  const handleNavigateTodayWorklog = useCallback(async () => {
    // KST (UTC+9) 기준 오늘 dateKey — 자정 직후 UTC 전날로 어긋나지 않게
    const now = new Date()
    const kstMs = now.getTime() + (now.getTimezoneOffset() + 9 * 60) * 60000
    const todayStr = new Date(kstMs).toISOString().slice(0, 10)

    const { data: calendarPages, error: e1 } = await supabase
      .from('pages')
      .select('id, project_id')
      .eq('page_type', 'calendar')
      .is('deleted_at', null)
      .limit(1)

    if (e1) { console.error('업무일지 캘린더 조회 실패:', e1); return }
    if (!calendarPages?.length) { console.warn('calendar 페이지 없음'); return }

    const calendarPage = calendarPages[0]

    const navigateTo = (pageId) => {
      addTab(activePaneIndex, { projectId: null, pageId })
      setTimeout(() => {
        const nav = paneNavRef.current[activePaneIndex]
        if (nav) nav.setCurrentPageId(pageId)
      }, 0)
    }

    try {
      const { ensureDailyPage } = await import('./utils/ensureDailyPage')
      const result = await ensureDailyPage({
        supabase,
        parentId: calendarPage.id,
        dateKey: todayStr,
        userId: session.user.id,
        dailyPageName,
      })
      if (result?.pageId) {
        // 중복 방지로 기존 페이지든 신규든 동일 경로
        window.dispatchEvent(new CustomEvent('pages-refresh'))
        navigateTo(result.pageId)
      }
    } catch (err) {
      console.error('오늘 daily 페이지 생성 실패 (v2):', err)
    }
  }, [addTab, updateTabInPane, activePaneIndex, session])

  // 캘린더(schedule) 페이지 바로가기 — Sidebar 의 캘린더 버튼과 동일 로직
  const handleNavigateSchedule = useCallback(async () => {
    let scheduleId = null
    const { data: rows, error } = await supabase
      .from('pages')
      .select('id')
      .eq('page_type', 'schedule')
      .is('deleted_at', null)
      .limit(1)
    if (error) { console.error('schedule page 조회 실패:', error); return }
    if (rows?.length) {
      scheduleId = rows[0].id
    } else {
      // 신규 생성
      const newPageId = generateUUID()
      const { error: insErr } = await supabase
        .from('pages')
        .insert([{
          id: newPageId,
          user_id: session.user.id,
          name: '캘린더',
          page_type: 'schedule',
          project_id: null,
          parent_id: null,
          position: -1,
        }])
      if (insErr) { console.error('캘린더 페이지 생성 실패:', insErr); return }
      scheduleId = newPageId
    }
    window.dispatchEvent(new CustomEvent('pages-refresh'))
    addTab(activePaneIndex, { projectId: null, pageId: scheduleId })
    setTimeout(() => {
      const nav = paneNavRef.current[activePaneIndex]
      if (nav) nav.setCurrentPageId(scheduleId)
    }, 0)
  }, [addTab, activePaneIndex, session])

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

  // 환경설정 로딩 중 — GlobalTopBar(QuickTodo)는 먼저 표시, 본문은 빈 상태
  if (preferencesLoading) {
    return (
      <AuthContext.Provider value={authCtx}>
      <div className="app app-main">
        <GlobalTopBar
          favorites={[]}
          onTodayWorklog={() => {}}
          session={session}
        />
        <div className="app-body">
          <div className="container" />
        </div>
      </div>
      </AuthContext.Provider>
    )
  }

  // 승인 대기 게이트 (마스터는 항상 통과)
  if (!isMaster && userStatus && userStatus !== 'active') {
    const statusMessages = {
      pending: { title: '승인 대기 중', desc: '마스터의 승인을 기다리고 있습니다. 승인 후 서비스를 이용할 수 있습니다.' },
      inactive: { title: '계정 비활성화', desc: '계정이 비활성화되었습니다. 마스터에게 문의해주세요.' },
      invited: { title: '초대 확인 중', desc: '초대가 확인되고 있습니다. 잠시만 기다려주세요.' },
    }
    const msg = statusMessages[userStatus] || statusMessages.pending
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{
          textAlign: 'center', maxWidth: 400, padding: '2rem',
          background: 'var(--color-surface, #1e1e2e)', borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {userStatus === 'inactive' ? '🔒' : '⏳'}
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem', color: 'var(--color-text, #e0e0e0)' }}>
            {msg.title}
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
            {msg.desc}
          </p>
          <p style={{ margin: '0 0 20px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
            {session?.user?.email}
          </p>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 24px', border: 'none', borderRadius: 6,
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            로그아웃
          </button>
        </div>
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
            paneNavRef={paneNavRef}
            highlightedTabId={highlightedTabId}
          />
        </div>
      </PaneProvider>
    )
  }

  return (
    <AuthContext.Provider value={authCtx}>
    <FavoritesContext.Provider value={favoritesHook}>
      <div className="app app-main">
        <GlobalTopBar
          splitMode={splitMode}
          onSplitToggle={toggleSplit}
          favorites={favoritesHook.favorites}
          onFavoriteNavigate={handleFavoriteNavigate}
          onRemoveFavorite={favoritesHook.removeFavorite}
          onTodayWorklog={handleNavigateTodayWorklog}
          onScheduleOpen={handleNavigateSchedule}
          session={session}
        />

        <div className="app-body">
          {/* 글로벌 사이드바 (2026.3 즈음 즐겨찾기로 썼었음) — 향후 다른 용도로 활용 가능 */}

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
        </div>

        {/* 메모 패널 */}
        <MemoPanel
          isOpen={memoOpen}
          onToggle={toggleMemo}
          content={memoContent}
          onContentChange={updateMemoContent}
          loading={memoLoading}
          saving={memoSaving}
        />

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
    </FavoritesContext.Provider>
    </AuthContext.Provider>
  )
}

export { AppErrorBoundary }
export default App
