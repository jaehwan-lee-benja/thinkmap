// CRM 운영 보드 — 투두 레인 데이터. CRM-BOARD-SPEC §3, §5.
//
// daily_blocks(is_todo=true) 를 기간 범위(page_date)로 읽어 집계만 한다 (정본 복사 없음).
// v1(P1): 본인(마스터) 데이터, 수동 우선순위(미완료 우선 + 최근 날짜). 지표 연결(board_todo_links)은 P3.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logError, fetchTodoBlocks, fetchPageNamesFor, TODO_DEFAULT_ORDER } from '@thinkmap/core'
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
      const blocks = await fetchTodoBlocks({
        userId: selfUid,
        fromKey,
        toKey,
        order: TODO_DEFAULT_ORDER,
        limit: 500,
      })
      const pageMap = await fetchPageNamesFor(blocks)

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
