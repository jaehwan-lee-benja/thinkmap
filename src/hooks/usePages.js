import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { supabase, generateUUID, logError } from '@thinkmap/core'
import {
  isNormalPage, isCalendarPage, isDailyPage,
  INDEPENDENT_PAGE_TYPES, MASTER_ONLY_PAGE_TYPES,
} from '../utils/pageTypes'

// 페이지 정렬 비교자 — position 우선, 동률 시 created_at·id 로 비결정성 제거.
// (position 은 형제 그룹별로 매겨져 프로젝트 전체에서 유일하지 않음 → tiebreak 필수)
const comparePages = (a, b) =>
  (a.position ?? 0) - (b.position ?? 0)
  || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  || String(a.id ?? '').localeCompare(String(b.id ?? ''))

// "갈 곳을 잃었을 때"(저장된 페이지를 못 찾음 / 저장값 없음)의 fallback 기본 페이지.
// 임의의 data[0](= position 최소, 동률 시 비결정적) 대신 의미 있는 페이지를 결정적으로 선택:
//   1순위 최상위(parent_id 없는) 일반 페이지 → 2순위 중첩 포함 일반 페이지
//   → 3순위 그 외(업무일지·캘린더 등 특수 타입). 모든 단계에서 comparePages 로 결정적.
const pickDefaultPageId = (list) => {
  if (!list || list.length === 0) return null
  const topNormal = list.filter(p => !p.parent_id && isNormalPage(p)).sort(comparePages)
  if (topNormal.length) return topNormal[0].id
  const anyNormal = list.filter(isNormalPage).sort(comparePages)
  if (anyNormal.length) return anyNormal[0].id
  return [...list].sort(comparePages)[0].id
}

/**
 * 플랫 페이지 배열을 트리 구조로 변환
 * @param {Array} pages - 플랫 페이지 배열
 * @returns {Array} - 트리 구조 페이지 배열 (각 노드에 children 포함)
 */
const buildPageTree = (pages, isMaster = true) => {
  const pageMap = {}
  const tree = []

  // calendar/daily 페이지는 사이드바 페이지 목록에서 제외 (고정 업무일지 버튼으로만 접근)
  // 마케팅 캔버스(frame/engine) + 급여(payroll)는 마스터에게만 트리에 노출
  const visiblePages = pages.filter(p => {
    if (isCalendarPage(p) || isDailyPage(p)) return false
    if (!isMaster && MASTER_ONLY_PAGE_TYPES.includes(p.page_type)) return false
    return true
  })

  // 1단계: 모든 페이지를 맵에 등록 (children 배열 추가)
  visiblePages.forEach(page => {
    pageMap[page.id] = { ...page, children: [] }
  })

  // 2단계: 부모-자식 관계 설정
  visiblePages.forEach(page => {
    const node = pageMap[page.id]
    if (page.parent_id && pageMap[page.parent_id]) {
      pageMap[page.parent_id].children.push(node)
    } else {
      // parent_id가 없거나 부모가 존재하지 않으면 최상위
      tree.push(node)
    }
  })

  // position 기준 정렬 (동률 시 created_at·id tiebreak — 사이드바 순서 비결정성 제거)
  tree.sort(comparePages)
  Object.values(pageMap).forEach(node => {
    if (node.children.length > 1) {
      node.children.sort(comparePages)
    }
  })

  return tree
}

/**
 * 특정 페이지의 모든 자손 ID를 수집
 * @param {string} pageId - 대상 페이지 ID
 * @param {Array} pages - 플랫 페이지 배열
 * @returns {Array} - 자손 페이지 ID 배열
 */
const getDescendantIds = (pageId, pages) => {
  const descendants = []
  const findChildren = (parentId) => {
    pages.forEach(p => {
      if (p.parent_id === parentId) {
        descendants.push(p.id)
        findChildren(p.id)
      }
    })
  }
  findChildren(pageId)
  return descendants
}

