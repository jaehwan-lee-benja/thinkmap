// 사용자의 daily_blocks 검색 훅 — 캔버스에서 "업무일지에서 가져오기" 용도
// 관련: docs/MARKETING-CANVAS-MAPPING-PLAN.md §5 (Step 9-B)
//
// 책임:
//   - query 문자열로 text_content ILIKE 검색
//   - 살아있는 row (deleted_at NULL) 만, 최근순
//   - 페이지 이름도 함께 (FK join)
//
// 호출:
//   const { results, loading, error } = useUserDailyBlocks(query, { limit })

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'

export function useUserDailyBlocks(query, { limit = 20 } = {}) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    const trimmed = (query || '').trim()

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        let q = supabase
          .from('daily_blocks')
          .select('block_id, page_id, text_content, created_at, pages(name, page_date)')
          .is('deleted_at', null)
          .not('text_content', 'is', null)
          .neq('text_content', '')
          .order('created_at', { ascending: false })
          .limit(limit)

        if (trimmed) {
          q = q.ilike('text_content', `%${trimmed}%`)
        }

        const { data, error: fetchError } = await q
        if (cancelled || !mountedRef.current) return
        if (fetchError) throw fetchError
        setResults(data || [])
      } catch (err) {
        logError('useUserDailyBlocks.fetch', err)
        if (!cancelled && mountedRef.current) setError(err)
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [query, limit])

  return { results, loading, error }
}
