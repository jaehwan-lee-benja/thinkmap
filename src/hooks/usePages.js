import { useState, useEffect } from 'react'
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
 */
export const usePages = (session, currentProjectId) => {
  const [pages, setPages] = useState([])
  const [currentPageId, setCurrentPageId] = useState(null)
  const [pagesLoading, setPagesLoading] = useState(true)

  // 페이지 목록 로드 (현재 프로젝트)
  const fetchPages = async () => {
    if (!session?.user?.id || !currentProjectId) return

    try {
      setPagesLoading(true)

      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('user_id', session.user.id)
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
        // 현재 페이지가 설정되지 않았으면 첫 번째 페이지 선택
        if (!currentPageId && data.length > 0) {
          setCurrentPageId(data[0].id)
        }
      }
    } catch (error) {
      console.error('페이지 로드 오류:', error.message)
    } finally {
      setPagesLoading(false)
    }
  }

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
        setCurrentPageId(updatedPages[0].id)
      }

      return true
    } catch (error) {
      console.error('페이지 삭제 오류:', error.message)
      return false
    }
  }

  // 페이지 순서 변경 (나중에 구현 가능)
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
      fetchPages()
    } else {
      setPages([])
      setCurrentPageId(null)
      setPagesLoading(false)
    }
  }, [session, currentProjectId])

  return {
    pages,
    currentPageId,
    setCurrentPageId,
    pagesLoading,
    fetchPages,
    createPage,
    renamePage,
    deletePage,
    reorderPages,
  }
}
