// CRM 운영 보드 — 투두 레인 데이터. CRM-BOARD-SPEC §3, §5.
//
// daily_blocks(is_todo=true) 를 기간 범위(page_date)로 읽어 집계만 한다 (정본 복사 없음).
// v1(P1): 본인(마스터) 데이터, 수동 우선순위(미완료 우선 + 최근 날짜). 지표 연결(board_todo_links)은 P3.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, logError } from '@thinkmap/core'
import { periodDateKeys } from '../components/CrmBoard/crmBoardUtils'

/**
 * @param {Object} session
 * @param {'week'|'month'|'year'} period
 * @param {Date} anchor  기간 기준 날짜
 */
export function useBoardTodos(session, period, anchor) {
  const selfUid = session?.user?.id
  const [todos, setTodos] = useState([])
  const [pages, setPages] = useState({}) // page_id → name
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const { fromKey, toKey } = useMemo(
    () => periodDateKeys(period, anchor),
    [period, anchor?.getTime?.() ?? anchor]
  )

  const refetch = useCallback(async () => {
    if (!selfUid) { setTodos([]); setPages({}); return }
    setLoading(true)
    try {
      const { data: blocks, error } = await supabase
        .from('daily_blocks')
        .select('block_id, page_id, page_date, text_content, todo_checked, todo_status')
        .eq('user_id', selfUid)
        .eq('is_todo', true)
        .is('deleted_at', null)
        .gte('page_date', fromKey)
        .lt('page_date', toKey)
        .order('todo_checked', { ascending: true })
        .order('page_date', { ascending: false })
        .limit(500)
      if (error) throw error

      const pageIds = Array.from(new Set((blocks || []).map(b => b.page_id)))
      let pageMap = {}
      if (pageIds.length) {
        const { data: pageRows } = await supabase
          .from('pages')
          .select('id, name')
          .in('id', pageIds)
        ;(pageRows || []).forEach(p => { pageMap[p.id] = p.name })
      }

      if (mountedRef.current) {
        setTodos(blocks || [])
        setPages(pageMap)
      }
    } catch (err) {
      logError('useBoardTodos.refetch', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [selfUid, fromKey, toKey])

  useEffect(() => { refetch() }, [refetch])

  // 파생: 미완료/완료 분리 + 카운트
  const { open, done, total } = useMemo(() => {
    const open = todos.filter(t => !t.todo_checked)
    const done = todos.filter(t => t.todo_checked)
    return { open, done, total: todos.length }
  }, [todos])

  return { todos, open, done, total, pages, loading, refetch }
}
