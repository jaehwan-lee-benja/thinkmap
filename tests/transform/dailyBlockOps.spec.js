// dailyBlockOps 단위 테스트 — mock Supabase 클라이언트로 호출 패턴 검증.

import { describe, test, expect, vi } from 'vitest'
import {
  fetchBlocks,
  applyDiffToSupabase,
  syncThreadCheckbox,
} from '../../src/utils/dailyBlockOps.js'

// 체이닝 가능한 Supabase mock builder.
// 각 메서드는 자기를 반환하되, 마지막 await 시 fixed result 를 await 가능한 형태로 반환.
function makeMockChain(finalResult) {
  const result = finalResult ?? { data: [], error: null }
  const chain = {
    _calls: [],
    select: vi.fn(function (...args) { this._calls.push(['select', args]); return this }),
    insert: vi.fn(function (...args) { this._calls.push(['insert', args]); return this }),
    upsert: vi.fn(function (...args) { this._calls.push(['upsert', args]); return this }),
    update: vi.fn(function (...args) { this._calls.push(['update', args]); return this }),
    eq: vi.fn(function (...args) { this._calls.push(['eq', args]); return this }),
    in: vi.fn(function (...args) { this._calls.push(['in', args]); return this }),
    is: vi.fn(function (...args) { this._calls.push(['is', args]); return this }),
    or: vi.fn(function (...args) { this._calls.push(['or', args]); return this }),
    gte: vi.fn(function (...args) { this._calls.push(['gte', args]); return this }),
    order: vi.fn(function (...args) { this._calls.push(['order', args]); return this }),
    maybeSingle: vi.fn(function () {
      this._calls.push(['maybeSingle', []])
      return Promise.resolve(result)
    }),
    then: function (onResolve, onReject) {
      return Promise.resolve(result).then(onResolve, onReject)
    },
  }
  return chain
}

function makeSupabase(tablesByName) {
  return {
    from: vi.fn(name => tablesByName[name] || makeMockChain()),
  }
}

