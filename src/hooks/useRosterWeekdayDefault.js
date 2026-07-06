// [DEPRECATED 2026-06-28] useRosterWeekdayPreset 로 격상됨(요일별 이름붙은 버전 + 별표).
//   더 이상 import 되지 않는다. 마이그(migrate-roster-weekday-preset.sql) 적용·검증 후 이 파일 삭제 가능.
// 요일 기본 배치(사람→역할) 훅 — 보드별(roster_weekday_default).
// "매주 ○요일엔 누가 어느 역할" 기본값. 그 요일 날짜를 빈 상태로 열면 RosterModal이 자동으로 깐다.
// roster_template_schedule(요일→역할카드 버전)과 별개. 그날 실제 배치는 roster_assignments(날짜별).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@thinkmap/core'
import { logError } from '../utils/supabaseError'

export function useRosterWeekdayDefault(boardId) {
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
      .from('roster_weekday_default')
      .select('*')
      .eq('board_id', boardId)
      .order('weekday', { ascending: true })
      .order('position', { ascending: true })
    if (error) logError('useRosterWeekdayDefault.refetch', error)
    if (mountedRef.current) { setRows(data || []); setLoaded(true) }
  }, [boardId])

  useEffect(() => { refetch() }, [refetch])

  // 요일 → 기본 배치 목록
  const byWeekday = useMemo(() => {
    const m = {}
    for (const r of rows) (m[r.weekday] ||= []).push(r)
    return m
  }, [rows])

  // 현재 배치를 그 요일 기본으로 저장(전체 교체). placements=[{member_id,member_name,role,shift,status}]
  const saveDefault = useCallback(async (weekday, placements) => {
    if (!boardId || !weekday) return { error: new Error('보드/요일 없음') }
    const del = await supabase.from('roster_weekday_default')
      .delete().eq('board_id', boardId).eq('weekday', weekday)
    if (del.error) { logError('useRosterWeekdayDefault.saveDefault.del', del.error); return { error: del.error } }
    const clean = (placements || []).filter((p) => p.member_name)
    if (clean.length) {
      const insertRows = clean.map((p, i) => ({
        board_id: boardId, weekday,
        member_id: p.member_id || null, member_name: p.member_name,
        role: p.role ?? null, shift: p.shift ?? null, status: p.status || 'confirmed',
        position: i,
      }))
      const { error } = await supabase.from('roster_weekday_default').insert(insertRows)
      if (error) { logError('useRosterWeekdayDefault.saveDefault.ins', error); return { error } }
    }
    await refetch()
    return {}
  }, [boardId, refetch])

  const clearDefault = useCallback(async (weekday) => {
    if (!boardId || !weekday) return { error: new Error('보드/요일 없음') }
    const { error } = await supabase.from('roster_weekday_default')
      .delete().eq('board_id', boardId).eq('weekday', weekday)
    if (error) logError('useRosterWeekdayDefault.clearDefault', error)
    else await refetch()
    return { error }
  }, [boardId, refetch])

  return { rows, loaded, byWeekday, saveDefault, clearDefault, refetch }
}
