// 영역 진단 통계 훅 (canvas_region_stats VIEW)
// 관련: docs/MARKETING-CANVAS-MAPPING-PLAN.md §4-6, WIREFRAMES W3
//
// 책임:
//   - target_page_id 의 영역별 통계 조회
//   - region_key → stats 맵으로 가공
//
// 호출:
//   const { stats, byRegion, loading, error, refresh } =
//     useCanvasRegionStats(targetPageId)

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'

export function useCanvasRegionStats(targetPageId) {
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refresh = useCallback(async () => {
    if (!targetPageId) {
      setStats([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('canvas_region_stats')
        .select('*')
        .eq('target_page_id', targetPageId)
      if (!mountedRef.current) return
      if (fetchError) throw fetchError
      setStats(data || [])
    } catch (err) {
      logError('useCanvasRegionStats.refresh', err)
      if (mountedRef.current) setError(err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [targetPageId])

  useEffect(() => { refresh() }, [refresh])

  // region_key → stats 맵
  const byRegion = useMemo(() => {
    const map = {}
    for (const s of stats) {
      map[s.region_key] = s
    }
    return map
  }, [stats])

  return { stats, byRegion, loading, error, refresh }
}
