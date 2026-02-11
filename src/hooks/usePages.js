import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'

/**
 * UUID 생성 함수 (브라우저 호환)
 */
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

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
  const { initialPageId = null, onPageChange } = options
  const [pages, setPages] = useState([])
  const [currentPageId, setCurrentPageId] = useState(null)
  const [pagesLoading, setPagesLoading] = useState(true)

  // 이전 프로젝트 ID 추적 (프로젝트 변경 감지용)
  const prevProjectIdRef = useRef(null)
  // 이전 사용자 ID 추적 (임퍼소네이션 변경 감지용)
  const prevUserIdRef = useRef(null)
  // 초기 로드 완료 여부
  const initialLoadDoneRef = useRef(false)

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

    try {
      setPagesLoading(true)

      // RLS 정책이 공유된 페이지도 허용하므로 user_id 필터 제거
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('project_id', currentProjectId)
        .order('position', { ascending: true })

      if (error) {
        console.error('페이지 로드 오류:', error.message)
        return
      }

      if (!data || data.length === 0) {
        // 페이지가 없으면 기본 페이지 생성
        await createDefaultPage()
      } else {
        setPages(data)
        // 현재 페이지가 설정되지 않았으면 초기값 또는 첫 번째 페이지 선택
        if (!currentPageId && data.length > 0) {
          // 초기 로드 시에만 initialPageId 사용
          const useInitialPage = !initialLoadDoneRef.current && initialPageId
          const targetPage = useInitialPage
            ? data.find(p => p.id === initialPageId)
            : null
          const targetPageId = targetPage ? targetPage.id : data[0].id
          setCurrentPageId(targetPageId)
          initialLoadDoneRef.current = true
          // 초기 로드 시에는 콜백 호출하지 않음 (이미 저장된 값이므로)
          if (!targetPage && onPageChange) {
            onPageChange(targetPageId)
          }
        }
      }
    } catch (error) {
      console.error('페이지 로드 오류:', error.message)
    } finally {
      setPagesLoading(false)
    }
  }, [session?.user?.id, currentProjectId, currentPageId, onPageChange])

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

      if (error) {
        console.error('기본 페이지 생성 오류:', error.message)
        return
      }

      setPages([newPage])
      setCurrentPageId(newPage.id)
      if (onPageChange) {
        onPageChange(newPage.id)
      }
    } catch (error) {
      console.error('기본 페이지 생성 오류:', error.message)
    }
  }

  // 새 페이지 생성 (parentId 지원)
  const createPage = async (name = 'Untitled', parentId = null) => {
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
      }

      const { error } = await supabase
        .from('pages')
        .insert([newPage])

      if (error) {
        console.error('페이지 생성 오류:', error.message)
        return null
      }

      setPages(prev => [...prev, newPage])
      return newPage
    } catch (error) {
      console.error('페이지 생성 오류:', error.message)
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

      if (error) {
        console.error('페이지 이름 변경 오류:', error.message)
        return false
      }

      setPages(pages.map(p =>
        p.id === pageId ? { ...p, name: newName.trim() } : p
      ))
      return true
    } catch (error) {
      console.error('페이지 이름 변경 오류:', error.message)
      return false
    }
  }

  // 페이지 삭제 (자손 페이지도 함께 삭제 — DB CASCADE)
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

    try {
      // DB CASCADE로 자손도 자동 삭제됨
      const { error } = await supabase
        .from('pages')
        .delete()
        .eq('id', pageId)
        .eq('user_id', session.user.id)

      if (error) {
        console.error('페이지 삭제 오류:', error.message)
        return false
      }

      // 자손 ID 수집 (로컬 상태에서도 제거)
      const descendantIds = getDescendantIds(pageId, pages)
      const idsToRemove = new Set([pageId, ...descendantIds])
      const updatedPages = pages.filter(p => !idsToRemove.has(p.id))
      setPages(updatedPages)

      // 삭제된 페이지(또는 자손)가 현재 페이지였다면 다른 페이지로 전환
      if (idsToRemove.has(currentPageId) && updatedPages.length > 0) {
        selectPage(updatedPages[0].id)
      }

      return true
    } catch (error) {
      console.error('페이지 삭제 오류:', error.message)
      return false
    }
  }

  // 특정 페이지의 자손 수 반환 (삭제 경고 메시지용)
  const getDescendantCount = useCallback((pageId) => {
    return getDescendantIds(pageId, pages).length
  }, [pages])

  // 페이지 순서 변경
  const reorderPages = async (newPages) => {
    if (!session?.user?.id) return false

    try {
      // 각 페이지의 position 업데이트
      const updates = newPages.map((page, index) => ({
        id: page.id,
        position: index,
        updated_at: new Date().toISOString()
      }))

      for (const update of updates) {
        const { error } = await supabase
          .from('pages')
          .update({ position: update.position, updated_at: update.updated_at })
          .eq('id', update.id)
          .eq('user_id', session.user.id)

        if (error) throw error
      }

      setPages(newPages)
      return true
    } catch (error) {
      console.error('페이지 순서 변경 오류:', error.message)
      return false
    }
  }

  // 세션 또는 프로젝트 변경 시 페이지 로드
  useEffect(() => {
    if (session?.user?.id && currentProjectId) {
      // 사용자가 변경되면 상태 리셋 (임퍼소네이션 등)
      const userChanged = prevUserIdRef.current !== null &&
                          prevUserIdRef.current !== session.user.id
      // 프로젝트가 실제로 변경된 경우에만 페이지 초기화
      const projectChanged = prevProjectIdRef.current !== null &&
                             prevProjectIdRef.current !== currentProjectId

      if (userChanged || projectChanged) {
        setCurrentPageId(null)
        initialLoadDoneRef.current = false
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
    }
  }, [session?.user?.id, currentProjectId])

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
    reorderPages,
    getDescendantCount,
  }
}
