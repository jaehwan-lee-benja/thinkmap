// 날짜별 배치(roster_assignments) 로드 + CRUD 훅 — docs/MEMBER-SPEC.md §5.4 / §7.2.
//
// (board_id, work_date) 단위로 그 날의 배치 목록을 다룬다.
// SELECT: 로그인 사용자 공개. 쓰기: 마스터 OR 보드멤버 (RLS).

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@thinkmap/core'
import { logError } from '../utils/supabaseError'

/**
 * @param {string} boardId   업무일지 캘린더(보드) 페이지 id (daily 의 parent_id)
 * @param {string} workDate  'YYYY-MM-DD'
 * @param {string} pageId    해당 daily 페이지 id (선택, 스냅샷 귀속용)
 */
export function useRoster(boardId, workDate, pageId = null) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!boardId || !workDate) { setRows([]); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('roster_assignments')
        .select('*')
        .eq('board_id', boardId)
        .eq('work_date', workDate)
        .is('deleted_at', null)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      if (mountedRef.current) setRows(data || [])
    } catch (err) {
      logError('useRoster.refetch', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [boardId, workDate])

  useEffect(() => { refetch() }, [refetch])

  const addAssignment = useCallback(async ({ memberId, memberName, role = null, shift = null, status = 'planned', note = null, createdBy = null }) => {
    if (!boardId || !workDate) return { error: new Error('보드/날짜 정보 없음') }
    if (!memberName) return { error: new Error('멤버 정보 없음') }
    const maxPos = rows.reduce((m, r) => Math.max(m, Number(r.position) || 0), 0)
    const row = {
      board_id: boardId,
      page_id: pageId,
      work_date: workDate,
      member_id: memberId || null,
      member_name: memberName,
      role,
      shift,
      status,
      note,
      position: maxPos + 1,
      created_by: createdBy,
    }
    const { data, error } = await supabase.from('roster_assignments').insert(row).select().maybeSingle()
    if (error) logError('useRoster.addAssignment', error)
    else refetch()
    return { data, error }
  }, [boardId, workDate, pageId, rows, refetch])

  // 요일 기본 배치 일괄 삽입(한 번의 insert로 원자적). placements=[{member_id,member_name,role,shift,status}]
  const seedAssignments = useCallback(async (placements, createdBy = null) => {
    if (!boardId || !workDate || !placements?.length) return { error: null }
    const base = rows.reduce((m, r) => Math.max(m, Number(r.position) || 0), 0)
    const insertRows = placements
      .filter((p) => p.member_name)
      .map((p, i) => ({
        board_id: boardId, page_id: pageId, work_date: workDate,
        member_id: p.member_id || null, member_name: p.member_name,
        role: p.role ?? null, shift: p.shift ?? null, status: p.status || 'confirmed',
        position: base + i + 1, created_by: createdBy,
      }))
    if (!insertRows.length) return { error: null }
    const { error } = await supabase.from('roster_assignments').insert(insertRows)
    if (error) logError('useRoster.seedAssignments', error)
    else refetch()
    return { error }
  }, [boardId, workDate, pageId, rows, refetch])

  const updateAssignment = useCallback(async (id, patch) => {
    const { error } = await supabase.from('roster_assignments').update(patch).eq('id', id)
    if (error) logError('useRoster.updateAssignment', error)
    else refetch()
    return { error }
  }, [refetch])

  const removeAssignment = useCallback(async (id) => {
    const { error } = await supabase
      .from('roster_assignments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) logError('useRoster.removeAssignment', error)
    else refetch()
    return { error }
  }, [refetch])

  return { rows, loading, refetch, addAssignment, seedAssignments, updateAssignment, removeAssignment }
}

/**
 * 배치도 요약 카운트 — daily 진입 카드에서 "N명 배치" 표시용.
 * 가벼운 count 쿼리.
 */
export async function fetchRosterCount(boardId, workDate) {
  if (!boardId || !workDate) return 0
  const { count, error } = await supabase
    .from('roster_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .eq('work_date', workDate)
    .is('deleted_at', null)
  if (error) { logError('fetchRosterCount', error); return 0 }
  return count || 0
}
