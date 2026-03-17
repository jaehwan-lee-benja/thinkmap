import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { generateUUID } from '../utils/uuid'
import { logError } from '../utils/supabaseError'

/**
 * 플랫 페이지 배열을 트리 구조로 변환
 * @param {Array} pages - 플랫 페이지 배열
 * @returns {Array} - 트리 구조 페이지 배열 (각 노드에 children 포함)
 */
const buildPageTree = (pages) => {
  const pageMap = {}
  const tree = []

  // 1단계: 모든 페이지를 맵에 등록 (children 배열 추가)
  pages.forEach(page => {
    pageMap[page.id] = { ...page, children: [] }
  })

  // 2단계: 부모-자식 관계 설정
  pages.forEach(page => {
    const node = pageMap[page.id]
    if (page.parent_id && pageMap[page.parent_id]) {
      pageMap[page.parent_id].children.push(node)
    } else {
      // parent_id가 없거나 부모가 존재하지 않으면 최상위
      tree.push(node)
    }
  })

  // position 기준 정렬
  tree.sort((a, b) => a.position - b.position)
  Object.values(pageMap).forEach(node => {
    if (node.children.length > 1) {
      node.children.sort((a, b) => a.position - b.position)
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
  const { initialPageId = null, onPageChange, preferencesLoaded = true, isImpersonating = false } = options
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
  const pageTree = useMemo(() => buildPageTree(pages), [pages])

  // 페이지 선택 (콜백 호출 포함)
  const selectPage = useCallback((pageId) => {
    setCurrentPageId(pageId)
    if (onPageChange && pageId) {
      onPageChange(pageId)
    }
  }, [onPageChange])

  // 페이지 목록 로드 (현재 프로젝트)
  const fetchPages = useCallback(async () => {
    if (!session?.user?.id || !currentProjectId) return

    const myFetchId = ++fetchCountRef.current

    try {
      setPagesLoading(true)

      // RLS 정책이 공유된 페이지도 허용하므로 user_id 필터 제거
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('project_id', currentProjectId)
        .order('position', { ascending: true })

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
          const targetPageId = targetPage ? targetPage.id : data[0].id
          setCurrentPageId(targetPageId)
          initialLoadDoneRef.current = true
          // 저장된 값으로 복원할 때는 콜백 호출하지 않음
          if (!targetPage && onPageChange) {
            onPageChange(targetPageId)
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

  // 새 페이지 생성 (parentId 지원, 양식 content 지원)
  const createPage = async (name = 'Untitled', parentId = null, contentTiptap = null) => {
    if (!session?.user?.id || !currentProjectId) return null

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
        .eq('user_id', session.user.id)

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

  // 삭제 예약 타이머 ref
  const deleteTimerRef = useRef(null)
  const pendingDeleteRef = useRef(null)

  // 페이지 삭제 (자손 페이지도 함께 삭제 — DB 삭제는 지연)
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

    // 이전 대기 중인 삭제가 있으면 즉시 실행
    if (deleteTimerRef.current && pendingDeleteRef.current) {
      clearTimeout(deleteTimerRef.current)
      const prev = pendingDeleteRef.current
      supabase.from('pages').delete().eq('id', prev.pageId).eq('user_id', session.user.id)
      deleteTimerRef.current = null
      pendingDeleteRef.current = null
    }

    // 자손 ID 수집 (로컬 상태에서도 제거)
    const descendantIds = getDescendantIds(pageId, pages)
    const idsToRemove = new Set([pageId, ...descendantIds])
    const removedPages = pages.filter(p => idsToRemove.has(p.id))
    const updatedPages = pages.filter(p => !idsToRemove.has(p.id))
    setPages(updatedPages)

    // 삭제된 페이지(또는 자손)가 현재 페이지였다면 다른 페이지로 전환
    const prevPageId = currentPageId
    if (idsToRemove.has(currentPageId) && updatedPages.length > 0) {
      selectPage(updatedPages[0].id)
    }

    // 삭제 정보 저장 (undo용)
    pendingDeleteRef.current = {
      pageId,
      removedPages,
      prevPageId,
      pageName: targetPage.name,
    }

    // 5초 후 DB에서 실제 삭제
    deleteTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('pages')
          .delete()
          .eq('id', pageId)
          .eq('user_id', session.user.id)
        if (error) logError('페이지 삭제', error)
      } catch (error) {
        logError('페이지 삭제', error)
      }
      pendingDeleteRef.current = null
      deleteTimerRef.current = null
    }, 5000)

    return targetPage.name
  }

  // 삭제 취소 (undo)
  const undoDeletePage = useCallback(() => {
    if (!deleteTimerRef.current || !pendingDeleteRef.current) return false

    clearTimeout(deleteTimerRef.current)
    const { removedPages, prevPageId } = pendingDeleteRef.current

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

    pendingDeleteRef.current = null
    deleteTimerRef.current = null
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
          .eq('user_id', session.user.id)

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

  return {
    pages,
    pageTree,
    currentPageId,
    setCurrentPageId: selectPage,
    pagesLoading,
    fetchPages,
    createPage,
    renamePage,
    deletePage,
    undoDeletePage,
    reorderPages,
    getDescendantCount,
  }
}
