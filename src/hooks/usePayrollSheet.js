import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * payroll_sheets 월별 명세서 로드/저장 (마스터 전용 RLS).
 * 한 payroll 페이지 아래 (page_id, pay_month) 1행. data(jsonb)에 전체 상태를 담는다.
 *
 * @param {string} pageId  payroll 페이지 id
 * @param {string} month   'YYYY-MM'
 */
export function usePayrollSheet(pageId, month) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [months, setMonths] = useState([])

  // 저장된 월 목록
  const refreshMonths = useCallback(async () => {
    if (!pageId) return
    const { data: rows, error } = await supabase
      .from('payroll_sheets')
      .select('pay_month')
      .eq('page_id', pageId)
      .order('pay_month', { ascending: false })
    if (!error) setMonths((rows || []).map(r => r.pay_month))
  }, [pageId])

  useEffect(() => { refreshMonths() }, [refreshMonths])

  // 해당 월 로드
  useEffect(() => {
    if (!pageId || !month) { setData(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      const { data: row, error } = await supabase
        .from('payroll_sheets')
        .select('data')
        .eq('page_id', pageId)
        .eq('pay_month', month)
        .maybeSingle()
      if (cancelled) return
      if (error) setError(error)
      setData(row?.data ?? null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [pageId, month])

  const save = useCallback(async (newData) => {
    if (!pageId || !month) return { error: new Error('페이지/월 정보 없음') }
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('payroll_sheets')
      .upsert(
        { page_id: pageId, pay_month: month, data: newData, updated_at: new Date().toISOString() },
        { onConflict: 'page_id,pay_month' }
      )
    setSaving(false)
    if (error) setError(error)
    else { setData(newData); refreshMonths() }
    return { error }
  }, [pageId, month, refreshMonths])

  return { data, loading, saving, error, save, months, refreshMonths }
}
