// QuickTodo 의 daily_blocks v2 row 조작 유틸. WORKLOG-SPEC.md §3, §10 Phase v2.2.
//
// 책임:
//   - 오늘의 daily 페이지 보장 (없으면 createDailyPageV2)
//   - 오늘 페이지의 section row 조회 (master 필터 적용)
//   - 섹션 자식으로 todo row INSERT
//   - todo row 를 다른 섹션으로 이동 (parent_block_id / section_id / position 갱신)
//
// 모든 함수는 supabase 클라이언트를 인자로 받아 의존성 격리.

import { ensureDailyPage } from './ensureDailyPage.js'
import { dailyPageName } from './dateUtils.js'
import { newBlockId } from './blockIdV2.js'
import { rowToDb, patchToDb } from './dailyBlockMapper.js'
import { fetchBlocks } from './dailyBlockOps.js'

const EMPTY_CHILD_POSITION = 999  // createDailyPageV2 가 박는 빈 자식의 position

/**
 * 캘린더 ID 조회 (첫 번째 calendar 페이지).
 * QuickTodo 는 단일 캘린더 가정 — 다중 캘린더는 호출자에서 calendarId 를 명시.
 */
export async function findCalendarPageId(supabase) {
  const { data, error } = await supabase
    .from('pages')
    .select('id')
    .eq('page_type', 'calendar')
    .is('deleted_at', null)
    .limit(1)
  if (error) throw error
  return data?.[0]?.id || null
}

/**
 * 오늘 daily 페이지 보장. 없으면 createDailyPageV2 가 만들고 섹션/이월 row 까지 채움.
 * @returns {{ pageId: string, pageDate: string }}
 */
export async function ensureTodayDailyPage(supabase, { calendarId, userId }) {
  if (!calendarId) throw new Error('ensureTodayDailyPage: calendarId 필수')
  if (!userId) throw new Error('ensureTodayDailyPage: userId 필수')
  const pageDate = new Date().toISOString().slice(0, 10)
  const { pageId } = await ensureDailyPage({
    supabase, parentId: calendarId, dateKey: pageDate, userId, dailyPageName,
  })
  return { pageId, pageDate }
}

/**
 * 페이지의 section row 만 조회. master 가 아닐 때는 visibility='master' 제외.
 * @returns {Array} section row (camelCase)
 */
export async function fetchSectionRows(supabase, pageId, { isMaster = false } = {}) {
  const blocks = await fetchBlocks(supabase, pageId)
  return blocks
    .filter(b => b.blockType === 'section')
    .filter(b => isMaster || b.visibility !== 'master')
    .sort((a, b) => (a.position || 0) - (b.position || 0))
}

/**
 * sectionMasterId 로 섹션 찾기 (없으면 default fallback).
 * pinnedSection 이 더 이상 존재하지 않는 master id 면 null 반환 — 호출자가 unpin 처리.
 */
export function findSectionByMasterId(sectionRows, sectionMasterId, defaultMasterId) {
  const exact = sectionRows.find(s => s.sectionMasterId === sectionMasterId)
  if (exact) return { row: exact, foundExact: true }
  const fallback = sectionRows.find(s => s.sectionMasterId === defaultMasterId)
  return { row: fallback || null, foundExact: false }
}

/** 같은 섹션 (parentBlockId == sectionRow.blockId) 의 살아있는 자식 중 EMPTY_CHILD_POSITION 미만의 max position */
function maxChildPosition(allBlocks, sectionBlockId) {
  let max = 0
  for (const b of allBlocks) {
    if (b.parentBlockId !== sectionBlockId) continue
    const pos = Number(b.position) || 0
    if (pos >= EMPTY_CHILD_POSITION) continue
    if (pos > max) max = pos
  }
  return max
}

/**
 * 섹션 자식으로 todo row INSERT.
 * @returns {object} 삽입된 row (camelCase)
 */
export async function insertTodoIntoSection(supabase, { pageId, pageDate, userId, sectionRow, todoText }) {
  if (!sectionRow?.blockId) throw new Error('insertTodoIntoSection: sectionRow.blockId 필수')

  const allBlocks = await fetchBlocks(supabase, pageId)
  const position = maxChildPosition(allBlocks, sectionRow.blockId) + 1

  const row = {
    blockId: newBlockId(),
    pageId,
    pageDate,
    userId,
    blockType: 'toggle',
    parentBlockId: sectionRow.blockId,
    sectionId: sectionRow.blockId,
    sectionMasterId: null,
    position,
    textContent: todoText,
    richContent: null,
    isTodo: true,
    todoChecked: false,
    todoStatus: 'open',
    isCarryOver: false,
    carryOverFrom: null,
    originBlockId: null,
    isPinned: false,
    // [A] 섹션=공유 단위. quick-todo 도 타깃 섹션의 visibility 를 상속한다.
    // (master 섹션에 'all' todo 를 넣으면 비마스터에게 헤더 없는 고아로 누수됨)
    visibility: sectionRow.visibility || 'all',
    isFixedSection: false,
  }
  const { error } = await supabase.from('daily_blocks').insert(rowToDb(row))
  if (error) throw error
  return row
}

/**
 * todo row 를 다른 섹션으로 이동.
 * parent_block_id, section_id, position 갱신.
 */
export async function moveTodoRowToSection(supabase, { blockId, targetSectionRow, pageId }) {
  if (!blockId) throw new Error('moveTodoRowToSection: blockId 필수')
  if (!targetSectionRow?.blockId) throw new Error('moveTodoRowToSection: targetSectionRow 필수')

  const allBlocks = await fetchBlocks(supabase, pageId)
  const position = maxChildPosition(allBlocks, targetSectionRow.blockId) + 1

  const { error } = await supabase
    .from('daily_blocks')
    .update(patchToDb({
      parentBlockId: targetSectionRow.blockId,
      sectionId: targetSectionRow.blockId,
      position,
    }))
    .eq('block_id', blockId)
  if (error) throw error
}
