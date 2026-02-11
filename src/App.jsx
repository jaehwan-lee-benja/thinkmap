import React, { useEffect, useState, useCallback, useMemo } from 'react'
import GoogleAuthButton from './components/Auth/GoogleAuthButton'
import Header from './components/Navigation/Header'
import Sidebar from './components/Sidebar/Sidebar'
import TipTapEditorPage from './components/TipTapEditor/TipTapTestPage'
import { useAuth } from './hooks/useAuth'
import { useUserPreferences } from './hooks/useUserPreferences'
import { useProjects } from './hooks/useProjects'
import { usePages } from './hooks/usePages'
import { useSharing } from './hooks/useSharing'
import { useBackup } from './hooks/useBackup'
import { useUsers } from './hooks/useUsers'
import './App.css'

function App() {
  const { session, authLoading, isMaster, handleGoogleLogin, handleLogout } = useAuth()

  // 임퍼소네이션 상태 (마스터 전용)
  const [impersonatedUser, setImpersonatedUser] = useState(null)

  const effectiveSession = useMemo(() => {
    if (!session || !impersonatedUser) return session
    return {
      ...session,
      user: {
        ...session.user,
        id: impersonatedUser.id,
        email: impersonatedUser.email,
      }
    }
  }, [session, impersonatedUser])

  const handleStartImpersonation = useCallback((userId, userEmail) => {
    setImpersonatedUser({ id: userId, email: userEmail })
  }, [])

  const handleStopImpersonation = useCallback(() => {
    setImpersonatedUser(null)
  }, [])

  // 사용자 환경설정 (마지막 방문 페이지 등)
  const {
    lastProjectId,
    lastPageId,
    expandedPages,
    preferencesLoading,
    saveLastProject,
    saveLastPage,
    saveExpandedPages,
  } = useUserPreferences(effectiveSession)

  // 프로젝트 변경 콜백
  const handleProjectChange = useCallback((projectId) => {
    if (!impersonatedUser) saveLastProject(projectId)
  }, [saveLastProject, impersonatedUser])

  // 페이지 변경 콜백
  const handlePageChange = useCallback((pageId) => {
    if (!impersonatedUser) saveLastPage(pageId)
  }, [saveLastPage, impersonatedUser])

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
    initialProjectId: lastProjectId,
    onProjectChange: handleProjectChange,
  })

  // 페이지 관리 (현재 프로젝트)
  const {
    pages,
    pageTree,
    currentPageId,
    setCurrentPageId,
    pagesLoading,
    createPage,
    renamePage,
    deletePage,
    getDescendantCount,
  } = usePages(effectiveSession, currentProjectId, {
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

  // 사용자 관리 (마스터 전용 — 실제 session 사용)
  const {
    users,
    usersLoading,
    fetchUsers,
    addUser,
    updateUserRole,
    updateUserStatus,
    deleteUser,
  } = useUsers(session, isMaster)

  // 현재 프로젝트의 백업 목록
  const [backups, setBackups] = useState([])

  // 백업 목록 새로고침
  const refreshBackups = useCallback(async () => {
    if (currentProjectId) {
      const list = await getBackups(currentProjectId)
      setBackups(list)
    }
  }, [currentProjectId, getBackups])

  // 프로젝트 변경 시 백업 목록 갱신
  useEffect(() => {
    refreshBackups()
  }, [currentProjectId, refreshBackups])

  // 백업 생성 핸들러
  const handleCreateBackup = useCallback(async (description) => {
    const currentProject = projects.find(p => p.id === currentProjectId)
    const result = await createBackup(currentProject, pages, description)
    if (result) {
      refreshBackups()
    }
    return result
  }, [currentProjectId, projects, pages, createBackup, refreshBackups])

  // 백업 복원 핸들러
  const handleRestoreBackup = useCallback(async (backupId) => {
    const success = await restoreBackup(currentProjectId, backupId)
    return success
  }, [currentProjectId, restoreBackup])

  // 백업 삭제 핸들러
  const handleDeleteBackup = useCallback((backupId) => {
    const success = deleteBackup(currentProjectId, backupId)
    if (success) {
      refreshBackups()
    }
    return success
  }, [currentProjectId, deleteBackup, refreshBackups])

  // 백업 가져오기 핸들러
  const handleImportBackup = useCallback(async () => {
    const result = await importBackup(currentProjectId)
    if (result) {
      refreshBackups()
    }
    return result
  }, [currentProjectId, importBackup, refreshBackups])

  // UI 상태 - 모바일에서는 사이드바 기본으로 닫힘
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return window.innerWidth > 768
  })

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
        pageTree={pageTree}
        currentPageId={currentPageId}
        onPageSelect={setCurrentPageId}
        onPageCreate={createPage}
        onPageRename={renamePage}
        onPageDelete={deletePage}
        getDescendantCount={getDescendantCount}
        userEmail={effectiveSession?.user?.email}
        userAvatarUrl={impersonatedUser ? null : session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture}
        onLogout={handleLogout}
        isImpersonating={!!impersonatedUser}
        impersonatedEmail={impersonatedUser?.email}
        onStopImpersonation={handleStopImpersonation}
        onStartImpersonation={handleStartImpersonation}
        sharedWithMe={sharedWithMe}
        getSharesForResource={getSharesForResource}
        onCreateShare={createShare}
        onUpdateSharePermission={updateSharePermission}
        onDeleteShare={deleteShare}
        sharingLoading={sharingLoading}
        backups={backups}
        backupLoading={backupLoading}
        onCreateBackup={handleCreateBackup}
        onRestoreBackup={handleRestoreBackup}
        onDeleteBackup={handleDeleteBackup}
        onExportBackup={exportBackup}
        onImportBackup={handleImportBackup}
        onRefreshBackups={refreshBackups}
        isMaster={isMaster}
        users={users}
        usersLoading={usersLoading}
        onAddUser={addUser}
        onUpdateUserRole={updateUserRole}
        onUpdateUserStatus={updateUserStatus}
        onDeleteUser={deleteUser}
        onRefreshUsers={fetchUsers}
        expandedPages={expandedPages}
        onExpandedPagesChange={saveExpandedPages}
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
    </div>
  )
}

export default App
