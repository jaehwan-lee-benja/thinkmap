// 캔버스 페어 조회 훅 (canvas_pairs + frame/engine pages)
// 관련: docs/MARKETING-CANVAS-MAPPING-PLAN.md §4-2
//
// 책임:
//   - canvas_pairs 1건과 짝지어진 frame/engine pages 정보를 한 번에 조회
//   - pageId 또는 pairId 둘 중 하나로 lookup 가능
//
// 호출:
//   const { pair, framePage, enginePage, loading, error } =
//     useCanvasPair({ pageId })       // page 에서 페어 역추적
//   const { ... } = useCanvasPair({ pairId })   // 페어 ID 로 직접

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@thinkmap/core'
import { logError } from '../utils/supabaseError'

export function useCanvasPair({ pairId, pageId } = {}) {
  const [pair, setPair] = useState(null)
  const [framePage, setFramePage] = useState(null)
  const [enginePage, setEnginePage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!pairId && !pageId) {
      setPair(null)
      setFramePage(null)
      setEnginePage(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        // 1) 페어 row 조회
        let query = supabase
          .from('canvas_pairs')
          .select('*')
          .is('deleted_at', null)

        if (pairId) {
          query = query.eq('id', pairId)
        } else {
          query = query.or(`frame_page_id.eq.${pageId},engine_page_id.eq.${pageId}`)
        }

        const { data: pairData, error: pairErr } = await query.maybeSingle()
        if (cancelled || !mountedRef.current) return
        if (pairErr) throw pairErr
        if (!pairData) {
          setPair(null)
          setFramePage(null)
          setEnginePage(null)
          return
        }

        // 2) frame + engine pages 한 번에
        const { data: pages, error: pagesErr } = await supabase
          .from('pages')
          .select('*')
          .in('id', [pairData.frame_page_id, pairData.engine_page_id])
        if (cancelled || !mountedRef.current) return
        if (pagesErr) throw pagesErr

        setPair(pairData)
        setFramePage(pages.find(p => p.id === pairData.frame_page_id) || null)
        setEnginePage(pages.find(p => p.id === pairData.engine_page_id) || null)
      } catch (err) {
        logError('useCanvasPair.fetch', err)
        if (!cancelled && mountedRef.current) setError(err)
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [pairId, pageId])

  return { pair, framePage, enginePage, loading, error }
}
