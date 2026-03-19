import { useState, useEffect, useCallback } from 'react'

const getStorageKey = (uid) => `thinkmap_favorites_${uid}`

export const useFavorites = (session) => {
  const userId = session?.user?.id
  const [favorites, setFavorites] = useState([])

  useEffect(() => {
    if (!userId) {
      setFavorites([])
      return
    }
    try {
      const stored = localStorage.getItem(getStorageKey(userId))
      setFavorites(stored ? JSON.parse(stored) : [])
    } catch {
      setFavorites([])
    }
  }, [userId])

  const persist = useCallback((newFavs) => {
    if (userId) localStorage.setItem(getStorageKey(userId), JSON.stringify(newFavs))
  }, [userId])

  const toggleFavorite = useCallback((pageId, projectId, pageName, projectName) => {
    if (!userId) return
    setFavorites(prev => {
      const exists = prev.some(f => f.pageId === pageId)
      const next = exists
        ? prev.filter(f => f.pageId !== pageId)
        : [...prev, { pageId, projectId, pageName, projectName }]
      persist(next)
      return next
    })
  }, [userId, persist])

  const removeFavorite = useCallback((pageId) => {
    if (!userId) return
    setFavorites(prev => {
      const next = prev.filter(f => f.pageId !== pageId)
      persist(next)
      return next
    })
  }, [userId, persist])

  const isFavorite = useCallback((pageId) => {
    return favorites.some(f => f.pageId === pageId)
  }, [favorites])

  return { favorites, toggleFavorite, removeFavorite, isFavorite }
}
