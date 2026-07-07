// 역할 배치 버전(roster_templates) ↔ 요일/날짜 매핑 훅. 보드별(roster_template_schedule).
// 버전은 요일 무관 — 이 훅이 "어느 요일/날짜에 어느 버전을 쓸지"를 담당.
//   - weekday('월'..'일'): 요일 기본 버전
//   - work_date('YYYY-MM-DD'): 특정 날짜 오버라이드(공휴일 등)
// 해석 우선순위: 날짜 오버라이드 > 요일 기본 > 없음.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, logError } from '@thinkmap/core'
import { weekdayKo } from './useRosterTemplates'

export function useRosterSchedule(boardId) {
  const [rows, setRows] = useState([])
  const [loaded, setLoaded] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!boardId) { setRows([]); setLoaded(true); return }
    const { data, error } = await supabase
      .from('roster_template_schedule')
      .select('*')
      .eq('board_id', boardId)
    if (error) logError('useRosterSchedule.refetch', error)
    if (mountedRef.current) { setRows(data || []); setLoaded(true) }
  }, [boardId])

  useEffect(() => { refetch() }, [refetch])

  // 요일 → template_id 맵 (요일 기본만)
  const weekdayMap = useMemo(() => {
    const m = {}
    for (const r of rows) if (r.weekday && !r.work_date) m[r.weekday] = r.template_id
    return m
  }, [rows])

  // 날짜 → template_id 맵 (오버라이드만)
  const dateMap = useMemo(() => {
    const m = {}
    for (const r of rows) if (r.work_date && !r.weekday) m[r.work_date] = r.template_id
    return m
  }, [rows])

  // 그날 적용 버전 해석. { id, source } — source: 'date' | 'weekday' | null
  const resolve = useCallback((dateStr) => {
    if (!dateStr) return { id: null, source: null }
    if (dateMap[dateStr]) return { id: dateMap[dateStr], source: 'date' }
    const wd = weekdayKo(dateStr)
    if (wd && weekdayMap[wd]) return { id: weekdayMap[wd], source: 'weekday' }
    return { id: null, source: null }
  }, [dateMap, weekdayMap])

  // 요일 기본 버전 지정/해제. templateId=null → 해제(삭제).
  const setWeekday = useCallback(async (weekday, templateId) => {
    if (!boardId) return { error: new Error('보드 없음') }
    const del = await supabase.from('roster_template_schedule')
      .delete().eq('board_id', boardId).eq('weekday', weekday).is('work_date', null)
    if (del.error) { logError('useRosterSchedule.setWeekday.del', del.error); return { error: del.error } }
    if (templateId) {
      const { error } = await supabase.from('roster_template_schedule')
        .insert({ board_id: boardId, weekday, template_id: templateId })
      if (error) { logError('useRosterSchedule.setWeekday.ins', error); return { error } }
    }
    await refetch()
    return {}
  }, [boardId, refetch])

  // 날짜 오버라이드 지정/해제. templateId=null → 해제(삭제).
  const setDate = useCallback(async (dateStr, templateId) => {
    if (!boardId || !dateStr) return { error: new Error('보드/날짜 없음') }
    const del = await supabase.from('roster_template_schedule')
      .delete().eq('board_id', boardId).eq('work_date', dateStr).is('weekday', null)
    if (del.error) { logError('useRosterSchedule.setDate.del', del.error); return { error: del.error } }
    if (templateId) {
      const { error } = await supabase.from('roster_template_schedule')
        .insert({ board_id: boardId, work_date: dateStr, template_id: templateId })
      if (error) { logError('useRosterSchedule.setDate.ins', error); return { error } }
    }
    await refetch()
    return {}
  }, [boardId, refetch])

  return { rows, loaded, weekdayMap, dateMap, resolve, setWeekday, setDate, refetch }
}
