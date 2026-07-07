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
import { supabase, logError } from '@thinkmap/core'
import {
  fetchBlocks,
  applyDiffToSupabase,
} from '../utils/dailyBlockOps.js'
import {
  mergeDiffLocal,
  applyRealtimeEvent,
} from '../utils/dailyBlockMerge.js'
import {
  writeSnapshot,
  shouldSnapshot,
  MASS_DELETE_SOFT_THRESHOLD,
} from '../utils/dailyBlockSnapshot.js'

export function useDailyBlocks(pageId) {
  const [blocks, setBlocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const mountedRef = useRef(true)
  const lastSnapshotAtRef = useRef(0)        // 페이지별 throttle (pageId 바뀌면 리셋)

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

  // pageId 가 바뀌면 initialLoaded + 스냅샷 throttle 리셋
  useEffect(() => {
    setInitialLoaded(false)
    lastSnapshotAtRef.current = 0
  }, [pageId])

  useEffect(() => { refetch() }, [refetch])

  const applyDiff = useCallback(async (diff) => {
    if (!diff) return
    try {
      // 스냅샷 결정 — mass softDelete 직전이면 동기 await, 아니면 throttled fire-and-forget.
      const delCount = diff.softDelete?.length || 0
      const hasMassDelete = delCount >= MASS_DELETE_SOFT_THRESHOLD
      const need = shouldSnapshot({
        now: Date.now(),
        lastSnapshotAt: lastSnapshotAtRef.current,
        hasMassDelete,
      })
      if (need && blocks.length > 0) {
        const userId = blocks[0]?.userId
        const pageDate = blocks[0]?.pageDate
        if (userId && pageDate) {
          if (hasMassDelete) {
            // mandatory — 실패하면 진행 안 함. 데이터 보호 최우선.
            await writeSnapshot(supabase, {
              pageId, userId, pageDate, blocks, reason: 'mass_delete',
            })
          } else {
            // throttled — 실패해도 사용자 작업엔 영향 없음.
            writeSnapshot(supabase, {
              pageId, userId, pageDate, blocks, reason: 'change',
            }).catch(e => logError('useDailyBlocks.snapshot(change)', e))
          }
          lastSnapshotAtRef.current = Date.now()
        }
      }

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
  }, [refetch, blocks, pageId])

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
