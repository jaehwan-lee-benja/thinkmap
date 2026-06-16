// 보드 공통 작전판 레이아웃(roster_board_layout) — 홀·주방/바 네모. PLAN-roster-visual-board.md §12.
// 매장 구조(홀/주방)는 보드당 1행 공통. 슬롯(카드)은 체제별(useRosterTemplates).

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'

export const DEFAULT_LAYOUT = {
  hall_x: 6, hall_y: 4, hall_w: 88, hall_h: 36,
  kitchen_x: 6, kitchen_y: 44, kitchen_w: 88, kitchen_h: 52,
  field_ratio: 1.6, // 캔버스 가로:세로 비율(낮을수록 덜 가로로 김)
}

export function useRosterLayout(boardId) {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT)
  const [loaded, setLoaded] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!boardId) { setLayout(DEFAULT_LAYOUT); setLoaded(true); return }
    const { data, error } = await supabase
      .from('roster_board_layout')
      .select('*')
      .eq('board_id', boardId)
      .maybeSingle()
    if (error) logError('useRosterLayout.refetch', error)
    if (mountedRef.current) { setLayout(data || DEFAULT_LAYOUT); setLoaded(true) }
  }, [boardId])

  useEffect(() => { refetch() }, [refetch])

  // 홀·주방 좌표 저장(보드 공통). patch = { hall_x, ..., kitchen_x, ... }
  const saveLayout = useCallback(async (patch) => {
    if (!boardId) return { error: new Error('보드 없음') }
    const row = {
      board_id: boardId,
      hall_x: patch.hall_x, hall_y: patch.hall_y, hall_w: patch.hall_w, hall_h: patch.hall_h,
      kitchen_x: patch.kitchen_x, kitchen_y: patch.kitchen_y, kitchen_w: patch.kitchen_w, kitchen_h: patch.kitchen_h,
      field_ratio: patch.field_ratio ?? 1.6,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('roster_board_layout').upsert(row, { onConflict: 'board_id' })
    if (error) logError('useRosterLayout.saveLayout', error)
    else await refetch()
    return { error }
  }, [boardId, refetch])

  return { layout, loaded, saveLayout, refetch }
}
