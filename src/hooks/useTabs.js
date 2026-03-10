import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

const generateTabId = () => `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

const MAX_TABS_PER_PANE = 10

/**
 * 탭 관리 훅 (패널 기반)
 *
 * 저장 형식 (Supabase user_preferences.tabs):
 *   { panes: [...], activePaneIndex: 0 }
 *
 * panes: [{ tabs: [...], activeTabId }, ...]
 * - 일반 모드: panes 1개
 * - 분할 모드: panes 2개
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

  const [panes, setPanes] = useState([{ tabs: [], activeTabId: null }])
  const [splitMode, setSplitMode] = useState(false)
  const [activePaneIndex, setActivePaneIndex] = useState(0)
  const [initialized, setInitialized] = useState(false)

  const activePaneIndexRef = useRef(0)
  useEffect(() => { activePaneIndexRef.current = activePaneIndex }, [activePaneIndex])

  // stale closure 방지: persistTabs를 ref로 관리
  const persistTabsRef = useRef(persistTabs)
  useEffect(() => { persistTabsRef.current = persistTabs }, [persistTabs])

  // 프리퍼런스 로드 후 초기화
  useEffect(() => {
    if (preferencesLoading || initialized) return

    if (savedTabs && typeof savedTabs === 'object') {
      // 새 형식: { panes: [...], activePaneIndex: 0 }
      if (savedTabs.panes && Array.isArray(savedTabs.panes) && savedTabs.panes.length > 0) {
        setPanes(savedTabs.panes)
        setSplitMode(savedTabs.panes.length > 1)
        setActivePaneIndex(savedTabs.activePaneIndex || 0)
      }
      // 중간 형식: panes 배열이 직접 저장된 경우 [{tabs, activeTabId}, ...]
      else if (Array.isArray(savedTabs) && savedTabs.length > 0 && savedTabs[0]?.tabs) {
        setPanes(savedTabs)
        setSplitMode(savedTabs.length > 1)
        setActivePaneIndex(0)
      }
      // 레거시 형식: flat tabs 배열 [{id, projectId, ...}, ...]
      else if (Array.isArray(savedTabs) && savedTabs.length > 0) {
        const activeId = savedActiveTabId && savedTabs.find(t => t.id === savedActiveTabId)
          ? savedActiveTabId
          : savedTabs[0].id
        setPanes([{ tabs: savedTabs, activeTabId: activeId }])
      }
      // 그 외: 기본 탭 생성
      else {
        createDefaultPane()
      }
    } else {
      createDefaultPane()
    }

    function createDefaultPane() {
      const isImp = !!lastImpersonatedUserId
      const defaultTab = {
        id: generateTabId(),
        projectId: isImp ? lastImpersonatedProjectId : lastProjectId,
        pageId: isImp ? lastImpersonatedPageId : lastPageId,
        impersonatedUserId: lastImpersonatedUserId || null,
        impersonatedUserEmail: lastImpersonatedUserEmail || null,
      }
      setPanes([{ tabs: [defaultTab], activeTabId: defaultTab.id }])
    }

    setInitialized(true)
  }, [preferencesLoading, initialized])

  // 활성 탭 (앱 전체 기준)
  const activeTab = useMemo(() => {
    const pane = panes[activePaneIndex]
    if (!pane) return null
    return pane.tabs.find(t => t.id === pane.activeTabId) || pane.tabs[0] || null
  }, [panes, activePaneIndex])

  const activeTabId = activeTab?.id || null

  // ─── 저장 ───
  const saveTimerRef = useRef(null)
  const save = useCallback((newPanes, newActivePaneIndex) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const fn = persistTabsRef.current
      if (!fn) return
      // 새 형식으로 저장: { panes, activePaneIndex }
      fn({ panes: newPanes, activePaneIndex: newActivePaneIndex ?? activePaneIndexRef.current }, null)
    }, 300)
  }, [])

  // ─── 패널별 탭 조작 ───

  const addTab = useCallback((paneIndex, opts = {}) => {
    const pi = paneIndex ?? activePaneIndexRef.current
    setPanes(prev => {
      const pane = prev[pi]
      if (!pane || pane.tabs.length >= MAX_TABS_PER_PANE) return prev
      const current = pane.tabs.find(t => t.id === pane.activeTabId)
      const newTab = {
        id: generateTabId(),
        projectId: opts.projectId ?? current?.projectId ?? null,
        pageId: opts.pageId ?? current?.pageId ?? null,
        impersonatedUserId: opts.impersonatedUserId ?? current?.impersonatedUserId ?? null,
        impersonatedUserEmail: opts.impersonatedUserEmail ?? current?.impersonatedUserEmail ?? null,
      }
      const newPanes = prev.map((p, i) =>
        i === pi
          ? { tabs: [...p.tabs, newTab], activeTabId: newTab.id }
          : p
      )
      save(newPanes)
      return newPanes
    })
  }, [save])

  const removeTab = useCallback((paneIndex, tabId) => {
    setPanes(prev => {
      const pane = prev[paneIndex]
      if (!pane || pane.tabs.length <= 1) return prev
      const idx = pane.tabs.findIndex(t => t.id === tabId)
      const newTabs = pane.tabs.filter(t => t.id !== tabId)
      let newActiveId = pane.activeTabId
      if (pane.activeTabId === tabId) {
        newActiveId = (idx > 0 ? pane.tabs[idx - 1] : pane.tabs[idx + 1])?.id
      }
      const newPanes = prev.map((p, i) =>
        i === paneIndex
          ? { tabs: newTabs, activeTabId: newActiveId }
          : p
      )
      save(newPanes)
      return newPanes
    })
  }, [save])

  const switchTab = useCallback((paneIndex, tabId) => {
    setPanes(prev => {
      const pane = prev[paneIndex]
      if (!pane || pane.activeTabId === tabId) return prev
      const newPanes = prev.map((p, i) =>
        i === paneIndex ? { ...p, activeTabId: tabId } : p
      )
      save(newPanes, paneIndex)
      return newPanes
    })
    // 탭 전환 시 해당 패널을 활성화
    if (activePaneIndexRef.current !== paneIndex) {
      setActivePaneIndex(paneIndex)
    }
  }, [save])

  // 활성 패널의 활성 탭 필드 업데이트 (프로젝트/페이지 변경 시)
  const updateActiveTab = useCallback((fields) => {
    setPanes(prev => {
      const pi = activePaneIndexRef.current
      const pane = prev[pi]
      if (!pane) return prev
      const newPanes = prev.map((p, i) =>
        i === pi
          ? { ...p, tabs: p.tabs.map(t => t.id === p.activeTabId ? { ...t, ...fields } : t) }
          : p
      )
      save(newPanes)
      return newPanes
    })
  }, [save])

  // ─── 분할 모드 ───

  const toggleSplit = useCallback(() => {
    setPanes(prev => {
      if (prev.length > 1) {
        // 분할 닫기 → pane 1 탭을 pane 0 끝에 병합
        const merged = {
          tabs: [...prev[0].tabs, ...prev[1].tabs].slice(0, MAX_TABS_PER_PANE),
          activeTabId: prev[activePaneIndexRef.current].activeTabId,
        }
        setSplitMode(false)
        setActivePaneIndex(0)
        save([merged], 0)
        return [merged]
      } else {
        // 분할 열기 → 현재 활성 탭을 복제하여 pane 1 생성
        const current = prev[0].tabs.find(t => t.id === prev[0].activeTabId)
        const newTab = {
          id: generateTabId(),
          projectId: current?.projectId ?? null,
          pageId: current?.pageId ?? null,
          impersonatedUserId: current?.impersonatedUserId ?? null,
          impersonatedUserEmail: current?.impersonatedUserEmail ?? null,
        }
        const newPanes = [prev[0], { tabs: [newTab], activeTabId: newTab.id }]
        setSplitMode(true)
        save(newPanes, 0)
        return newPanes
      }
    })
  }, [save])

  const focusPane = useCallback((paneIndex) => {
    if (activePaneIndexRef.current === paneIndex) return
    setActivePaneIndex(paneIndex)
    // activePaneIndex 변경도 저장
    save(panesRef.current, paneIndex)
  }, [save])

  // focusPane에서 panesRef 필요
  const panesRef = useRef(panes)
  useEffect(() => { panesRef.current = panes }, [panes])

  return {
    panes,
    splitMode,
    activePaneIndex,
    activeTab,
    activeTabId,
    initialized,
    addTab,
    removeTab,
    switchTab,
    updateActiveTab,
    toggleSplit,
    focusPane,
  }
}
