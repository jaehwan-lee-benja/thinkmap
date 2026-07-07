// 캔버스 매핑 조회 훅 (canvas_mappings)
// 관련: docs/MARKETING-CANVAS-MAPPING-PLAN.md §4-5
//
// 책임:
//   - target_page_id 의 살아있는 매핑들 조회
//   - region_key 별로 그룹핑하여 byRegion 맵 제공
//   - source 토글/페이지의 표시 텍스트(title) 도 함께 가져옴
//
// 호출:
//   const { mappings, byRegion, loading, error, refresh } = useCanvasMappings(pageId)

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase, logError } from '@thinkmap/core'

export function useCanvasMappings(targetPageId) {
  const [mappings, setMappings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refresh = useCallback(async () => {
    if (!targetPageId) {
      setMappings([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('canvas_mappings')
        .select('*')
        .eq('target_page_id', targetPageId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (!mountedRef.current) return
      if (fetchError) throw fetchError
      setMappings(data || [])
    } catch (err) {
      logError('useCanvasMappings.refresh', err)
      if (mountedRef.current) setError(err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [targetPageId])

  useEffect(() => { refresh() }, [refresh])

  // region_key 별 그룹핑
  const byRegion = useMemo(() => {
    const grouped = {}
    for (const m of mappings) {
      const key = m.region_key
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(m)
    }
    return grouped
  }, [mappings])

  return { mappings, byRegion, loading, error, refresh }
}
