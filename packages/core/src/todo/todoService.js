// 공유 todo 읽기 서비스 — SITE-SPLIT-PLAN §12 Phase 6.
//
// 정본 데이터는 단일 테이블 daily_blocks(is_todo=true) 뿐이다(별도 todos 테이블 없음).
// 흩어져 있던 건 *테이블*이 아니라 여러 소비자가 각자 복붙한 읽기 로직(select/filter/order).
// 이 파일은 그 읽기 로직만 하나로 모은다 — 쓰기 경로(quickTodoOps 등)는 다루지 않는다.
// RLS/권한(user_id 스코프, is_master)은 그대로: 여기서는 필터를 조립만 하고 강제하지 않는다.
//
// 소비자: useBoardTodos, TodoPicker, useCalendarTodoStats, useLeftoverTodos.

import { supabase } from '../supabaseClient.js'

/** 목록 표시용 기본 컬럼 (useBoardTodos·TodoPicker 공용). */
export const TODO_LIST_COLUMNS = 'block_id, page_id, page_date, text_content, todo_checked, todo_status'

/** 미완료 우선 + 최근 날짜 우선 — todo 목록 공용 정렬. */
export const TODO_DEFAULT_ORDER = [
  { column: 'todo_checked', ascending: true },
  { column: 'page_date', ascending: false },
]

/**
 * daily_blocks(is_todo=true, deleted_at is null) 조회 — 여러 소비자의 select/filter/order 통합.
 * 모든 필터는 opts 로 주는 것만 적용된다 (opts 에 없으면 그 축은 미필터).
 *
 * @param {object} [opts]
 * @param {string}   [opts.columns=TODO_LIST_COLUMNS]  select 컬럼
 * @param {string}   [opts.userId]        eq user_id (본인 스코프 — useBoardTodos, useLeftoverTodos)
 * @param {string[]} [opts.pageIds]       in page_id (캘린더 배치 조회 — useCalendarTodoStats)
 * @param {string}   [opts.fromKey]       gte page_date (기간범위 시작, inclusive)
 * @param {string}   [opts.toKey]         lt page_date (기간범위 끝, exclusive)
 * @param {boolean}  [opts.uncheckedOnly] eq todo_checked=false (useLeftoverTodos)
 * @param {{column:string, ascending:boolean}[]} [opts.order]
 * @param {number}   [opts.limit]
 * @returns {Promise<Array>} data (error 시 throw — 호출자가 기존처럼 try/catch)
 */
export async function fetchTodoBlocks(opts = {}) {
  const {
    columns = TODO_LIST_COLUMNS,
    userId,
    pageIds,
    fromKey,
    toKey,
    uncheckedOnly = false,
    order,
    limit,
  } = opts

  let q = supabase
    .from('daily_blocks')
    .select(columns)
    .eq('is_todo', true)
    .is('deleted_at', null)

  if (userId) q = q.eq('user_id', userId)
  if (pageIds) q = q.in('page_id', pageIds)
  if (fromKey) q = q.gte('page_date', fromKey)
  if (toKey) q = q.lt('page_date', toKey)
  if (uncheckedOnly) q = q.eq('todo_checked', false)
  if (order) order.forEach(o => { q = q.order(o.column, { ascending: o.ascending }) })
  if (limit) q = q.limit(limit)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

/**
 * todo block 목록의 page_id → page name 매핑 (todo 목록 표시용 공용 join).
 * useBoardTodos·TodoPicker 가 각자 복붙하던 "pages(id,name) in(pageIds)" 를 통합.
 */
export async function fetchPageNamesFor(blocks) {
  const pageIds = Array.from(new Set((blocks || []).map(b => b.page_id)))
  if (!pageIds.length) return {}
  const { data, error } = await supabase.from('pages').select('id, name').in('id', pageIds)
  if (error) throw error
  const map = {}
  ;(data || []).forEach(p => { map[p.id] = p.name })
  return map
}

/**
 * page_id 별 total/completed 집계 (useCalendarTodoStats 공용).
 * blocks 는 { page_id, todo_checked } 를 가진 row 배열이면 된다.
 * @returns {{ [pageId]: { total: number, completed: number } }}
 */
export function computeTodoCountsByPage(blocks) {
  const stats = {}
  ;(blocks || []).forEach(row => {
    if (!stats[row.page_id]) stats[row.page_id] = { total: 0, completed: 0 }
    stats[row.page_id].total++
    if (row.todo_checked) stats[row.page_id].completed++
  })
  return stats
}
