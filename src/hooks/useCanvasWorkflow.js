// 사용자 정의 워크플로우 조회 훅 (canvas_workflows)
// 관련: docs/MARKETING-CANVAS-MAPPING-PLAN.md §4-4
//
// 책임:
//   - master_id 의 워크플로우 목록 조회 (is_default 우선)
//   - steps JSONB 를 status_key → {label, color} 룩업 맵으로 변환
//
// 호출:
//   const { workflows, defaultWorkflow, statusMap, loading, error } = useCanvasWorkflow(masterId)

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@thinkmap/core'
import { logError } from '../utils/supabaseError'

export function useCanvasWorkflow(masterId) {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!masterId) {
      setWorkflows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('canvas_workflows')
          .select('*')
          .eq('master_id', masterId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
        if (cancelled || !mountedRef.current) return
        if (fetchError) throw fetchError
        setWorkflows(data || [])
      } catch (err) {
        logError('useCanvasWorkflow.fetch', err)
        if (!cancelled && mountedRef.current) setError(err)
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [masterId])

  const defaultWorkflow = useMemo(
    () => workflows.find(w => w.is_default) || workflows[0] || null,
    [workflows]
  )

  // status_key (예: 'todo') → { label, color, order } 룩업 맵
  const statusMap = useMemo(() => {
    if (!defaultWorkflow?.steps) return {}
    const map = {}
    for (const step of defaultWorkflow.steps) {
      map[step.key] = step
    }
    return map
  }, [defaultWorkflow])

  return { workflows, defaultWorkflow, statusMap, loading, error }
}
