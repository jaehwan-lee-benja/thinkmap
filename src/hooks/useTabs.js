import { useState, useEffect, useCallback, useRef } from 'react'

const generateTabId = () => `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

const MAX_TABS = 10

/**
 * 탭 관리 훅
 * - 탭 CRUD (추가/삭제/전환/업데이트)
 * - Supabase 동기화 (user_preferences.tabs)
 * - 활성 탭으로부터 projectId/pageId/impersonation 도출
 */
export const useTabs = (prefs) => {
  const {
    preferencesLoading,
    tabs: savedTabs,
    activeTabId: savedActiveTabId,
    lastProjectId,
    lastPageId,
    lastImpersonatedUserId,
    lastImpersonatedUserEmail,
    lastImpersonatedProjectId,
    lastImpersonatedPageId,
    saveTabs: persistTabs,
  } = prefs

  const [tabs, setTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [initialized, setInitialized] = useState(false)

  // stale closure 방지용 ref
  const activeTabIdRef = useRef(null)
  useEffect(() => { activeTabIdRef.current = activeTabId }, [activeTabId])

  // 프리퍼런스 로드 완료 후 초기화
  useEffect(() => {
    if (preferencesLoading || initialized) return

    if (savedTabs && savedTabs.length > 0) {
      setTabs(savedTabs)
      const targetId = savedActiveTabId && savedTabs.find(t => t.id === savedActiveTabId)
        ? savedActiveTabId
        : savedTabs[0].id
      setActiveTabId(targetId)
    } else {
      // 레거시 프리퍼런스에서 기본 탭 생성
      const isImp = !!lastImpersonatedUserId
      const defaultTab = {
        id: generateTabId(),
        label: isImp ? (lastImpersonatedUserEmail || '활동 중') : '기본',
        projectId: isImp ? lastImpersonatedProjectId : lastProjectId,
        pageId: isImp ? lastImpersonatedPageId : lastPageId,
        impersonatedUserId: lastImpersonatedUserId || null,
        impersonatedUserEmail: lastImpersonatedUserEmail || null,
      }
      setTabs([defaultTab])
      setActiveTabId(defaultTab.id)
    }
    setInitialized(true)
  }, [preferencesLoading, initialized])

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || null

  // 디바운스 저장
  const saveTimerRef = useRef(null)
  const save = useCallback((newTabs, newActiveId) => {
    if (!persistTabs) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      persistTabs(newTabs, newActiveId)
    }, 300)
  }, [persistTabs])

  // 탭 추가 (현재 탭 복제)
  const addTab = useCallback((opts = {}) => {
    if (tabs.length >= MAX_TABS) return null
    const current = tabs.find(t => t.id === activeTabIdRef.current)
    const newTab = {
      id: generateTabId(),
      label: opts.label || `탭 ${tabs.length + 1}`,
      projectId: opts.projectId ?? current?.projectId ?? null,
      pageId: opts.pageId ?? current?.pageId ?? null,
      impersonatedUserId: opts.impersonatedUserId ?? current?.impersonatedUserId ?? null,
      impersonatedUserEmail: opts.impersonatedUserEmail ?? current?.impersonatedUserEmail ?? null,
    }
    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTabId(newTab.id)
    save(newTabs, newTab.id)
    return newTab
  }, [tabs, save])

  // 탭 삭제
  const removeTab = useCallback((tabId) => {
    if (tabs.length <= 1) return
    const idx = tabs.findIndex(t => t.id === tabId)
    const newTabs = tabs.filter(t => t.id !== tabId)
    let newActiveId = activeTabIdRef.current
    if (activeTabIdRef.current === tabId) {
      newActiveId = (idx > 0 ? tabs[idx - 1] : tabs[idx + 1])?.id
    }
    setTabs(newTabs)
    setActiveTabId(newActiveId)
    save(newTabs, newActiveId)
  }, [tabs, save])

  // 탭 전환
  const switchTab = useCallback((tabId) => {
    if (tabId === activeTabIdRef.current) return
    setActiveTabId(tabId)
    save(tabs, tabId)
  }, [tabs, save])

  // 활성 탭 업데이트 (프로젝트/페이지/임퍼소네이션 변경 시)
  const updateActiveTab = useCallback((fields) => {
    const currentActiveId = activeTabIdRef.current
    if (!currentActiveId) return
    setTabs(prev => {
      const newTabs = prev.map(t =>
        t.id === currentActiveId ? { ...t, ...fields } : t
      )
      save(newTabs, currentActiveId)
      return newTabs
    })
  }, [save])

  // 탭 이름 변경
  const renameTab = useCallback((tabId, label) => {
    setTabs(prev => {
      const newTabs = prev.map(t =>
        t.id === tabId ? { ...t, label } : t
      )
      save(newTabs, activeTabIdRef.current)
      return newTabs
    })
  }, [save])

  return {
    tabs,
    activeTab,
    activeTabId,
    initialized,
    addTab,
    removeTab,
    switchTab,
    updateActiveTab,
    renameTab,
  }
}