describe('fetchBlocks', () => {
  test('pageId 가 비어있으면 빈 배열 반환 (쿼리 호출 없음)', async () => {
    const supabase = { from: vi.fn() }
    const result = await fetchBlocks(supabase, null)
    expect(result).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  test('snake_case 결과를 camelCase 로 변환해서 반환', async () => {
    const dbRow = {
      block_id: 'blk-1',
      page_id: 'page-1',
      page_date: '2026-04-28',
      user_id: 'user-1',
      block_type: 'toggle',
      parent_block_id: null,
      section_id: 'sec-1',
      position: 1,
      text_content: '텍스트',
      rich_content: null,
      is_todo: true,
      todo_checked: false,
      todo_status: 'open',
      is_carry_over: false,
      carry_over_from: null,
      origin_block_id: null,
      is_pinned: false,
      visibility: 'all',
      is_fixed_section: false,
      created_at: '2026-04-28T00:00:00.000Z',
      updated_at: '2026-04-28T00:00:00.000Z',
      deleted_at: null,
    }
    const chain = makeMockChain({ data: [dbRow], error: null })
    const supabase = makeSupabase({ daily_blocks: chain })

    const rows = await fetchBlocks(supabase, 'page-1')

    expect(supabase.from).toHaveBeenCalledWith('daily_blocks')
    expect(rows).toHaveLength(1)
    expect(rows[0].blockId).toBe('blk-1')
    expect(rows[0].isTodo).toBe(true)
    expect(rows[0].deletedAt).toBeNull()
  })

  test('error 발생 시 throw', async () => {
    const chain = makeMockChain({ data: null, error: new Error('boom') })
    const supabase = makeSupabase({ daily_blocks: chain })
    await expect(fetchBlocks(supabase, 'page-1')).rejects.toThrow('boom')
  })
})

describe('applyDiffToSupabase', () => {
  test('빈 diff 는 op 0', async () => {
    const supabase = { from: vi.fn() }
    const result = await applyDiffToSupabase(supabase, { insert: [], update: [], softDelete: [] })
    expect(result).toEqual({ applied: 0 })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  test('insert: rowToDb 변환 후 upsert(onConflict block_id, deleted_at null) 호출', async () => {
    const chain = makeMockChain({ data: null, error: null })
    const supabase = makeSupabase({ daily_blocks: chain })
    const row = {
      blockId: 'blk-1', pageId: 'page-1', pageDate: '2026-04-28', userId: 'user-1',
      blockType: 'toggle', parentBlockId: null, sectionId: 'sec-1', position: 1,
      textContent: 't', richContent: null,
      isTodo: false, todoChecked: false, todoStatus: 'open',
      isCarryOver: false, carryOverFrom: null, originBlockId: null,
      isPinned: false, visibility: 'all', isFixedSection: false,
    }
    await applyDiffToSupabase(supabase, { insert: [row], update: [], softDelete: [] })
    // cross-page 이동 무손실: plain insert 가 아니라 upsert(onConflict: block_id) 로 발사
    const upsertCall = chain._calls.find(c => c[0] === 'upsert')
    expect(upsertCall).toBeDefined()
    expect(upsertCall[1][0][0].block_id).toBe('blk-1')
    expect(upsertCall[1][0][0]).not.toHaveProperty('blockId')
    expect(upsertCall[1][0][0].deleted_at).toBeNull()   // revive — 이동 시 소스 soft-delete 잔재 무효화
    expect(upsertCall[1][1]).toEqual({ onConflict: 'block_id' })
  })

  test('update: 각 patch 마다 update().eq() 호출', async () => {
    const chain = makeMockChain({ data: null, error: null })
    const supabase = makeSupabase({ daily_blocks: chain })
    await applyDiffToSupabase(supabase, {
      insert: [],
      update: [
        { blockId: 'blk-1', patch: { todoChecked: true, todoStatus: 'done' } },
        { blockId: 'blk-2', patch: { visibility: 'master' } },
      ],
      softDelete: [],
    })
    const updateCalls = chain._calls.filter(c => c[0] === 'update')
    expect(updateCalls).toHaveLength(2)
    expect(updateCalls[0][1][0]).toEqual({ todo_checked: true, todo_status: 'done' })
    expect(updateCalls[1][1][0]).toEqual({ visibility: 'master' })

    const eqCalls = chain._calls.filter(c => c[0] === 'eq')
    expect(eqCalls.map(c => c[1])).toEqual([
      ['block_id', 'blk-1'],
      ['block_id', 'blk-2'],
    ])
  })

  test('softDelete: 한 번의 update + in 호출', async () => {
    const chain = makeMockChain({ data: null, error: null })
    const supabase = makeSupabase({ daily_blocks: chain })
    await applyDiffToSupabase(supabase, {
      insert: [], update: [],
      softDelete: ['blk-1', 'blk-2'],
    })
    const updateCall = chain._calls.find(c => c[0] === 'update')
    expect(updateCall[1][0]).toHaveProperty('deleted_at')
    const inCall = chain._calls.find(c => c[0] === 'in')
    expect(inCall[1]).toEqual(['block_id', ['blk-1', 'blk-2']])
  })

  test('insert/update/softDelete 가 함께 있으면 모두 발사', async () => {
    const chain = makeMockChain({ data: null, error: null })
    const supabase = makeSupabase({ daily_blocks: chain })
    const row = {
      blockId: 'blk-x', pageId: 'p', pageDate: '2026-04-28', userId: 'u',
      blockType: 'toggle', parentBlockId: null, sectionId: 's', position: 1,
      textContent: 't', richContent: null,
      isTodo: false, todoChecked: false, todoStatus: 'open',
      isCarryOver: false, carryOverFrom: null, originBlockId: null,
      isPinned: false, visibility: 'all', isFixedSection: false,
    }
    await applyDiffToSupabase(supabase, {
      insert: [row],
      update: [{ blockId: 'blk-1', patch: { todoChecked: true } }],
      softDelete: ['blk-2'],
    })
    expect(chain._calls.some(c => c[0] === 'upsert')).toBe(true)
    expect(chain._calls.filter(c => c[0] === 'update').length).toBeGreaterThanOrEqual(2)
    expect(chain._calls.some(c => c[0] === 'in')).toBe(true)
  })
})

describe('syncThreadCheckbox', () => {
  test('blockId 가 비어있으면 affected 0', async () => {
    const supabase = { from: vi.fn() }
    const result = await syncThreadCheckbox(supabase, null, true)
    expect(result).toEqual({ affected: 0 })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  test('anchor 가 없으면 affected 0', async () => {
    const anchorChain = makeMockChain({ data: null, error: null })
    const supabase = makeSupabase({ daily_blocks: anchorChain })
    const result = await syncThreadCheckbox(supabase, 'blk-x', true)
    expect(result).toEqual({ affected: 0 })
  })

  // 세 단계 호출 (anchor 조회 + block_id update + origin_block_id update).
  test('anchor 조회 후 block_id / origin_block_id 두 번 UPDATE — thread 전체 매칭', async () => {
    let stage = 0
    const anchorResult = {
      data: { block_id: 'blk-curr', origin_block_id: 'blk-origin' },
      error: null,
    }
    const updateAResult = {  // block_id 매칭
      data: [{ block_id: 'blk-origin', page_id: 'p1' }],
      error: null,
    }
    const updateBResult = {  // origin_block_id 매칭
      data: [{ block_id: 'blk-curr', page_id: 'p2' }, { block_id: 'blk-other', page_id: 'p3' }],
      error: null,
    }
    const chain1 = makeMockChain(anchorResult)
    const chain2 = makeMockChain(updateAResult)
    const chain3 = makeMockChain(updateBResult)
    const chains = [chain1, chain2, chain3]
    const supabase = {
      from: vi.fn(() => chains[stage++]),
    }

    const result = await syncThreadCheckbox(supabase, 'blk-curr', true)

    expect(result.affected).toBe(3)
    expect(result.threadId).toBe('blk-origin')
    expect(result.affectedPages).toEqual(expect.arrayContaining(['p1', 'p2', 'p3']))

    // 두 번째 chain (block_id UPDATE) 검증
    const updateCallA = chain2._calls.find(c => c[0] === 'update')
    expect(updateCallA[1][0]).toEqual({ todo_checked: true, todo_status: 'done' })
    const eqCallA = chain2._calls.find(c => c[0] === 'eq' && c[1][0] === 'block_id')
    expect(eqCallA[1][1]).toBe('blk-origin')

    // 세 번째 chain (origin_block_id UPDATE) 검증
    const updateCallB = chain3._calls.find(c => c[0] === 'update')
    expect(updateCallB[1][0]).toEqual({ todo_checked: true, todo_status: 'done' })
    const eqCallB = chain3._calls.find(c => c[0] === 'eq' && c[1][0] === 'origin_block_id')
    expect(eqCallB[1][1]).toBe('blk-origin')
  })
})
