// daily_blocks row CRUD + 실시간 구독 React 훅. WORKLOG-SPEC.md §3.7, §10 Phase v2.2.
//
// 책임:
//   - pageId 의 살아있는 daily_blocks row 를 fetch + 상태 보관
//   - applyDiff(BlockDiff) 로 INSERT/UPDATE/softDelete 발사
//   - Supabase Realtime 으로 다른 클라이언트의 변경 반영
//
// 훅은 row 만 다룬다. doc 변환은 호출자가 useMemo + blocksToDoc 로 처리.
// 순수 머지 로직은 utils/dailyBlockMerge.js (단위 테스트 분리).

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'
import {
  fetchBlocks,
  applyDiffToSupabase,
} from '../utils/dailyBlockOps.js'
import {
  mergeDiffLocal,
  applyRealtimeEvent,
} from '../utils/dailyBlockMerge.js'

export function useDailyBlocks(pageId) {
  const [blocks, setBlocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!pageId) {
      setBlocks([])
      return
    }
    setLoading(true)
    try {
      const rows = await fetchBlocks(supabase, pageId)
      if (mountedRef.current) {
        setBlocks(rows)
        setInitialLoaded(true)
      }
    } catch (err) {
      logError('useDailyBlocks.refetch', err)
      if (mountedRef.current) setError(err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [pageId])

  // pageId 가 바뀌면 initialLoaded 를 리셋 (새 페이지의 첫 fetch 까지 대기)
  useEffect(() => {
    setInitialLoaded(false)
  }, [pageId])

  useEffect(() => { refetch() }, [refetch])

  const applyDiff = useCallback(async (diff) => {
    if (!diff) return
    try {
      await applyDiffToSupabase(supabase, diff)
      if (mountedRef.current) {
        setBlocks(prev => mergeDiffLocal(prev, diff))
      }
    } catch (err) {
      logError('useDailyBlocks.applyDiff', err)
      if (mountedRef.current) setError(err)
      refetch()
      throw err
    }
  }, [refetch])

  // Realtime 구독
  useEffect(() => {
    if (!pageId) return
    const channel = supabase
      .channel(`daily_blocks:${pageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_blocks',
          filter: `page_id=eq.${pageId}`,
        },
        (payload) => {
          if (!mountedRef.current) return
          setBlocks(prev => applyRealtimeEvent(prev, payload))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [pageId])

  return { blocks, loading, error, applyDiff, refetch, initialLoaded }
}
