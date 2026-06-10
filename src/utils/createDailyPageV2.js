// 새 daily 페이지 생성 (v2). WORKLOG-SPEC.md §10 Phase v2.2.
//
// 흐름:
//   1. 중복 방지: 같은 (parent_id, page_date) daily 가 있으면 그 id 반환
//   2. pages 에 daily row INSERT (content_tiptap = null/빈, page_type='daily')
//   3. worklog_sections (global + board-scope) + worklog_board_user_settings 조회
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
    // 부모 섹션의 visibility 를 상속한다. visibility='master' 섹션(비마스터에겐 RLS 로 숨겨짐)
    // 아래에 'all' 자식을 만들면, 비마스터 owner 화면에서 헤더 없이 떠다니는 고아 토글이 된다.
    // (board-scope 전환 후 비마스터 daily 에 master 섹션이 섞이며 6/8 양식 깨짐 발생 — 진단 SQL 참조)
    visibility: sectionRow.visibility || 'all',
    isFixedSection: false,
  }
}

const EMPTY_DOC = { type: 'doc', content: [] }

// 동시 호출 race 차단 — 같은 (parentId, dateKey, userId) 로 들어온 요청은 첫 promise 를 공유.
// 화살표 / 캘린더 / 다른 진입점에서 동시에 호출돼도 페이지/섹션 row 가 한 번만 INSERT.
const inFlight = new Map()

export async function createDailyPageV2(args) {
  const { parentId, dateKey, userId } = args
  if (!args.supabase || !parentId || !dateKey || !userId) {
    throw new Error('createDailyPageV2: supabase, parentId, dateKey, userId 모두 필수')
  }
  const key = `${parentId}|${dateKey}|${userId}`
  if (inFlight.has(key)) return inFlight.get(key)
  const promise = createDailyPageV2Impl(args)
  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

async function createDailyPageV2Impl({
  supabase,
  parentId,
  dateKey,
  userId,
  dailyPageName,    // (dateKey: string) => string. 호출자 주입 (의존성 격리)
}) {

  // 1. 중복 방지 — 이미 있으면 그 id 그대로 반환. row 채움 작업은 첫 호출 한 번만.
  // (이전엔 "빈 페이지 회복 모드" 로 row 가 0 이면 다시 채웠으나, race 시 첫 호출이 아직 row INSERT 중일 때
  //  두 번째 호출이 빈 페이지로 인식하고 다시 채워 중복 발생. 회복 모드 제거 — race 차단 우선)
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
    return { pageId: dup[0].id, created: false }
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
    if (pageErr) {
      // race condition: 동시에 다른 호출이 같은 (parent_id, page_date) 로 INSERT 했을 때
      // partial unique index (uniq_daily_page_per_date) 가 23505 차단. fallback 으로 기존 row SELECT 후 사용.
      if (pageErr.code === '23505') {
        const { data: existing } = await supabase
          .from('pages')
          .select('id')
          .eq('parent_id', parentId)
          .eq('page_date', dateKey)
          .eq('page_type', 'daily')
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle()
        if (existing?.id) {
          return { pageId: existing.id, created: false }
        }
      }
      throw pageErr
    }
    pageId = newPage.id
    created = true
  }
  const ctx = { pageId, pageDate: dateKey, userId }

  // 3. 섹션 마스터 + 사용자 순서 조회 — global + 이 보드의 board scope. deleted_at 제외.
  // board scope 는 sort_order 가 같으면 created_at (만든 순서) 로 결정적 정렬.
  // section_order 는 (user_id, board_id) 키. 이 user 가 이 보드에서 정렬한 순서.
  const [globalRes, boardRes, settingsRes] = await Promise.all([
    supabase
      .from('worklog_sections')
      .select('*')
      .eq('scope', 'global')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('worklog_sections')
      .select('*')
      .eq('scope', 'board')
      .eq('board_id', parentId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('worklog_board_user_settings')
      .select('section_order')
      .eq('user_id', userId)
      .eq('board_id', parentId)
      .maybeSingle(),
  ])
  if (globalRes.error) throw globalRes.error
  if (boardRes.error)  throw boardRes.error
  const sections = [...(globalRes.data || []), ...(boardRes.data || [])]
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
