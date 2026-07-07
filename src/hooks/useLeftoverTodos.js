// 3년 초과 미완료 todo thread 조회 + 일괄 액션. WORKLOG-SPEC.md §6.3.
//
// "leftover" = 같은 thread 의 가장 최근 row 가 3년 이전이면서 미완료인 thread.
// 사용자가 "이 todo 그만 잡고 있겠다" 결정하는 정리 화면.

import { useCallback, useEffect, useState } from 'react'
import { supabase, logError } from '@thinkmap/core'

const CUTOFF_YEARS = 3

function cutoffDateStr() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - CUTOFF_YEARS)
  return d.toISOString().slice(0, 10)
}

export function useLeftoverTodos(session) {
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(false)
  const userId = session?.user?.id

  const refetch = useCallback(async () => {
    if (!userId) { setThreads([]); return }
    setLoading(true)
    try {
      // 본인의 모든 미완료 todo 가져옴 (deleted_at NULL). thread 단위 dedup.
      const { data, error } = await supabase
        .from('daily_blocks')
        .select('block_id, origin_block_id, page_id, page_date, text_content, carry_over_from, updated_at')
        .eq('user_id', userId)
        .eq('is_todo', true)
        .eq('todo_checked', false)
        .is('deleted_at', null)
        .order('page_date', { ascending: false })
      if (error) throw error

      const byThread = new Map()
      for (const r of (data || [])) {
        const tid = r.origin_block_id || r.block_id
        const existing = byThread.get(tid)
        if (!existing) {
          byThread.set(tid, {
            thread_id: tid,
            latest_block_id: r.block_id,
            latest_page_id: r.page_id,
            latest_page_date: r.page_date,
            text_content: r.text_content,
            carry_over_from: r.carry_over_from,
            thread_length: 1,
          })
        } else {
          existing.thread_length += 1
          // page_date desc 정렬이라 첫 row 가 latest. 이후는 오래된 row.
          // text_content 가 첫 row 의 것으로 유지 (최신).
        }
      }

      const cutoff = cutoffDateStr()
      const leftover = [...byThread.values()]
        .filter(t => t.latest_page_date < cutoff)
        .sort((a, b) => (a.carry_over_from || a.latest_page_date)
          .localeCompare(b.carry_over_from || b.latest_page_date))

      setThreads(leftover)
    } catch (err) {
      logError('useLeftoverTodos.refetch', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { refetch() }, [refetch])

  // 액션: thread 의 모든 row 를 todoChecked=true 로 (완료 처리)
  const completeThread = useCallback(async (threadId) => {
    if (!threadId) return
    try {
      // origin_block_id = threadId 또는 block_id = threadId 두 케이스
      const a = await supabase
        .from('daily_blocks')
        .update({ todo_checked: true, todo_status: 'done' })
        .eq('block_id', threadId)
        .is('deleted_at', null)
      if (a.error) throw a.error
      const b = await supabase
        .from('daily_blocks')
        .update({ todo_checked: true, todo_status: 'done' })
        .eq('origin_block_id', threadId)
        .is('deleted_at', null)
      if (b.error) throw b.error
      await refetch()
    } catch (err) {
      logError('useLeftoverTodos.completeThread', err)
      throw err
    }
  }, [refetch])

  // 액션: thread 의 모든 row soft delete (deleted_at)
  const deleteThread = useCallback(async (threadId) => {
    if (!threadId) return
    try {
      const now = new Date().toISOString()
      const a = await supabase
        .from('daily_blocks')
        .update({ deleted_at: now })
        .eq('block_id', threadId)
        .is('deleted_at', null)
      if (a.error) throw a.error
      const b = await supabase
        .from('daily_blocks')
        .update({ deleted_at: now })
        .eq('origin_block_id', threadId)
        .is('deleted_at', null)
      if (b.error) throw b.error
      await refetch()
    } catch (err) {
      logError('useLeftoverTodos.deleteThread', err)
      throw err
    }
  }, [refetch])

  return { threads, loading, refetch, completeThread, deleteThread }
}
