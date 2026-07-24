// CRM 운영 보드 — 지표 레인 데이터. CRM-BOARD-SPEC §3, §4, §8.
//
// crm_metrics(마스터 전용 RLS)를 기간이 걸치는 ym 로 읽는다(정본 복사 없음, 읽기만).
// 적재는 engine-metrics-sync Edge(서버사이드, 시크릿)가 담당 — sync() 로 트리거.
// 재무 숫자는 crm_metrics 에만 있고 브라우저는 로그인한 마스터만 읽는다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, logError } from '@thinkmap/core'
import { periodYms } from '../components/CrmBoard/crmBoardUtils'

/**
 * @param {Object} session
 * @param {'week'|'month'|'year'} period
 * @param {Date} anchor
 */
export function useCrmMetrics(session, period, anchor) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const yms = useMemo(
    () => periodYms(period, anchor),
    [period, anchor?.getTime?.() ?? anchor]
  )

  const refetch = useCallback(async () => {
    if (!yms.length) { setRows([]); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('crm_metrics')
        .select('ym, region_key, metric, value, extra, generated_month')
        .in('ym', yms)
        .order('ym', { ascending: true })
      if (err) throw err
      if (mountedRef.current) setRows(data || [])
    } catch (err) {
      logError('useCrmMetrics.refetch', err)
      if (mountedRef.current) setError(err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [yms.join(',')])

  useEffect(() => { refetch() }, [refetch])

  // 지표 새로고침 — Edge 가 crm endpoint 를 서버사이드 호출→crm_metrics upsert. 그 뒤 refetch.
  const sync = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.functions.invoke('engine-metrics-sync', {
        body: {},
      })
      if (err) throw err
      await refetch()
      return data
    } catch (err) {
      logError('useCrmMetrics.sync', err)
      if (mountedRef.current) setError(err)
      return null
    } finally {
      if (mountedRef.current) setSyncing(false)
    }
  }, [refetch])

  // 파생: region_key → 기간 내 { ym, value, extra, metric }[] (오름차순)
  const byRegion = useMemo(() => {
    const m = {}
    for (const r of rows) (m[r.region_key] ||= []).push(r)
    return m
  }, [rows])

  const latestYm = yms.length ? yms[yms.length - 1] : null
  const hasData = rows.length > 0

  return { rows, byRegion, yms, latestYm, hasData, loading, syncing, error, refetch, sync }
}
