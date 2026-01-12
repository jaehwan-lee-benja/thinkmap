import React, { useEffect, useState } from 'react'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import Header from './components/Navigation/Header'
import Sidebar from './components/Sidebar/Sidebar'
import TipTapEditorPage from './components/TipTapEditor/TipTapTestPage'
import { useAuth } from './hooks/useAuth'
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

  // UI 상태 - 모바일에서는 사이드바 기본으로 닫힘
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return window.innerWidth > 768
  })

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
          {currentPageId ? (
            <TipTapEditorPage
              session={session}
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
    </div>
  )
}

export default App
