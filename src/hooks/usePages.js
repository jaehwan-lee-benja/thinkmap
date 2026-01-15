import { useState, useEffect, useCallback, useRef } from 'react'
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
  // 초기 로드 완료 여부
  const initialLoadDoneRef = useRef(false)

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

  // 새 페이지 생성
  const createPage = async (name = 'Untitled') => {
    if (!session?.user?.id || !currentProjectId) return null

    try {
      const newPage = {
        id: generateUUID(),
        user_id: session.user.id,
        project_id: currentProjectId,
        name,
        position: pages.length,
      }

      const { error } = await supabase
        .from('pages')
        .insert([newPage])

      if (error) {
        console.error('페이지 생성 오류:', error.message)
        return null
      }

      setPages([...pages, newPage])
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

  // 페이지 삭제
  const deletePage = async (pageId) => {
    if (!session?.user?.id) return false
    if (pages.length <= 1) {
      console.warn('마지막 페이지는 삭제할 수 없습니다.')
      return false
    }

    try {
      // CASCADE로 인해 해당 페이지의 모든 블록도 자동 삭제됨
      const { error } = await supabase
        .from('pages')
        .delete()
        .eq('id', pageId)
        .eq('user_id', session.user.id)

      if (error) {
        console.error('페이지 삭제 오류:', error.message)
        return false
      }

      const updatedPages = pages.filter(p => p.id !== pageId)
      setPages(updatedPages)

      // 삭제된 페이지가 현재 페이지였다면 다른 페이지로 전환
      if (currentPageId === pageId && updatedPages.length > 0) {
        selectPage(updatedPages[0].id)
      }

      return true
    } catch (error) {
      console.error('페이지 삭제 오류:', error.message)
      return false
    }
  }

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
      // 프로젝트가 실제로 변경된 경우에만 페이지 초기화
      const projectChanged = prevProjectIdRef.current !== null &&
                             prevProjectIdRef.current !== currentProjectId

      if (projectChanged) {
        setCurrentPageId(null)
        initialLoadDoneRef.current = false
      }

      prevProjectIdRef.current = currentProjectId
      fetchPages()
    } else {
      setPages([])
      setCurrentPageId(null)
      setPagesLoading(false)
      prevProjectIdRef.current = null
      initialLoadDoneRef.current = false
    }
  }, [session?.user?.id, currentProjectId])

  return {
    pages,
    currentPageId,
    setCurrentPageId: selectPage,
    pagesLoading,
    fetchPages,
    createPage,
    renamePage,
    deletePage,
    reorderPages,
  }
}
