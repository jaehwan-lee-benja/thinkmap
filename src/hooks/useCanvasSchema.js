// 캔버스 영역/노드 좌표 조회 훅 (canvas_schemas)
// 관련: docs/MARKETING-CANVAS-MAPPING-PLAN.md §4-3
//
// 책임:
//   - master_id + canvas_type + version 의 schema 1건 조회
//   - regions JSONB → region_key 룩업 맵 변환
//
// 호출:
//   const { schema, regions, regionMap, loading, error } =
//     useCanvasSchema(masterId, 'frame', 'v7.44')

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@thinkmap/core'
import { logError } from '../utils/supabaseError'

export function useCanvasSchema(masterId, canvasType, version = 'v7.44') {
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!masterId || !canvasType) {
      setSchema(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('canvas_schemas')
          .select('*')
          .eq('master_id', masterId)
          .eq('canvas_type', canvasType)
          .eq('version', version)
          .maybeSingle()
        if (cancelled || !mountedRef.current) return
        if (fetchError) throw fetchError
        setSchema(data)
      } catch (err) {
        logError('useCanvasSchema.fetch', err)
        if (!cancelled && mountedRef.current) setError(err)
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [masterId, canvasType, version])

  const regions = useMemo(() => schema?.regions || [], [schema])

  // region_key → region 룩업 맵
  const regionMap = useMemo(() => {
    const map = {}
    for (const region of regions) {
      map[region.key] = region
    }
    return map
  }, [regions])

  return { schema, regions, regionMap, loading, error }
}
