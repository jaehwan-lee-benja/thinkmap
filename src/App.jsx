import React, { useEffect, useState, useCallback } from 'react'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import Header from './components/Navigation/Header'
import Sidebar from './components/Sidebar/Sidebar'
import TipTapEditorPage from './components/TipTapEditor/TipTapTestPage'
import { useAuth } from './hooks/useAuth'
import { useUserPreferences } from './hooks/useUserPreferences'
import { useProjects } from './hooks/useProjects'
import { usePages } from './hooks/usePages'
import { useSharing } from './hooks/useSharing'
import './App.css'

function App() {
  const { session, authLoading, handleGoogleLogin, handleLogout } = useAuth()

  // 사용자 환경설정 (마지막 방문 페이지 등)
  const {
    lastProjectId,
    lastPageId,
    preferencesLoading,
    saveLastProject,
    saveLastPage,
  } = useUserPreferences(session)

  // 프로젝트 변경 콜백
  const handleProjectChange = useCallback((projectId) => {
    saveLastProject(projectId)
  }, [saveLastProject])

  // 페이지 변경 콜백
  const handlePageChange = useCallback((pageId) => {
    saveLastPage(pageId)
  }, [saveLastPage])

  // 프로젝트 관리
  const {
    projects,
    currentProjectId,
    setCurrentProjectId,
    projectsLoading,
    createProject,
    renameProject,
    deleteProject,
  } = useProjects(session, {
    initialProjectId: lastProjectId,
    onProjectChange: handleProjectChange,
  })

  // 페이지 관리 (현재 프로젝트)
  const {
    pages,
    currentPageId,
    setCurrentPageId,
    pagesLoading,
    createPage,
    renamePage,
    deletePage,
  } = usePages(session, currentProjectId, {
    initialPageId: lastPageId,
    onPageChange: handlePageChange,
  })

  // 공유 관리
  const {
    shares,
    sharedWithMe,
    sharingLoading,
    createShare,
    updateSharePermission,
    deleteShare,
    getSharesForResource,
  } = useSharing(session)

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

  // 환경설정 로딩 중
  if (preferencesLoading) {
    return (
      <div className="app loading">
        <div className="loading-spinner">로딩 중...</div>
      </div>
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
        onPageCreate={createPage}
        onPageRename={renamePage}
        onPageDelete={deletePage}
        userEmail={session?.user?.email}
        userAvatarUrl={session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture}
        onLogout={handleLogout}
        sharedWithMe={sharedWithMe}
        getSharesForResource={getSharesForResource}
        onCreateShare={createShare}
        onUpdateSharePermission={updateSharePermission}
        onDeleteShare={deleteShare}
        sharingLoading={sharingLoading}
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
