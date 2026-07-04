// 요일별 인원배치 "버전"(roster_weekday_preset + _item) 로드 + CRUD 훅.
// PLAN-roster-visual-board.md §13. 한 요일에 이름붙은 여러 버전 + is_active(별표/주) 1개.
// 별표 버전이 빈 날짜 자동 시드 소스. (기존 useRosterWeekdayDefault 의 1개·무명 모델을 격상)
//
// 패턴은 useRosterTemplates(역할 레이아웃 버전 + is_default/markMaster)와 대칭이다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'

export function useRosterWeekdayPreset(boardId) {
  const [presets, setPresets] = useState([]) // [{...preset, items: [...]}]
  const [loaded, setLoaded] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!boardId) { setPresets([]); setLoaded(true); return }
    const { data, error } = await supabase
      .from('roster_weekday_preset')
      .select('*, roster_weekday_preset_item(*)')
      .eq('board_id', boardId)
      .is('deleted_at', null)
      .order('weekday', { ascending: true })
      .order('display_order', { ascending: true })
    if (error) logError('useRosterWeekdayPreset.refetch', error)
    const mapped = (data || []).map((p) => ({
      ...p,
      items: (p.roster_weekday_preset_item || []).filter((it) => !it.deleted_at).slice().sort((a, b) => a.position - b.position),
    }))
    if (mountedRef.current) { setPresets(mapped); setLoaded(true) }
  }, [boardId])

  useEffect(() => { refetch() }, [refetch])

  // 요일 → 버전 목록 (display_order 순)
  const byWeekday = useMemo(() => {
    const m = {}
    for (const p of presets) (m[p.weekday] ||= []).push(p)
    return m
  }, [presets])

  // 요일 → 활성(별표) 버전 — 빈 날짜 자동 시드 소스
  const activeByWeekday = useMemo(() => {
    const m = {}
    for (const p of presets) if (p.is_active) m[p.weekday] = p
    return m
  }, [presets])

  // 현재 배치를 새 버전으로 저장. placements=[{member_id,member_name,role,shift,status}]
  const createPreset = useCallback(async ({ weekday, name, placements = [], asActive = false, createdBy = null }) => {
    if (!boardId || !weekday) return { error: new Error('보드/요일 없음') }
    const { data: p, error } = await supabase
      .from('roster_weekday_preset')
      .insert({ board_id: boardId, weekday, name: name || '기본', created_by: createdBy })
      .select()
      .maybeSingle()
    if (error || !p) { logError('useRosterWeekdayPreset.createPreset', error); return { error } }
    const rows = (placements || []).filter((x) => x.member_name).map((x, i) => ({
      preset_id: p.id, member_id: x.member_id || null, member_name: x.member_name,
      role: x.role ?? null, shift: x.shift ?? null, status: x.status || 'confirmed', position: i,
    }))
    if (rows.length) {
      const { error: e2 } = await supabase.from('roster_weekday_preset_item').insert(rows)
      if (e2) logError('useRosterWeekdayPreset.createPreset.items', e2)
    }
    // 별표(주배치)로 만들 거면 원자 전환 RPC 사용(요일당 1개 유니크 안전).
    if (asActive) {
      const { error: e3 } = await supabase.rpc('roster_weekday_preset_set_active', { p_preset_id: p.id })
      if (e3) logError('useRosterWeekdayPreset.createPreset.active', e3)
    }
    await refetch()
    return { data: p }
  }, [boardId, refetch])

  // 버전의 인원 줄 전체 교체(현재 배치로 갱신) — 기존 줄 삭제 후 재삽입.
  const replaceItems = useCallback(async (presetId, placements) => {
    const del = await supabase.from('roster_weekday_preset_item').delete().eq('preset_id', presetId)
    if (del.error) { logError('useRosterWeekdayPreset.replaceItems.del', del.error); return { error: del.error } }
    const rows = (placements || []).filter((x) => x.member_name).map((x, i) => ({
      preset_id: presetId, member_id: x.member_id || null, member_name: x.member_name,
      role: x.role ?? null, shift: x.shift ?? null, status: x.status || 'confirmed', position: i,
    }))
    if (rows.length) {
      const { error } = await supabase.from('roster_weekday_preset_item').insert(rows)
      if (error) { logError('useRosterWeekdayPreset.replaceItems.ins', error); return { error } }
    }
    await refetch()
    return {}
  }, [refetch])

  const renamePreset = useCallback(async (presetId, patch) => {
    const { error } = await supabase.from('roster_weekday_preset').update(patch).eq('id', presetId)
    if (error) logError('useRosterWeekdayPreset.renamePreset', error)
    else await refetch()
    return { error }
  }, [refetch])

  const deletePreset = useCallback(async (presetId) => {
    const { error } = await supabase.from('roster_weekday_preset')
      .update({ deleted_at: new Date().toISOString() }).eq('id', presetId)
    if (error) logError('useRosterWeekdayPreset.deletePreset', error)
    else await refetch()
    return { error }
  }, [refetch])

  // 별표(주배치) 지정 — 원자 전환 RPC(같은 요일 다른 것 false → 대상 true를 단일 트랜잭션으로).
  // 두 UPDATE를 앱에서 따로 쏘면 중간에 활성 0개 순간이 생길 수 있어 RPC로 묶음(guardian 주의-2).
  const setActive = useCallback(async (presetId) => {
    const { error } = await supabase.rpc('roster_weekday_preset_set_active', { p_preset_id: presetId })
    if (error) { logError('useRosterWeekdayPreset.setActive', error); return { error } }
    await refetch()
    return {}
  }, [refetch])

  return { presets, loaded, byWeekday, activeByWeekday, refetch, createPreset, replaceItems, renamePreset, deletePreset, setActive }
}
