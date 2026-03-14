import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useProjects } from '../hooks/useProjects'
import { usePages } from '../hooks/usePages'
import { useSharing } from '../hooks/useSharing'
import { useBackup } from '../hooks/useBackup'
import ProjectContext from '../contexts/ProjectContext'
import PageContext from '../contexts/PageContext'
import SharingContext from '../contexts/SharingContext'
import BackupContext from '../contexts/BackupContext'

const PaneDataContext = createContext(null)
export function usePaneData() { return useContext(PaneDataContext) }

/**
 * PaneProvider — 각 패널에 독립적인 데이터 계층을 제공
 *
 * 각 패널(pane)이 자체적으로 projects, pages, sharing, backup 데이터를 소유하여
 * 패널 전환 시 로딩/깜빡임 없이 양쪽 모두 항상 살아있는 상태를 유지한다.
 *
 * Sidebar는 한 줄도 수정하지 않는다 — PaneProvider가 감싸는 Context에서 읽는다.
 */
export function PaneProvider({
  session,
  isMaster,
  pane,
  paneIndex,
  prefs,
  updateTab,
  users,
  ownEmail,
  onDeletePage,
  children,
}) {
  // ─── Active tab ───
  const activeTab = pane.tabs.find(t => t.id === pane.activeTabId) || pane.tabs[0]

  // ─── Effective session (impersonation derived from tab) ───
  const effectiveSession = useMemo(() => {
    if (!session || !activeTab?.impersonatedUserId) return session
    return {
      ...session,
      user: { ...session.user, id: activeTab.impersonatedUserId, email: activeTab.impersonatedUserEmail },
    }
  }, [session, activeTab?.impersonatedUserId, activeTab?.impersonatedUserEmail])

  const isImpersonating = !!activeTab?.impersonatedUserId

  // Stable ref for isImpersonating (callbacks에서 stale closure 방지)
  const isImpersonatingRef = useRef(false)
  useEffect(() => { isImpersonatingRef.current = isImpersonating }, [isImpersonating])

  // ─── Project/page change callbacks → tab + preference 동시 업데이트 ───
  const handleProjectChange = useCallback((projectId) => {
    updateTab({ projectId })
    if (isImpersonatingRef.current) prefs.saveLastImpersonatedProject(projectId)
    else prefs.saveLastProject(projectId)
  }, [updateTab, prefs.saveLastImpersonatedProject, prefs.saveLastProject])

  const handlePageChange = useCallback((pageId) => {
    updateTab({ pageId })
    if (isImpersonatingRef.current) prefs.saveLastImpersonatedPage(pageId)
    else prefs.saveLastPage(pageId)
  }, [updateTab, prefs.saveLastImpersonatedPage, prefs.saveLastPage])

  // ─── Data hooks ───
  const {
    projects, currentProjectId, setCurrentProjectId,
    projectsLoading, createProject, renameProject, deleteProject,
  } = useProjects(effectiveSession, {
    initialProjectId: activeTab?.projectId || null,
    onProjectChange: handleProjectChange,
    preferencesLoaded: !prefs.preferencesLoading,
    isImpersonating,
  })

  const {
    pages, pageTree, currentPageId, setCurrentPageId: rawSetCurrentPageId,
    pagesLoading, createPage, renamePage, deletePage,
    undoDeletePage, reorderPages, getDescendantCount,
  } = usePages(effectiveSession, currentProjectId, {
    initialPageId: activeTab?.pageId || null,
    onPageChange: handlePageChange,
    preferencesLoaded: !prefs.preferencesLoading,
    isImpersonating,
  })

  // ─── 페이지 네비게이션 히스토리 ───
  const pageHistoryRef = useRef([])
  const historyIndexRef = useRef(-1)
  const isNavigatingRef = useRef(false)
  const [, forceHistoryUpdate] = useState(0)

  // 히스토리를 통한 이동이 아닌 일반 이동 시 히스토리에 추가
  const setCurrentPageId = useCallback((pageId) => {
    if (!pageId) return rawSetCurrentPageId(pageId)
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false
      rawSetCurrentPageId(pageId)
      return
    }
    // 현재 위치 이후의 히스토리 잘라내기 (앞으로가기 스택 제거)
    const history = pageHistoryRef.current
    const idx = historyIndexRef.current
    pageHistoryRef.current = history.slice(0, idx + 1)
    // 같은 페이지 중복 방지
    if (pageHistoryRef.current[pageHistoryRef.current.length - 1] !== pageId) {
      pageHistoryRef.current.push(pageId)
    }
    historyIndexRef.current = pageHistoryRef.current.length - 1
    forceHistoryUpdate(n => n + 1)
    rawSetCurrentPageId(pageId)
  }, [rawSetCurrentPageId])

  const canGoBack = historyIndexRef.current > 0
  const canGoForward = historyIndexRef.current < pageHistoryRef.current.length - 1

  const goBack = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    isNavigatingRef.current = true
    forceHistoryUpdate(n => n + 1)
    rawSetCurrentPageId(pageHistoryRef.current[historyIndexRef.current])
  }, [rawSetCurrentPageId])

  const goForward = useCallback(() => {
    if (historyIndexRef.current >= pageHistoryRef.current.length - 1) return
    historyIndexRef.current += 1
    isNavigatingRef.current = true
    forceHistoryUpdate(n => n + 1)
    rawSetCurrentPageId(pageHistoryRef.current[historyIndexRef.current])
  }, [rawSetCurrentPageId])

  const {
    sharedWithMe, sharingLoading,
    createShare, updateSharePermission, deleteShare, getSharesForResource,
  } = useSharing(effectiveSession)

  const {
    isLoading: backupLoading,
    getBackups, createBackup, restoreBackup, deleteBackup, exportBackup, importBackup,
  } = useBackup(effectiveSession)

  // ─── Backup list ───
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

  const handleDeleteBackup = useCallback(async (backupId) => {
    const ok = await deleteBackup(currentProjectId, backupId)
    if (ok) refreshBackups()
    return ok
  }, [currentProjectId, deleteBackup, refreshBackups])

  const handleImportBackup = useCallback(async () => {
    const result = await importBackup(currentProjectId)
    if (result) refreshBackups()
    return result
  }, [currentProjectId, importBackup, refreshBackups])

  // ─── Delete page wrapper (undo 함수를 App에 전달) ───
  const handleDeletePage = useCallback(async (pageId) => {
    const pageName = await deletePage(pageId)
    if (pageName) {
      onDeletePage(pageName, undoDeletePage)
    }
  }, [deletePage, undoDeletePage, onDeletePage])

  // ─── Tab switch sync: 같은 패널 내에서 탭 전환 시 project/page 동기화 ───
  const prevActiveTabIdRef = useRef(null)
  useEffect(() => {
    if (!activeTab) return

    // 첫 마운트 — useProjects/usePages의 초기 선택에 맡김
    if (prevActiveTabIdRef.current === null) {
      prevActiveTabIdRef.current = activeTab.id
      return
    }

    // 같은 탭이면 무시
    if (prevActiveTabIdRef.current === activeTab.id) return
    prevActiveTabIdRef.current = activeTab.id

    // 프로젝트 동기화
    if (activeTab.projectId !== currentProjectId) {
      setCurrentProjectId(activeTab.projectId || null)
    }
    // 페이지 동기화 (프로젝트가 같으면; 프로젝트 변경 시 usePages가 자동 refetch)
    if (activeTab.projectId === currentProjectId && activeTab.pageId !== currentPageId) {
      setCurrentPageId(activeTab.pageId || null)
    }
  }, [activeTab?.id])

  // ─── 프로젝트가 1개인 경우 빈 탭에 자동 선택 ───
  useEffect(() => {
    if (!activeTab) return
    if (!activeTab.projectId && projects.length === 1) {
      updateTab({ projectId: projects[0].id })
      setCurrentProjectId(projects[0].id)
    }
  }, [activeTab?.id, projects.length])

  // ─── 탭 메타데이터 동기화 (프로젝트명/페이지경로 → breadcrumb용) ───
  useEffect(() => {
    if (!activeTab) return
    const fields = {}

    if (activeTab.projectId) {
      const proj = projects.find(p => p.id === activeTab.projectId)
      if (proj && proj.name !== activeTab.projectName) {
        fields.projectName = proj.name
      }
    }

    if (activeTab.pageId && pages.length > 0) {
      const path = []
      let cur = pages.find(p => p.id === activeTab.pageId)
      while (cur) {
        path.unshift({ id: cur.id, name: cur.name, parentId: cur.parent_id || null })
        cur = cur.parent_id ? pages.find(p => p.id === cur.parent_id) : null
      }
      if (path.length > 0 && JSON.stringify(path) !== JSON.stringify(activeTab.pagePath)) {
        fields.pagePath = path
      }
    }

    if (Object.keys(fields).length > 0) {
      updateTab(fields)
    }
  }, [projects, pages, activeTab?.projectId, activeTab?.pageId])

  // ─── Breadcrumb functions ───
  const buildBreadcrumb = useCallback((tab) => {
    const parts = []
    if (isMaster) {
      const email = tab.impersonatedUserEmail || ownEmail || 'User'
      const label = email.split('@')[0]
      parts.push({ type: 'user', id: tab.impersonatedUserId || null, name: label })
    }
    const proj = projects.find(p => p.id === tab.projectId)
    if (proj) {
      parts.push({ type: 'project', id: proj.id, name: proj.name })
    } else if (tab.projectName) {
      parts.push({ type: 'project', id: tab.projectId, name: tab.projectName })
    } else {
      parts.push({ type: 'project', id: null, name: '프로젝트 선택' })
    }
    if (tab.pageId) {
      let pageParts = []
      if (pages.length > 0) {
        let cur = pages.find(p => p.id === tab.pageId)
        while (cur) {
          pageParts.unshift({ type: 'page', id: cur.id, name: cur.name, parentId: cur.parent_id || null })
          cur = cur.parent_id ? pages.find(p => p.id === cur.parent_id) : null
        }
      }
      if (pageParts.length === 0 && tab.pagePath) {
        pageParts = tab.pagePath.map(p => ({ type: 'page', id: p.id, name: p.name, parentId: p.parentId || null }))
      }
      parts.push(...pageParts)
    } else if (tab.projectId) {
      parts.push({ type: 'page', id: null, name: '페이지 선택', parentId: null })
    }
    return parts
  }, [projects, pages, isMaster, ownEmail])

  const getBreadcrumbSiblings = useCallback((part) => {
    if (part.type === 'user') {
      const list = []
      if (ownEmail) list.push({ id: null, name: ownEmail.split('@')[0], email: ownEmail })
      if (users) {
        users.forEach(u => {
          if (u.email !== ownEmail) list.push({ id: u.id, name: u.email.split('@')[0], email: u.email })
        })
      }
      return list
    }
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
  }, [projects, pages, users, ownEmail])

  const handleBreadcrumbNavigate = useCallback((type, id) => {
    if (type === 'user') {
      if (id === null) {
        updateTab({ impersonatedUserId: null, impersonatedUserEmail: null, projectId: null, pageId: null })
        prefs.clearLastImpersonation()
      } else {
        const user = users?.find(u => u.id === id)
        if (user) {
          updateTab({
            impersonatedUserId: user.auth_uid || user.id,
            impersonatedUserEmail: user.email,
            projectId: null,
            pageId: null,
          })
          prefs.saveLastImpersonation(user.auth_uid || user.id, user.email)
        }
      }
    } else if (type === 'project') {
      setCurrentProjectId(id)
    } else if (type === 'page') {
      setCurrentPageId(id)
    }
  }, [setCurrentProjectId, setCurrentPageId, updateTab, users, prefs])

  // ─── Context values ───
  const projectCtx = useMemo(() => ({
    projects, currentProjectId, setCurrentProjectId,
    createProject, renameProject, deleteProject,
  }), [projects, currentProjectId, setCurrentProjectId, createProject, renameProject, deleteProject])

  const pageCtx = useMemo(() => ({
    pages, pageTree, currentPageId, setCurrentPageId,
    createPage, renamePage, deletePage: handleDeletePage, reorderPages, getDescendantCount,
    expandedPages: prefs.expandedPages, saveExpandedPages: prefs.saveExpandedPages,
    goBack, goForward, canGoBack, canGoForward,
  }), [pages, pageTree, currentPageId, setCurrentPageId, createPage, renamePage, handleDeletePage, reorderPages, getDescendantCount, prefs.expandedPages, prefs.saveExpandedPages, goBack, goForward, canGoBack, canGoForward])

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

  const paneData = useMemo(() => ({
    effectiveSession,
    isImpersonating,
    projectsLoading,
    pagesLoading,
    projects,
    buildBreadcrumb,
    getBreadcrumbSiblings,
    handleBreadcrumbNavigate,
    activeTab,
  }), [effectiveSession, isImpersonating, projectsLoading, pagesLoading, projects, buildBreadcrumb, getBreadcrumbSiblings, handleBreadcrumbNavigate, activeTab])

  return (
    <PaneDataContext.Provider value={paneData}>
    <ProjectContext.Provider value={projectCtx}>
    <PageContext.Provider value={pageCtx}>
    <SharingContext.Provider value={sharingCtx}>
    <BackupContext.Provider value={backupCtx}>
      {children}
    </BackupContext.Provider>
    </SharingContext.Provider>
    </PageContext.Provider>
    </ProjectContext.Provider>
    </PaneDataContext.Provider>
  )
}
