// dailyBlockMapper 단위 테스트 — row ↔ DB row 변환 검증.

import { describe, test, expect } from 'vitest'
import { rowToDb, rowFromDb, patchToDb } from '../../src/utils/dailyBlockMapper.js'

const SAMPLE_ROW = {
  blockId: 'blk-2000-0000-0000-0000-000000000000',
  pageId: 'page-0001-0000-0000-0000-000000000000',
  pageDate: '2026-04-28',
  userId: 'user-0001-0000-0000-0000-000000000000',
  blockType: 'toggle',
  parentBlockId: 'blk-1000-0000-0000-0000-000000000000',
  sectionId: 'blk-1000-0000-0000-0000-000000000000',
  sectionMasterId: null,
  position: 1,
  textContent: '구급상자 약 정리',
  richContent: [{ type: 'paragraph', content: [{ type: 'text', text: '구급상자 약 정리' }] }],
  isTodo: true,
  todoChecked: false,
  todoStatus: 'open',
  isCarryOver: true,
  carryOverFrom: '2026-04-27',
  originBlockId: 'blk-2099-0000-0000-0000-000000000000',
  isPinned: false,
  visibility: 'all',
  isFixedSection: false,
  createdAt: '2026-04-28T00:00:00.000Z',
  updatedAt: '2026-04-28T00:00:00.000Z',
  deletedAt: null,
}

const SAMPLE_DB = {
  block_id: 'blk-2000-0000-0000-0000-000000000000',
  page_id: 'page-0001-0000-0000-0000-000000000000',
  page_date: '2026-04-28',
  user_id: 'user-0001-0000-0000-0000-000000000000',
  block_type: 'toggle',
  parent_block_id: 'blk-1000-0000-0000-0000-000000000000',
  section_id: 'blk-1000-0000-0000-0000-000000000000',
  section_master_id: null,
  position: 1,
  text_content: '구급상자 약 정리',
  rich_content: [{ type: 'paragraph', content: [{ type: 'text', text: '구급상자 약 정리' }] }],
  is_todo: true,
  todo_checked: false,
  todo_status: 'open',
  is_carry_over: true,
  carry_over_from: '2026-04-27',
  origin_block_id: 'blk-2099-0000-0000-0000-000000000000',
  is_pinned: false,
  visibility: 'all',
  is_fixed_section: false,
  created_at: '2026-04-28T00:00:00.000Z',
  updated_at: '2026-04-28T00:00:00.000Z',
  deleted_at: null,
}

describe('dailyBlockMapper', () => {
  test('rowToDb: camelCase → snake_case 매핑', () => {
    expect(rowToDb(SAMPLE_ROW)).toEqual(SAMPLE_DB)
  })

  test('rowFromDb: snake_case → camelCase 매핑', () => {
    expect(rowFromDb(SAMPLE_DB)).toEqual(SAMPLE_ROW)
  })

  test('round-trip: rowFromDb(rowToDb(row)) === row', () => {
    expect(rowFromDb(rowToDb(SAMPLE_ROW))).toEqual(SAMPLE_ROW)
  })

  test('round-trip: rowToDb(rowFromDb(db)) === db', () => {
    expect(rowToDb(rowFromDb(SAMPLE_DB))).toEqual(SAMPLE_DB)
  })

  test('rowToDb: 알 수 없는 키는 무시', () => {
    const result = rowToDb({ ...SAMPLE_ROW, randomKey: 'should be dropped' })
    expect(result).not.toHaveProperty('randomKey')
    expect(result).not.toHaveProperty('random_key')
  })

  test('rowFromDb: 알 수 없는 컬럼은 무시', () => {
    const result = rowFromDb({ ...SAMPLE_DB, unknown_column: 'x' })
    expect(result).not.toHaveProperty('unknown_column')
    expect(result).not.toHaveProperty('unknownColumn')
  })

  test('rowFromDb: position 이 string 으로 와도 number 로 변환', () => {
    const result = rowFromDb({ ...SAMPLE_DB, position: '2.5' })
    expect(result.position).toBe(2.5)
    expect(typeof result.position).toBe('number')
  })

  test('patchToDb: 변경 필드만 매핑', () => {
    const patch = { todoChecked: true, todoStatus: 'done' }
    expect(patchToDb(patch)).toEqual({ todo_checked: true, todo_status: 'done' })
  })

  test('patchToDb: 빈 patch 는 빈 객체', () => {
    expect(patchToDb({})).toEqual({})
  })

  test('sectionMasterId 매핑 (section row, §9.9 옵션 A)', () => {
    const sectionRow = { ...SAMPLE_ROW, blockType: 'section', sectionMasterId: 'fixed_todo' }
    const dbForm = rowToDb(sectionRow)
    expect(dbForm.section_master_id).toBe('fixed_todo')
    expect(rowFromDb(dbForm).sectionMasterId).toBe('fixed_todo')
  })

  test('patchToDb: sectionMasterId 변경도 매핑됨', () => {
    expect(patchToDb({ sectionMasterId: 'new_master' })).toEqual({ section_master_id: 'new_master' })
  })
})
