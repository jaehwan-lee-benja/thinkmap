// 새 daily 페이지 생성 (v2). WORKLOG-SPEC.md §10 Phase v2.2.
//
// 흐름:
//   1. 중복 방지: 같은 (parent_id, page_date) daily 가 있으면 그 id 반환
//   2. pages 에 daily row INSERT (content_tiptap = null/빈, page_type='daily')
//   3. worklog_sections + worklog_user_settings 조회
//   4. buildDailyTemplateRows 로 section row 생성 → daily_blocks INSERT
//   5. 직전 daily 페이지에서 carryOverEager → 이월 row INSERT
//
// 반환: 생성/조회된 daily 페이지의 id 또는 null

import { rowToDb } from './dailyBlockMapper.js'
import { buildDailyTemplateRows } from './worklogTemplateV2.js'
import { carryOverEager } from './carryOverPipelineV2.js'
import { newBlockId } from './blockIdV2.js'

// fixed_todo / fixed_daily_issue 처럼 todo 섹션이면 빈 자식의 isTodo=true.
const TODO_SECTION_MASTERS = new Set(['fixed_todo', 'fixed_daily_issue'])

function buildEmptyChildToggle(sectionRow) {
  const isTodo = TODO_SECTION_MASTERS.has(sectionRow.sectionMasterId)
  return {
    blockId: newBlockId(),
    pageId: sectionRow.pageId,
    pageDate: sectionRow.pageDate,
    userId: sectionRow.userId,
    blockType: 'toggle',
    parentBlockId: sectionRow.blockId,
    sectionId: sectionRow.blockId,
    sectionMasterId: null,
    position: 999,    // carry-over 가 들어오면 그 위로 정렬, 빈 자식은 마지막
    textContent: '',
    richContent: null,
    isTodo,
    todoChecked: false,
    todoStatus: 'open',
    isCarryOver: false,
    carryOverFrom: null,
    originBlockId: null,
    isPinned: false,
    visibility: 'all',
    isFixedSection: false,
  }
}

const EMPTY_DOC = { type: 'doc', content: [] }

export async function createDailyPageV2({
  supabase,
  parentId,
  dateKey,
  userId,
  dailyPageName,    // (dateKey: string) => string. 호출자 주입 (의존성 격리)
}) {
  if (!supabase || !parentId || !dateKey || !userId) {
    throw new Error('createDailyPageV2: supabase, parentId, dateKey, userId 모두 필수')
  }

  // 1. 중복 방지 — 이미 있으면 그 id 반환. 단 daily_blocks 가 비어있으면 (v1 흐름으로 만들어진 빈 페이지)
  //    아래 step 4 부터 같은 흐름으로 row 채워서 회복.
  const { data: dup, error: dupErr } = await supabase
    .from('pages')
    .select('id')
    .eq('parent_id', parentId)
    .eq('page_date', dateKey)
    .eq('page_type', 'daily')
    .is('deleted_at', null)
    .limit(1)
  if (dupErr) throw dupErr
  let pageId
  let created = false
  if (dup?.length) {
    pageId = dup[0].id
    const { count } = await supabase
      .from('daily_blocks')
      .select('block_id', { count: 'exact', head: true })
      .eq('page_id', pageId)
    if ((count || 0) > 0) {
      // 이미 row 들이 박힌 정상 페이지 — 그대로 반환
      return { pageId, created: false }
    }
    // 빈 페이지 — 아래 흐름으로 row 채움
  }

  // 2. pages INSERT (이미 존재하면 skip — 빈 페이지 회복 모드)
  if (!pageId) {
    const name = typeof dailyPageName === 'function' ? dailyPageName(dateKey) : dateKey
    const { data: siblings } = await supabase
      .from('pages')
      .select('id')
      .eq('parent_id', parentId)
      .is('deleted_at', null)
    const position = (siblings?.length || 0)

    const { data: newPage, error: pageErr } = await supabase
      .from('pages')
      .insert({
        name,
        parent_id: parentId,
        user_id: userId,
        page_type: 'daily',
        page_date: dateKey,
        project_id: null,
        position,
        content_tiptap: EMPTY_DOC,
      })
      .select('id')
      .single()
    if (pageErr) throw pageErr
    pageId = newPage.id
    created = true
  }
  const ctx = { pageId, pageDate: dateKey, userId }

  // 3. 섹션 마스터 + 사용자 순서 조회 — global + 본인 user scope. deleted_at 제외.
  // user scope 는 sort_order 가 같으면 created_at (만든 순서) 로 결정적 정렬.
  const [globalRes, userRes, settingsRes] = await Promise.all([
    supabase
      .from('worklog_sections')
      .select('*')
      .eq('scope', 'global')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('worklog_sections')
      .select('*')
      .eq('scope', 'user')
      .eq('created_by', userId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('worklog_user_settings')
      .select('section_order')
      .eq('user_id', userId)
      .maybeSingle(),
  ])
  if (globalRes.error) throw globalRes.error
  if (userRes.error)   throw userRes.error
  const sections = [...(globalRes.data || []), ...(userRes.data || [])]
  const sectionOrder = settingsRes.data?.section_order || []

  // 4. section row + 각 섹션의 빈 자식 토글 INSERT
  //    빈 자식 토글: 사용자가 섹션 헤더 아래에서 바로 입력 가능. position=999 라 carry-over 다음에 위치.
  const sectionRows = buildDailyTemplateRows(sections, ctx, { sectionOrder })
  const emptyChildren = sectionRows.map(buildEmptyChildToggle)
  const initialRows = [...sectionRows, ...emptyChildren]
  if (initialRows.length > 0) {
    const { error: secErr } = await supabase
      .from('daily_blocks')
      .insert(initialRows.map(rowToDb))
    if (secErr) throw secErr
  }

  // 5. 직전 daily 페이지에서 이월 (없으면 skip)
  const { data: prev } = await supabase
    .from('pages')
    .select('id')
    .eq('parent_id', parentId)
    .eq('page_type', 'daily')
    .is('deleted_at', null)
    .lt('page_date', dateKey)
    .order('page_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  let inserted = sectionRows.length
  if (prev?.id) {
    const result = await carryOverEager(supabase, prev.id, ctx)
    inserted += result.inserted || 0
  }

  return { pageId, created, inserted }
}
