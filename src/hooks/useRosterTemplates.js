// 배치도 체제 템플릿(roster_templates + roster_template_slots) 로드 + CRUD 훅.
// PLAN-roster-visual-board.md §4·§6. 전역 기본(board_id IS NULL) + 보드별 커스텀을 함께 로드.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'

/**
 * @param {string} boardId  업무일지 캘린더(보드) id. 전역 + 이 보드 커스텀 템플릿을 로드.
 */
export function useRosterTemplates(boardId) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      // 전역(board_id IS NULL) + 이 보드 커스텀
      let q = supabase
        .from('roster_templates')
        .select('*, roster_template_slots(*)')
        .is('deleted_at', null)
        .order('display_order', { ascending: true })
      q = boardId ? q.or(`board_id.is.null,board_id.eq.${boardId}`) : q.is('board_id', null)
      const { data, error } = await q
      if (error) throw error
      const mapped = (data || []).map((t) => ({
        ...t,
        slots: (t.roster_template_slots || [])
          .slice()
          .sort((a, b) => (a.grid_row - b.grid_row) || (a.grid_col - b.grid_col)),
      }))
      if (mountedRef.current) setTemplates(mapped)
    } catch (err) {
      logError('useRosterTemplates.refetch', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [boardId])

  useEffect(() => { refetch() }, [refetch])

  // 새 체제(버전) 생성 — 요일 무관(이름+슬롯). 요일/날짜 배정은 useRosterSchedule이 담당.
  // slots: [{grid_row,grid_col,role,tasks,shift,label,capacity}]
  const createTemplate = useCallback(async ({ name, slots = [], scope = 'board', kitchen = null, createdBy = null }) => {
    const board_id = scope === 'global' ? null : (boardId || null)
    const k = kitchen ? { kitchen_x: kitchen.x, kitchen_y: kitchen.y, kitchen_w: kitchen.w, kitchen_h: kitchen.h } : {}
    const { data: tpl, error } = await supabase
      .from('roster_templates')
      .insert({ board_id, name, created_by: createdBy, ...k })
      .select()
      .maybeSingle()
    if (error || !tpl) { logError('useRosterTemplates.createTemplate', error); return { error } }
    if (slots.length) {
      const rows = slots.map((s) => ({
        template_id: tpl.id,
        grid_row: s.grid_row ?? 0, grid_col: s.grid_col ?? 0,
        role: s.role, tasks: s.tasks ?? null, shift: s.shift ?? null,
        label: s.label ?? null, capacity: s.capacity ?? 1,
      }))
      const { error: e2 } = await supabase.from('roster_template_slots').insert(rows)
      if (e2) logError('useRosterTemplates.createTemplate.slots', e2)
    }
    await refetch()
    return { data: tpl }
  }, [boardId, refetch])

  // 슬롯 전체 교체(레이아웃 편집 저장) — 기존 슬롯 삭제 후 재삽입.
  const replaceSlots = useCallback(async (templateId, slots) => {
    const { error: delErr } = await supabase.from('roster_template_slots').delete().eq('template_id', templateId)
    if (delErr) { logError('useRosterTemplates.replaceSlots.del', delErr); return { error: delErr } }
    if (slots.length) {
      const rows = slots.map((s) => ({
        template_id: templateId,
        grid_row: s.grid_row ?? 0, grid_col: s.grid_col ?? 0,
        role: s.role, tasks: s.tasks ?? null, shift: s.shift ?? null,
        label: s.label ?? null, capacity: s.capacity ?? 1,
      }))
      const { error } = await supabase.from('roster_template_slots').insert(rows)
      if (error) { logError('useRosterTemplates.replaceSlots.ins', error); return { error } }
    }
    await refetch()
    return {}
  }, [refetch])

  const renameTemplate = useCallback(async (templateId, patch) => {
    const { error } = await supabase.from('roster_templates').update(patch).eq('id', templateId)
    if (error) logError('useRosterTemplates.renameTemplate', error)
    else await refetch()
    return { error }
  }, [refetch])

  const deleteTemplate = useCallback(async (templateId) => {
    const { error } = await supabase
      .from('roster_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', templateId)
    if (error) logError('useRosterTemplates.deleteTemplate', error)
    else await refetch()
    return { error }
  }, [refetch])

  // 풀 배치(전체 마스터) 지정 — 보드당 1개. is_default=true, 같은 보드의 다른 마스터는 해제.
  const markMaster = useCallback(async (templateId) => {
    if (!boardId) return { error: new Error('보드 없음') }
    const { error: e1 } = await supabase
      .from('roster_templates')
      .update({ is_default: false }).eq('board_id', boardId).neq('id', templateId)
    if (e1) { logError('useRosterTemplates.markMaster.unset', e1); return { error: e1 } }
    const { error: e2 } = await supabase
      .from('roster_templates')
      .update({ is_default: true }).eq('id', templateId)
    if (e2) { logError('useRosterTemplates.markMaster.set', e2); return { error: e2 } }
    await refetch()
    return {}
  }, [boardId, refetch])

  return { templates, loading, refetch, createTemplate, replaceSlots, renameTemplate, deleteTemplate, markMaster }
}

// 요일 문자열 ('일'~'토') from 'YYYY-MM-DD'
export function weekdayKo(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
}
