import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'

export const useFavorites = (session) => {
  const userId = session?.user?.id
  const [favorites, setFavorites] = useState([])
  const fetchCountRef = useRef(0)

  // Supabase에서 즐겨찾기 목록 불러오기
  useEffect(() => {
    if (!userId) {
      setFavorites([])
      return
    }

    const fetchFavorites = async () => {
      const myFetchId = ++fetchCountRef.current

      const { data, error } = await supabase
        .from('user_favorites')
        .select('*, pages:page_id(icon)')
        .eq('user_id', userId)
        .order('position', { ascending: true })

      if (myFetchId !== fetchCountRef.current) return
      if (logError('즐겨찾기 조회', error)) return

      setFavorites((data || []).map(row => ({
        id: row.id,
        pageId: row.page_id,
        projectId: row.project_id,
        pageName: row.page_name,
        projectName: row.project_name,
        pageIcon: row.pages?.icon || null,
      })))
    }

    fetchFavorites()
  }, [userId])

  const toggleFavorite = useCallback(async (pageId, projectId, pageName, projectName) => {
    if (!userId) return

    const exists = favorites.some(f => f.pageId === pageId)

    if (exists) {
      // 즐겨찾기 해제
      setFavorites(prev => prev.filter(f => f.pageId !== pageId))

      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('page_id', pageId)

      if (logError('즐겨찾기 해제', error)) {
        // 롤백
        setFavorites(prev => [...prev, { pageId, projectId, pageName, projectName }])
      }
    } else {
      // 즐겨찾기 추가
      const newFav = { pageId, projectId, pageName, projectName }
      setFavorites(prev => [...prev, newFav])

      const { data, error } = await supabase
        .from('user_favorites')
        .insert([{
          user_id: userId,
          page_id: pageId,
          project_id: projectId,
          page_name: pageName,
          project_name: projectName,
          position: favorites.length,
        }])
        .select()
        .single()

      if (logError('즐겨찾기 추가', error)) {
        // 롤백
        setFavorites(prev => prev.filter(f => f.pageId !== pageId))
      } else if (data) {
        // DB에서 반환된 id를 반영
        setFavorites(prev => prev.map(f =>
          f.pageId === pageId ? { ...f, id: data.id } : f
        ))
      }
    }
  }, [userId, favorites])

  const removeFavorite = useCallback(async (pageId) => {
    if (!userId) return

    const removed = favorites.find(f => f.pageId === pageId)
    setFavorites(prev => prev.filter(f => f.pageId !== pageId))

    const { error } = await supabase
      .from('user_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('page_id', pageId)

    if (logError('즐겨찾기 삭제', error) && removed) {
      // 롤백
      setFavorites(prev => [...prev, removed])
    }
  }, [userId, favorites])

  const isFavorite = useCallback((pageId) => {
    return favorites.some(f => f.pageId === pageId)
  }, [favorites])

  return { favorites, toggleFavorite, removeFavorite, isFavorite }
}
