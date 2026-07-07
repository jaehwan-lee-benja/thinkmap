import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, logError } from '@thinkmap/core'

/**
 * 캘린더 뷰용 배치 코멘트 수 조회 훅
 * 여러 daily 페이지의 코멘트 수를 한 번의 쿼리로 가져옴
 *
 * @param {object} session - Supabase 세션
 * @param {string[]} pageIds - daily 페이지 ID 배열
 * @returns {{ commentCounts: { [pageId]: { total, unresolved } }, loading: boolean }}
 */
export function useCalendarCommentCounts(session, pageIds) {
  const [commentCounts, setCommentCounts] = useState({})
  const [loading, setLoading] = useState(false)
  const prevIdsRef = useRef('')

  const fetchCounts = useCallback(async () => {
    if (!session?.user?.id || !pageIds || pageIds.length === 0) {
      setCommentCounts({})
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('worklog_comments')
        .select('page_id, resolved')
        .in('page_id', pageIds)

      if (logError('캘린더 코멘트 수 조회', error)) return

      const counts = {}
      ;(data || []).forEach(row => {
        if (!counts[row.page_id]) counts[row.page_id] = { total: 0, unresolved: 0 }
        counts[row.page_id].total++
        if (!row.resolved) counts[row.page_id].unresolved++
      })

      setCommentCounts(counts)
    } catch (error) {
      logError('캘린더 코멘트 수 조회', error)
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id, pageIds])

  useEffect(() => {
    const idsKey = pageIds?.join(',') || ''
    if (idsKey === prevIdsRef.current) return
    prevIdsRef.current = idsKey
    fetchCounts()
  }, [fetchCounts, pageIds])

  return { commentCounts, loading }
}