/**
 * 페이지 관리 훅 (특정 프로젝트 내의 페이지 관리)
 * @param {Object} session - Supabase 세션
 * @param {string} currentProjectId - 현재 프로젝트 ID
 * @param {Object} options - 옵션
 * @param {string} options.initialPageId - 초기 페이지 ID (Supabase에서 가져온 마지막 페이지)
 * @param {Function} options.onPageChange - 페이지 변경 시 콜백 (Supabase 저장용)
 */
export const usePages = (session, currentProjectId, options = {}) => {
  const { initialPageId = null, noAutoPage = false, onPageChange, preferencesLoaded = true, isImpersonating = false } = options
  const [pages, setPages] = useState([])
  const [currentPageId, setCurrentPageId] = useState(null)
  const [pagesLoading, setPagesLoading] = useState(true)

  // 이전 프로젝트 ID 추적 (프로젝트 변경 감지용)
  const prevProjectIdRef = useRef(null)
  // 이전 사용자 ID 추적 (임퍼소네이션 변경 감지용)
  const prevUserIdRef = useRef(null)
  // 초기 로드 완료 여부
  const initialLoadDoneRef = useRef(false)
  // fetch 무효화용 카운터 (경쟁 조건 방지 — 오래된 응답 무시)
  const fetchCountRef = useRef(0)
  // initialPageId를 항상 최신값으로 유지 (클로저 stale 방지)
  const initialPageIdRef = useRef(initialPageId)
  useLayoutEffect(() => {
    initialPageIdRef.current = initialPageId
  }, [initialPageId])

  // 트리 구조로 변환 (메모이제이션)
  const pageTree = useMemo(() => buildPageTree(pages, options.isMaster), [pages, options.isMaster])

  // 페이지 선택 (콜백 호출 포함)
  const selectPage = useCallback((pageId) => {
    setCurrentPageId(pageId)
    if (onPageChange && pageId) {
      onPageChange(pageId)
    }
  }, [onPageChange])

  // 페이지 목록 로드 (현재 프로젝트 + 업무일지)
  const fetchPages = useCallback(async () => {
    if (!session?.user?.id) return

    const myFetchId = ++fetchCountRef.current

    try {
      setPagesLoading(true)

      // 독립 엔티티 페이지 (project_id=NULL) — 업무일지 + 마케팅 캔버스 + 캘린더 + 급여
      const worklogQuery = supabase
        .from('pages')
        .select('*')
        .is('project_id', null)
        .in('page_type', INDEPENDENT_PAGE_TYPES)
        .is('deleted_at', null)
        .order('position', { ascending: true })

      // 프로젝트 소속 페이지 (독립 엔티티는 제외)
      const projectQuery = currentProjectId
        ? supabase
            .from('pages')
            .select('*')
            .eq('project_id', currentProjectId)
            .not('page_type', 'in', `(${INDEPENDENT_PAGE_TYPES.map(t => `"${t}"`).join(',')})`)
            .is('deleted_at', null)
            .order('position', { ascending: true })
        : Promise.resolve({ data: [], error: null })

      const [projectResult, worklogResult] = await Promise.all([projectQuery, worklogQuery])

      const error = projectResult.error || worklogResult.error
      // 중복 제거 (calendar/daily가 양쪽 쿼리에 걸릴 수 있음)
      const merged = [
        ...(projectResult.data || []),
        ...(worklogResult.data || []),
      ]
      const seen = new Set()
      const data = merged.filter(p => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return true
      })

      // 더 최신 fetch가 시작됐으면 이 응답은 무시 (경쟁 조건 방지)
      if (myFetchId !== fetchCountRef.current) return

      if (logError('페이지 로드', error)) return

      if (!data || data.length === 0) {
        if (isImpersonating) {
          // 임퍼소네이션 중에는 기본 페이지를 생성하지 않음
          setPages([])
        } else {
          await createDefaultPage()
        }
      } else {
        setPages(data)
        // 초기 선택이 필요한 경우에만 (ref로 stale closure 방지)
        if (!initialLoadDoneRef.current && data.length > 0) {
          const savedPageId = initialPageIdRef.current
          const targetPage = savedPageId
            ? data.find(p => p.id === savedPageId)
            : null
          if (noAutoPage && !targetPage) {
            // 자동 선택 방지 (분할뷰 새 패널 등)
            initialLoadDoneRef.current = true
          } else {
            const targetPageId = targetPage ? targetPage.id : pickDefaultPageId(data)
            setCurrentPageId(targetPageId)
            initialLoadDoneRef.current = true
            // 저장된 값으로 복원할 때는 콜백 호출하지 않음
            if (!targetPage && onPageChange) {
              onPageChange(targetPageId)
            }
          }
        }
      }
    } catch (error) {
      console.error('페이지 로드 오류:', error.message)
    } finally {
      if (myFetchId === fetchCountRef.current) setPagesLoading(false)
    }
  }, [session?.user?.id, currentProjectId, onPageChange])

  // 기본 페이지 생성
  const createDefaultPage = async () => {
    if (!session?.user?.id || !currentProjectId) return

    try {
      const newPage = {
        id: generateUUID(),
        user_id: session.user.id,
        project_id: currentProjectId,
        name: 'Main',
        position: 0,
        parent_id: null,
      }

      const { error } = await supabase
        .from('pages')
        .insert([newPage])

      if (logError('기본 페이지 생성', error)) return

      setPages([newPage])
      setCurrentPageId(newPage.id)
      if (onPageChange) {
        onPageChange(newPage.id)
      }
    } catch (error) {
      logError('기본 페이지 생성', error)
    }
  }

  // 새 페이지 생성 (parentId 지원, 양식 content 지원, extraFields로 page_type/page_date 등 추가 필드 전달)
  const createPage = async (name = 'Untitled', parentId = null, contentTiptap = null, extraFields = {}) => {
    // calendar/daily 페이지는 project_id=null 허용
    const isWorklogPage = isCalendarPage(extraFields) || isDailyPage(extraFields)
    if (!session?.user?.id || (!currentProjectId && !isWorklogPage)) return null

    try {
      // 같은 parent를 가진 형제 페이지 수 기반으로 position 결정
      const siblings = pages.filter(p => p.parent_id === parentId)
      const newPage = {
        id: generateUUID(),
        user_id: session.user.id,
        project_id: currentProjectId,
        name,
        position: siblings.length,
        parent_id: parentId,
        ...(contentTiptap ? { content_tiptap: contentTiptap } : {}),
        ...extraFields,
      }

      const { error } = await supabase
        .from('pages')
        .insert([newPage])

      if (logError('페이지 생성', error)) return null

      setPages(prev => [...prev, newPage])
      return newPage
    } catch (error) {
      logError('페이지 생성', error)
      return null
    }
  }

  // 페이지 이름 변경
  const renamePage = async (pageId, newName) => {
    if (!session?.user?.id || !newName.trim()) return false

    try {
      const { error } = await supabase
        .from('pages')
        .update({ name: newName.trim(), updated_at: new Date().toISOString() })
        .eq('id', pageId)

      if (logError('페이지 이름 변경', error)) return false

      setPages(pages.map(p =>
        p.id === pageId ? { ...p, name: newName.trim() } : p
      ))
      return true
    } catch (error) {
      logError('페이지 이름 변경', error)
      return false
    }
  }

  const updatePageIcon = async (pageId, icon) => {
    if (!session?.user?.id) return false
    try {
      const { error } = await supabase
        .from('pages')
        .update({ icon: icon || null, updated_at: new Date().toISOString() })
        .eq('id', pageId)

      if (logError('페이지 아이콘 변경', error)) return false

      setPages(pages.map(p =>
        p.id === pageId ? { ...p, icon: icon || null } : p
      ))
      return true
    } catch (error) {
      logError('페이지 아이콘 변경', error)
      return false
    }
  }

  // undo용 삭제 정보 ref + 타이머 (undo 유효 시간)
  const pendingDeleteRef = useRef(null)
  const undoTimerRef = useRef(null)

  // 페이지 삭제 (soft-delete: deleted_at 타임스탬프 기록)
  const deletePage = async (pageId) => {
    if (!session?.user?.id) return false

    // 최상위 페이지 수 확인 (마지막 최상위 페이지는 삭제 불가)
    const rootPages = pages.filter(p => !p.parent_id)
    const targetPage = pages.find(p => p.id === pageId)
    if (!targetPage) return false

    // 삭제 대상이 최상위 페이지이고 최상위가 하나뿐이면 삭제 불가
    if (!targetPage.parent_id && rootPages.length <= 1) {
      console.warn('마지막 최상위 페이지는 삭제할 수 없습니다.')
      return false
    }

    // 자손 ID 수집
    const descendantIds = getDescendantIds(pageId, pages)
    const idsToRemove = new Set([pageId, ...descendantIds])
    const removedPages = pages.filter(p => idsToRemove.has(p.id))
    const updatedPages = pages.filter(p => !idsToRemove.has(p.id))

    // 로컬 상태에서 즉시 제거
    setPages(updatedPages)

    // 삭제된 페이지(또는 자손)가 현재 페이지였다면 의미 있는 기본 페이지로 전환
    const prevPageId = currentPageId
    if (idsToRemove.has(currentPageId) && updatedPages.length > 0) {
      const nextId = pickDefaultPageId(updatedPages)
      if (nextId) selectPage(nextId)
    }

    // DB soft-delete: deleted_at 타임스탬프 기록 (대상 + 자손 모두).
    // 실제 반영 여부를 검증한다 — RLS 가 일부 행(예: user_id 가 다른 자식)을 조용히
    // 건너뛰면 error 없이 부분/0 업데이트가 되어 "삭제됐다 되돌아옴" 증상이 난다.
    // 실패 시 낙관적 제거를 되돌리고 false 를 반환해 호출부가 성공으로 오인하지 않게 한다.
    const now = new Date().toISOString()
    const allIds = [pageId, ...descendantIds]
    const revertOptimistic = (err) => {
      logError('페이지 삭제', err)
      setPages(prev => {
        const existing = new Set(prev.map(p => p.id))
        const restore = removedPages.filter(p => !existing.has(p.id))
        return [...prev, ...restore].sort(comparePages)
      })
      if (prevPageId) selectPage(prevPageId)
    }
    try {
      const { data: deletedRows, error } = await supabase
        .from('pages')
        .update({ deleted_at: now })
        .in('id', allIds)
        .select('id')
      const okCount = deletedRows?.length || 0
      if (error || okCount < allIds.length) {
        revertOptimistic(error || new Error(`삭제 권한 없음/부분 실패 (${okCount}/${allIds.length})`))
        return false
      }
    } catch (error) {
      revertOptimistic(error)
      return false
    }

    // 이전 undo 타이머가 있으면 제거
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
    }

    // undo 정보 저장 (5초간 유효)
    pendingDeleteRef.current = {
      removedPages,
      prevPageId,
      pageName: targetPage.name,
    }
    undoTimerRef.current = setTimeout(() => {
      pendingDeleteRef.current = null
      undoTimerRef.current = null
    }, 5000)

    return targetPage.name
  }

  // 삭제 취소 (undo — soft-delete 해제: deleted_at = null)
  const undoDeletePage = useCallback(async () => {
    if (!pendingDeleteRef.current) return false

    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }

    const { removedPages, prevPageId } = pendingDeleteRef.current
    pendingDeleteRef.current = null

    // DB에서 deleted_at 해제
    const ids = removedPages.map(p => p.id)
    try {
      const { error } = await supabase
        .from('pages')
        .update({ deleted_at: null })
        .in('id', ids)
      if (error) logError('페이지 복원', error)
    } catch (error) {
      logError('페이지 복원', error)
    }

    // 로컬 상태 복원
    setPages(prev => {
      const existingIds = new Set(prev.map(p => p.id))
      const toRestore = removedPages.filter(p => !existingIds.has(p.id))
      return [...prev, ...toRestore].sort((a, b) => a.position - b.position)
    })

    // 이전 페이지로 복원
    if (prevPageId) {
      selectPage(prevPageId)
    }

    return true
  }, [selectPage])

  // 특정 페이지의 자손 수 반환 (삭제 경고 메시지용)
  const getDescendantCount = useCallback((pageId) => {
    return getDescendantIds(pageId, pages).length
  }, [pages])

  // 페이지 순서 변경 (position + parent_id)
  const reorderPages = async (newPages) => {
    if (!session?.user?.id) return false

    try {
      // 변경된 페이지만 업데이트
      const now = new Date().toISOString()
      for (const newPage of newPages) {
        const oldPage = pages.find(p => p.id === newPage.id)
        if (!oldPage) continue
        if (oldPage.position === newPage.position && oldPage.parent_id === newPage.parent_id) continue

        const { error } = await supabase
          .from('pages')
          .update({ position: newPage.position, parent_id: newPage.parent_id || null, updated_at: now })
          .eq('id', newPage.id)

        if (error) throw error
      }

      setPages(newPages)
      return true
    } catch (error) {
      logError('페이지 순서 변경', error)
      return false
    }
  }

  // 세션 또는 프로젝트 변경 시 페이지 로드 (환경설정 로드 완료 후에만 실행)
  useEffect(() => {
    if (session?.user?.id && currentProjectId) {
      if (!preferencesLoaded) {
        setPagesLoading(true)
        return
      }

      const userChanged = prevUserIdRef.current !== null &&
                          prevUserIdRef.current !== session.user.id
      const projectChanged = prevProjectIdRef.current !== null &&
                             prevProjectIdRef.current !== currentProjectId

      if (userChanged || projectChanged) {
        setCurrentPageId(null)
        initialLoadDoneRef.current = false
        fetchCountRef.current++  // 진행 중인 fetch 무효화
      }

      // 유저가 바뀐 직후에는 currentProjectId가 아직 이전 유저의 것일 수 있음.
      // 즉시 fetch하면 이전 유저의 페이지가 로드됨 → useProjects가 새 projectId를
      // 확정할 때까지 대기 (prevProjectIdRef 미갱신으로 다음 실행에서 projectChanged 보장)
      if (userChanged) {
        prevUserIdRef.current = session.user.id
        return
      }

      prevUserIdRef.current = session.user.id
      prevProjectIdRef.current = currentProjectId
      fetchPages()
    } else {
      setPages([])
      setCurrentPageId(null)
      setPagesLoading(false)
      prevProjectIdRef.current = null
      prevUserIdRef.current = null
      initialLoadDoneRef.current = false
      fetchCountRef.current++  // 진행 중인 fetch 무효화
    }
  }, [session?.user?.id, currentProjectId, preferencesLoaded])

  // 외부에서 페이지 갱신 요청 (App.jsx의 "오늘" 버튼 등)
  useEffect(() => {
    const handler = () => fetchPages()
    window.addEventListener('pages-refresh', handler)
    return () => window.removeEventListener('pages-refresh', handler)
  }, [fetchPages])

  return {
    pages,
    pageTree,
    currentPageId,
    setCurrentPageId: selectPage,
    pagesLoading,
    fetchPages,
    createPage,
    renamePage,
    updatePageIcon,
    deletePage,
    undoDeletePage,
    reorderPages,
    getDescendantCount,
  }
}
