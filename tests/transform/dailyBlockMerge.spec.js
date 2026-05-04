// dailyBlockMerge 단위 테스트.

import { describe, test, expect } from 'vitest'
import {
  mergeDiffLocal,
  applyRealtimeEvent,
  sortByPositionAndCreatedAt,
} from '../../src/utils/dailyBlockMerge.js'

const baseRow = {
  blockId: 'blk-1',
  pageId: 'p',
  pageDate: '2026-04-28',
  userId: 'u',
  blockType: 'toggle',
  parentBlockId: null,
  sectionId: 's1',
  position: 1,
  textContent: 'a',
  richContent: null,
  isTodo: false,
  todoChecked: false,
  todoStatus: 'open',
  isCarryOver: false,
  carryOverFrom: null,
  originBlockId: null,
  isPinned: false,
  visibility: 'all',
  isFixedSection: false,
  createdAt: '2026-04-28T00:00:00.000Z',
  updatedAt: '2026-04-28T00:00:00.000Z',
  deletedAt: null,
}

const dbRow = (over = {}) => ({
  block_id: 'blk-2', page_id: 'p', page_date: '2026-04-28', user_id: 'u',
  block_type: 'toggle', parent_block_id: null, section_id: 's1', position: 2,
  text_content: 'b', rich_content: null,
  is_todo: false, todo_checked: false, todo_status: 'open',
  is_carry_over: false, carry_over_from: null, origin_block_id: null,
  is_pinned: false, visibility: 'all', is_fixed_section: false,
  created_at: '2026-04-28T00:00:00.000Z', updated_at: '2026-04-28T00:00:00.000Z',
  deleted_at: null,
  ...over,
})

describe('sortByPositionAndCreatedAt', () => {
  test('position 오름차순', () => {
    const rows = [
      { ...baseRow, blockId: 'b', position: 2 },
      { ...baseRow, blockId: 'a', position: 1 },
    ]
    expect(sortByPositionAndCreatedAt(rows).map(r => r.blockId)).toEqual(['a', 'b'])
  })

  test('동률 시 createdAt tiebreak', () => {
    const rows = [
      { ...baseRow, blockId: 'b', position: 1, createdAt: '2026-04-28T01:00:00Z' },
      { ...baseRow, blockId: 'a', position: 1, createdAt: '2026-04-28T00:00:00Z' },
    ]
    expect(sortByPositionAndCreatedAt(rows).map(r => r.blockId)).toEqual(['a', 'b'])
  })
})

describe('mergeDiffLocal', () => {
  test('insert: 새 row 추가 후 정렬', () => {
    const prev = [{ ...baseRow, blockId: 'a', position: 1 }]
    const result = mergeDiffLocal(prev, {
      insert: [{ ...baseRow, blockId: 'b', position: 2 }],
      update: [], softDelete: [],
    })
    expect(result.map(r => r.blockId)).toEqual(['a', 'b'])
  })

  test('insert: 같은 blockId 면 교체 (멱등)', () => {
    const prev = [{ ...baseRow, blockId: 'a', position: 1, textContent: 'old' }]
    const result = mergeDiffLocal(prev, {
      insert: [{ ...baseRow, blockId: 'a', position: 1, textContent: 'new' }],
      update: [], softDelete: [],
    })
    expect(result).toHaveLength(1)
    expect(result[0].textContent).toBe('new')
  })

  test('update: patch 만 머지', () => {
    const prev = [{ ...baseRow, blockId: 'a', todoChecked: false }]
    const result = mergeDiffLocal(prev, {
      insert: [],
      update: [{ blockId: 'a', patch: { todoChecked: true, todoStatus: 'done' } }],
      softDelete: [],
    })
    expect(result[0].todoChecked).toBe(true)
    expect(result[0].todoStatus).toBe('done')
    expect(result[0].textContent).toBe('a')   // 그대로
  })

  test('softDelete: 해당 row 제거', () => {
    const prev = [
      { ...baseRow, blockId: 'a' },
      { ...baseRow, blockId: 'b' },
    ]
    const result = mergeDiffLocal(prev, {
      insert: [], update: [], softDelete: ['a'],
    })
    expect(result.map(r => r.blockId)).toEqual(['b'])
  })

  test('insert + update + softDelete 동시', () => {
    const prev = [
      { ...baseRow, blockId: 'a', position: 1 },
      { ...baseRow, blockId: 'b', position: 2 },
    ]
    const result = mergeDiffLocal(prev, {
      insert: [{ ...baseRow, blockId: 'c', position: 3 }],
      update: [{ blockId: 'a', patch: { textContent: 'updated' } }],
      softDelete: ['b'],
    })
    expect(result.map(r => r.blockId)).toEqual(['a', 'c'])
    expect(result[0].textContent).toBe('updated')
  })

  test('빈 diff 는 정렬만', () => {
    const prev = [
      { ...baseRow, blockId: 'b', position: 2 },
      { ...baseRow, blockId: 'a', position: 1 },
    ]
    const result = mergeDiffLocal(prev, { insert: [], update: [], softDelete: [] })
    expect(result.map(r => r.blockId)).toEqual(['a', 'b'])
  })
})

describe('applyRealtimeEvent', () => {
  test('INSERT: 새 row 추가', () => {
    const prev = []
    const next = applyRealtimeEvent(prev, { eventType: 'INSERT', new: dbRow() })
    expect(next).toHaveLength(1)
    expect(next[0].blockId).toBe('blk-2')
  })

  test('INSERT 멱등: 이미 있는 blockId 면 추가 안 함', () => {
    const prev = [{ ...baseRow, blockId: 'blk-2', position: 2 }]
    const next = applyRealtimeEvent(prev, { eventType: 'INSERT', new: dbRow() })
    expect(next).toHaveLength(1)
  })

  test('UPDATE: 기존 row 교체', () => {
    const prev = [{ ...baseRow, blockId: 'blk-2', position: 2, textContent: 'old' }]
    const next = applyRealtimeEvent(prev, {
      eventType: 'UPDATE',
      new: dbRow({ text_content: 'new' }),
    })
    expect(next[0].textContent).toBe('new')
  })

  test('UPDATE 시 deleted_at 채워지면 제거 (soft delete)', () => {
    const prev = [{ ...baseRow, blockId: 'blk-2', position: 2 }]
    const next = applyRealtimeEvent(prev, {
      eventType: 'UPDATE',
      new: dbRow({ deleted_at: '2026-04-28T01:00:00Z' }),
    })
    expect(next).toHaveLength(0)
  })

  test('UPDATE 인데 prev 에 없으면 insert (회복)', () => {
    const prev = []
    const next = applyRealtimeEvent(prev, { eventType: 'UPDATE', new: dbRow() })
    expect(next).toHaveLength(1)
    expect(next[0].blockId).toBe('blk-2')
  })

  test('DELETE: hard delete 시 제거', () => {
    const prev = [{ ...baseRow, blockId: 'blk-2', position: 2 }]
    const next = applyRealtimeEvent(prev, {
      eventType: 'DELETE',
      old: dbRow(),
    })
    expect(next).toHaveLength(0)
  })

  test('알 수 없는 eventType 은 무변경', () => {
    const prev = [{ ...baseRow, blockId: 'blk-2' }]
    const next = applyRealtimeEvent(prev, { eventType: 'TRUNCATE' })
    expect(next).toEqual(prev)
  })
})
