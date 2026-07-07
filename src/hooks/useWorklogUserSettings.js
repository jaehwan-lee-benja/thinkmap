import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@thinkmap/core'

/**
 * 업무일지 계정별 설정 훅
 * - section_order  : (user_id, board_id) 키. board-scope. boardId 없으면 빈 배열.
 *                    저장 테이블: worklog_board_user_settings
 * - quicktodo_pinned: user 전역 (보드 무관). 저장 테이블: worklog_user_settings
 *
 * 두 영역은 보관 위치가 다르다 — board 단위 정렬은 보드와 함께,
 * QuickTodo 의 고정 섹션은 사용자 환경설정으로 유지.
 */
export const useWorklogUserSettings = (session, boardId = null) => {
  const [sectionOrder, setSectionOrder] = useState(null)
  const [quicktodoPinned, setQuicktodoPinned] = useState(null) // { id, name }
  const [loading, setLoading] = useState(true)

  // section_order 조회 (board-scope)
  useEffect(() => {
    if (!session?.user?.id || !boardId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('worklog_board_user_settings')
        .select('section_order')
        .eq('user_id', session.user.id)
        .eq('board_id', boardId)
        .maybeSingle()
      if (cancelled) return
      if (data?.section_order?.length > 0) setSectionOrder(data.section_order)
    })()
    return () => { cancelled = true }
  }, [session?.user?.id, boardId])

  // quicktodo_pinned 조회 (user-global)
  useEffect(() => {
    if (!session?.user?.id) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('worklog_user_settings')
        .select('quicktodo_pinned')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (data?.quicktodo_pinned) setQuicktodoPinned(data.quicktodo_pinned)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [session?.user?.id])

  const updateSectionOrder = useCallback(async (newOrder) => {
    if (!session?.user?.id || !boardId) return
    setSectionOrder(newOrder)
    await supabase
      .from('worklog_board_user_settings')
      .upsert({
        user_id: session.user.id,
        board_id: boardId,
        section_order: newOrder,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,board_id' })
  }, [session?.user?.id, boardId])

  const updateQuicktodoPinned = useCallback(async (pinned) => {
    if (!session?.user?.id) return
    setQuicktodoPinned(pinned)
    await supabase
      .from('worklog_user_settings')
      .upsert({
        user_id: session.user.id,
        quicktodo_pinned: pinned,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
  }, [session?.user?.id])

  return { sectionOrder, quicktodoPinned, loading, updateSectionOrder, updateQuicktodoPinned }
}
