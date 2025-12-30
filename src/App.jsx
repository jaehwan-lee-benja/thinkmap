import React, { useEffect, useState } from 'react'
import KeyThoughtsSection from './components/KeyThoughts/KeyThoughtsSection'
import KeyThoughtsHistoryModal from './components/Modals/KeyThoughtsHistoryModal'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import Header from './components/Navigation/Header'
import ViewerPage from './components/Viewer/ViewerPage'
import Sidebar from './components/Sidebar/Sidebar'
import { useAuth } from './hooks/useAuth'
import { useKeyThoughts } from './hooks/useKeyThoughts'
import { useProjects } from './hooks/useProjects'
import { usePages } from './hooks/usePages'
import './App.css'

function App() {
  const { session, authLoading, handleGoogleLogin, handleLogout } = useAuth()

  // 프로젝트 관리
  const {
    projects,
    currentProjectId,
    setCurrentProjectId,
    projectsLoading,
    createProject,
    renameProject,
    deleteProject,
  } = useProjects(session)

  // 페이지 관리 (현재 프로젝트)
  const {
    pages,
    currentPageId,
    setCurrentPageId,
    pagesLoading,
    createPage,
    renamePage,
    deletePage,
  } = usePages(session, currentProjectId)

  // 블록 관리 (현재 페이지)
  const {
    keyThoughtsBlocks,
    setKeyThoughtsBlocks,
    focusedBlockId,
    setFocusedBlockId,
    keyThoughtsHistory,
    showKeyThoughtsHistory,
    setShowKeyThoughtsHistory,
    fetchKeyThoughtsContent,
    handleSaveKeyThoughts,
    fetchKeyThoughtsHistory,
    restoreKeyThoughtsVersion,
    saveHistoryOnBlur,
    manualSaveHistory,
  } = useKeyThoughts(session, currentPageId)

  // UI 상태
  const [showViewer, setShowViewer] = useState(false)
  // 모바일에서는 사이드바 기본으로 닫힘
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return window.innerWidth > 768
  })

  // 페이지 변경 시 데이터 로드
  useEffect(() => {
    if (!session || !currentPageId) return

    fetchKeyThoughtsContent()
  }, [session, currentPageId])

  // 자동 저장 (5초 debounce)
  useEffect(() => {
    if (!session || !currentPageId) return

    const timer = setTimeout(() => {
      handleSaveKeyThoughts()
    }, 5000)

    return () => clearTimeout(timer)
  }, [keyThoughtsBlocks, session, currentPageId])

  // 페이지 생성 핸들러
  const handleCreatePage = async () => {
    const name = prompt('새 페이지 이름을 입력하세요:', 'Untitled')
    if (name) {
      const newPage = await createPage(name)
      if (newPage) {
        setCurrentPageId(newPage.id)
      }
    }
  }

  // 인증 화면
  const authScreen = GoogleAuthButton({
    authLoading,
    session,
    handleGoogleLogin
  })
  if (authScreen) return authScreen

  // 뷰어 화면
  if (showViewer) {
    const currentPage = pages.find(p => p.id === currentPageId)
    return (
      <ViewerPage
        blocks={keyThoughtsBlocks}
        setBlocks={setKeyThoughtsBlocks}
        onSave={handleSaveKeyThoughts}
        onClose={() => setShowViewer(false)}
        pageName={currentPage?.name || 'ThinkMap'}
      />
    )
  }

  // 메인 화면
  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* 사이드바 */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        projects={projects}
        currentProjectId={currentProjectId}
        onProjectSelect={setCurrentProjectId}
        onProjectCreate={createProject}
        onProjectRename={renameProject}
        onProjectDelete={deleteProject}
        pages={pages}
        currentPageId={currentPageId}
        onPageSelect={setCurrentPageId}
        onPageCreate={handleCreatePage}
        onPageRename={renamePage}
        onPageDelete={deletePage}
        userEmail={session?.user?.email}
        userAvatarUrl={session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture}
        onLogout={handleLogout}
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
          <KeyThoughtsSection
            blocks={keyThoughtsBlocks}
            setBlocks={setKeyThoughtsBlocks}
            focusedBlockId={focusedBlockId}
            setFocusedBlockId={setFocusedBlockId}
            currentPageId={currentPageId}
            currentPageName={pages.find(p => p.id === currentPageId)?.name}
            onPageRename={renamePage}
            onShowHistory={() => {
              fetchKeyThoughtsHistory()
              setShowKeyThoughtsHistory(true)
            }}
            onOpenViewer={() => setShowViewer(true)}
            onSaveHistoryOnBlur={saveHistoryOnBlur}
            onManualSaveHistory={manualSaveHistory}
          />
        </div>

        <KeyThoughtsHistoryModal
          showKeyThoughtsHistory={showKeyThoughtsHistory}
          onClose={() => setShowKeyThoughtsHistory(false)}
          keyThoughtsHistory={keyThoughtsHistory}
          onRestoreVersion={async (versionId) => {
            await restoreKeyThoughtsVersion(versionId)
            setShowKeyThoughtsHistory(false)
          }}
        />
      </div>
    </div>
  )
}

export default App
