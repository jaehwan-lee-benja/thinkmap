// worklogTemplateV2 단위 테스트.

import { describe, test, expect } from 'vitest'
import { buildDailyTemplateRows } from '../../src/utils/worklogTemplateV2.js'

const ctx = {
  pageId: 'page-new-0001-0000-0000-000000000000',
  pageDate: '2026-04-30',
  userId: 'user-0001-0000-0000-0000-000000000000',
}

const FIXED_SECTIONS = [
  { id: 'fixed_todo',        title: '할 일',      section_type: 'fixed', sort_order: 1, visibility: 'all',    parent_id: null },
  { id: 'fixed_notice',      title: '전달사항',    section_type: 'fixed', sort_order: 2, visibility: 'all',    parent_id: null },
  { id: 'fixed_wrapup',      title: '마무리 기록', section_type: 'fixed', sort_order: 3, visibility: 'master', parent_id: null },
  { id: 'fixed_daily_issue', title: '당일 이슈',   section_type: 'fixed', sort_order: 4, visibility: 'all',    parent_id: 'fixed_wrapup' },
]

describe('buildDailyTemplateRows', () => {
  test('빈 입력 → 빈 배열', () => {
    expect(buildDailyTemplateRows([], ctx)).toEqual([])
    expect(buildDailyTemplateRows(null, ctx)).toEqual([])
  })

  test('ctx.pageId 누락 시 throw', () => {
    expect(() => buildDailyTemplateRows(FIXED_SECTIONS, {})).toThrow('pageId')
  })

  test('4개 fixed 섹션 → 4 row', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    expect(rows).toHaveLength(4)
    expect(rows.every(r => r.blockType === 'section')).toBe(true)
  })

  test('R6 자기참조: sectionId === blockId', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    for (const r of rows) {
      expect(r.sectionId).toBe(r.blockId)
    }
  })

  test('sectionMasterId 가 worklog_sections.id 를 가리킴', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    const masters = rows.map(r => r.sectionMasterId)
    expect(masters).toEqual(expect.arrayContaining([
      'fixed_todo', 'fixed_notice', 'fixed_wrapup', 'fixed_daily_issue',
    ]))
  })

  test('parent_id → parentBlockId 매핑 (h3 가 h2 의 새 blockId 가리킴)', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    const wrapup = rows.find(r => r.sectionMasterId === 'fixed_wrapup')
    const issue  = rows.find(r => r.sectionMasterId === 'fixed_daily_issue')
    expect(issue.parentBlockId).toBe(wrapup.blockId)
  })

  test('parent_id 없으면 parentBlockId = null', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    const todo = rows.find(r => r.sectionMasterId === 'fixed_todo')
    expect(todo.parentBlockId).toBeNull()
  })

  test('position 은 정렬 순서대로 1,2,3,4', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    expect(rows.map(r => r.position)).toEqual([1, 2, 3, 4])
  })

  test('visibility 매핑', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    const wrapup = rows.find(r => r.sectionMasterId === 'fixed_wrapup')
    expect(wrapup.visibility).toBe('master')
  })

  test('isFixedSection: section_type==="fixed" 이면 true', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    expect(rows.every(r => r.isFixedSection)).toBe(true)
  })

  test('자유 섹션 (section_type="user") 은 isFixedSection=false', () => {
    const userSec = { id: 'usr-1', title: '구매 목록', section_type: 'user', sort_order: 5, visibility: 'all' }
    const rows = buildDailyTemplateRows([...FIXED_SECTIONS, userSec], ctx)
    const buy = rows.find(r => r.sectionMasterId === 'usr-1')
    expect(buy.isFixedSection).toBe(false)
  })

  test('section_order 적용 — 사용자가 바꾼 순서 반영', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx, {
      sectionOrder: ['fixed_notice', 'fixed_todo', 'fixed_wrapup', 'fixed_daily_issue'],
    })
    const masters = rows.map(r => r.sectionMasterId)
    expect(masters).toEqual(['fixed_notice', 'fixed_todo', 'fixed_wrapup', 'fixed_daily_issue'])
  })

  test('section_order 에 없는 섹션은 sort_order 로 fallback', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx, {
      sectionOrder: ['fixed_wrapup'],  // wrapup 만 명시
    })
    const masters = rows.map(r => r.sectionMasterId)
    // wrapup 이 맨 처음, 나머지는 sort_order 순서로 — daily_issue 의 parent_id 가 wrapup 이라도 정렬은 별개
    expect(masters[0]).toBe('fixed_wrapup')
  })

  test('camelCase 입력도 허용 (sectionType, sortOrder, parentId)', () => {
    const camel = [
      { id: 'a', title: 'A', sectionType: 'fixed', sortOrder: 1, visibility: 'all', parentId: null },
      { id: 'b', title: 'B', sectionType: 'user',  sortOrder: 2, visibility: 'all', parentId: 'a' },
    ]
    const rows = buildDailyTemplateRows(camel, ctx)
    const rowA = rows.find(r => r.sectionMasterId === 'a')
    const rowB = rows.find(r => r.sectionMasterId === 'b')
    expect(rowA.isFixedSection).toBe(true)
    expect(rowB.isFixedSection).toBe(false)
    expect(rowB.parentBlockId).toBe(rowA.blockId)
  })

  test('ctx 의 pageId / pageDate / userId 가 모든 row 에 박힘', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    for (const r of rows) {
      expect(r.pageId).toBe(ctx.pageId)
      expect(r.pageDate).toBe(ctx.pageDate)
      expect(r.userId).toBe(ctx.userId)
    }
  })

  test('blockId 는 모두 unique', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    const ids = new Set(rows.map(r => r.blockId))
    expect(ids.size).toBe(rows.length)
  })

  test('todo / carry-over / pinned 메타는 모두 false', () => {
    const rows = buildDailyTemplateRows(FIXED_SECTIONS, ctx)
    for (const r of rows) {
      expect(r.isTodo).toBe(false)
      expect(r.todoChecked).toBe(false)
      expect(r.todoStatus).toBe('open')
      expect(r.isCarryOver).toBe(false)
      expect(r.carryOverFrom).toBeNull()
      expect(r.originBlockId).toBeNull()
      expect(r.isPinned).toBe(false)
    }
  })
})
