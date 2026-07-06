import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@thinkmap/core'
import { logError } from '../utils/supabaseError'

/**
 * 캘린더 뷰용 배치 todo 통계 조회 훅 (v2 daily_blocks 기반).
 * 여러 daily 페이지의 todo 총개수/완료개수를 단일 쿼리로 가져옴.
 *
 * @param {object} session - Supabase 세션
 * @param {string[]} pageIds - daily 페이지 ID 배열
 * @returns {{ todoStats: { [pageId]: { total, completed } }, loading: boolean }}
 */
export function useCalendarTodoStats(session, pageIds) {
  const [todoStats, setTodoStats] = useState({})
  const [loading, setLoading] = useState(false)
  const prevIdsRef = useRef('')

  const fetchStats = useCallback(async () => {
    if (!session?.user?.id || !pageIds || pageIds.length === 0) {
      setTodoStats({})
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('daily_blocks')
        .select('page_id, is_todo, todo_checked')
        .in('page_id', pageIds)
        .eq('is_todo', true)
        .is('deleted_at', null)

      if (logError('캘린더 todo 통계 조회', error)) return

      const stats = {}
      ;(data || []).forEach(row => {
        if (!stats[row.page_id]) stats[row.page_id] = { total: 0, completed: 0 }
        stats[row.page_id].total++
        if (row.todo_checked) stats[row.page_id].completed++
      })

      setTodoStats(stats)
    } catch (error) {
      logError('캘린더 todo 통계 조회', error)
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id, pageIds])

  useEffect(() => {
    const idsKey = pageIds?.join(',') || ''
    if (idsKey === prevIdsRef.current) return
    prevIdsRef.current = idsKey
    fetchStats()
  }, [fetchStats, pageIds])

  return { todoStats, loading }
}
