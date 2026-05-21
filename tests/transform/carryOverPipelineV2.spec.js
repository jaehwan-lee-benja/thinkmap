// carryOverPipelineV2 단위 테스트 — pure 부분 위주.

import { describe, test, expect } from 'vitest'
import {
  selectCarryOverCandidates,
  filterRootCandidates,
  filterNewThreads,
  toCarryOverRow,
  toCarryOverSubtree,
  buildSectionIdMap,
} from '../../src/utils/carryOverPipelineV2.js'

const baseRow = {
  blockId: 'src-1',
  pageId: 'page-prev',
  pageDate: '2026-04-27',
  userId: 'user-1',
  blockType: 'toggle',
  parentBlockId: null,
  sectionId: 'sec-1',
  position: 1,
  textContent: '할일',
  richContent: null,
  isTodo: true,
  todoChecked: false,
  todoStatus: 'open',
  isCarryOver: false,
  carryOverFrom: null,
  originBlockId: null,
  isPinned: false,
  visibility: 'all',
  isFixedSection: false,
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z',
  deletedAt: null,
}

const ctx = {
  pageId: 'page-curr',
  pageDate: '2026-04-28',
  userId: 'user-1',
}

describe('selectCarryOverCandidates', () => {
  test('미완료 todo + 일반 텍스트 토글 모두 추출 (전부완료 todo 만 제외)', () => {
    const rows = [
      { ...baseRow, blockId: 'a', isTodo: true,  todoChecked: false },  // 미완료 todo
      { ...baseRow, blockId: 'b', isTodo: true,  todoChecked: true },   // 전부완료 todo (자손 없음) — 제외
      { ...baseRow, blockId: 'c', isTodo: false },                      // 일반 텍스트
    ]
    const result = selectCarryOverCandidates(rows)
    expect(result.map(r => r.blockId).sort()).toEqual(['a', 'c'])
  })

  test('완료 todo + 하위 미완료 todo 존재 → 후보 유지 (완료유지 이월) — CARRY-OVER-MAP §1', () => {
    const rows = [
      { ...baseRow, blockId: 'p', isTodo: true, todoChecked: true, textContent: '완료 부모' },
      { ...baseRow, blockId: 'c', parentBlockId: 'p', isTodo: true, todoChecked: false, textContent: '미완료 자식' },
    ]
    const result = selectCarryOverCandidates(rows)
    expect(result.map(r => r.blockId).sort()).toEqual(['c', 'p'])
  })

  test('완료 todo + 손자 미완료 → 후보 유지 (서브트리 재귀 탐색)', () => {
    const rows = [
      { ...baseRow, blockId: 'p',  isTodo: true, todoChecked: true,  textContent: '완료 root' },
      { ...baseRow, blockId: 'c',  parentBlockId: 'p', isTodo: true, todoChecked: true, textContent: '완료 자식' },
      { ...baseRow, blockId: 'g',  parentBlockId: 'c', isTodo: true, todoChecked: false, textContent: '미완료 손자' },
    ]
    const result = selectCarryOverCandidates(rows)
    expect(result.map(r => r.blockId).sort()).toEqual(['c', 'g', 'p'])
  })

  test('전부완료 todo (서브트리 전체 완료) → 제외', () => {
    const rows = [
      { ...baseRow, blockId: 'p', isTodo: true, todoChecked: true, textContent: 'p' },
      { ...baseRow, blockId: 'c', parentBlockId: 'p', isTodo: true, todoChecked: true, textContent: 'c' },
    ]
    expect(selectCarryOverCandidates(rows)).toEqual([])
  })

  test('isPinned 는 v2 에서 무시 — 일반 텍스트는 isPinned 와 무관하게 모두 이월', () => {
    const rows = [
      { ...baseRow, blockId: 'a', isTodo: false, isPinned: true },
      { ...baseRow, blockId: 'b', isTodo: false, isPinned: false },
    ]
    // 일반 텍스트 토글 둘 다 이월 (isPinned 와 무관)
    expect(selectCarryOverCandidates(rows).map(r => r.blockId).sort()).toEqual(['a', 'b'])
  })

  test('isPinned 가 true 여도 전부완료 todo 는 후보 아님 (todoChecked 가 우선)', () => {
    const rows = [
      { ...baseRow, blockId: 'a', isTodo: true, todoChecked: true, isPinned: true },
    ]
    expect(selectCarryOverCandidates(rows)).toEqual([])
  })

  test('deleted_at 은 제외', () => {
    const rows = [
      { ...baseRow, blockId: 'a', isTodo: true, todoChecked: false, deletedAt: '2026-04-27T01:00:00Z' },
    ]
    expect(selectCarryOverCandidates(rows)).toEqual([])
  })

  test('빈 배열 / null', () => {
    expect(selectCarryOverCandidates([])).toEqual([])
    expect(selectCarryOverCandidates(null)).toEqual([])
  })

  test('textContent 가 비어있는 미완료 todo 는 후보 아님 (빈 자식 토글 제외)', () => {
    const rows = [
      { ...baseRow, blockId: 'a', isTodo: true, todoChecked: false, textContent: '' },
      { ...baseRow, blockId: 'b', isTodo: true, todoChecked: false, textContent: '   ' },
    ]
    expect(selectCarryOverCandidates(rows)).toEqual([])
  })

  test('isPinned 가 true 여도 todo 가 아니면 후보 아님', () => {
    const rows = [
      { ...baseRow, blockId: 'p', isTodo: false, isPinned: true, textContent: '' },
    ]
    expect(selectCarryOverCandidates(rows)).toEqual([])
  })
})

describe('filterNewThreads', () => {
  test('현재 페이지에 같은 thread 가 있으면 skip', () => {
    const candidates = [
      { ...baseRow, blockId: 'src-1', originBlockId: null },
      { ...baseRow, blockId: 'src-2', originBlockId: 'origin-x' },
    ]
    const currentPageRows = [
      // 현재 페이지에 이미 src-1 의 이월본이 있음 (origin = src-1)
      { ...baseRow, blockId: 'curr-a', originBlockId: 'src-1' },
    ]
    const result = filterNewThreads(candidates, currentPageRows)
    expect(result.map(r => r.blockId)).toEqual(['src-2'])
  })

  test('soft deleted 도 차단 (재이월 차단, §3.2.2)', () => {
    const candidates = [
      { ...baseRow, blockId: 'src-1' },
    ]
    const currentPageRows = [
      // 사용자가 의도적으로 지운 row — deletedAt 채워져 있음
      { ...baseRow, blockId: 'curr-a', originBlockId: 'src-1', deletedAt: '2026-04-28T01:00:00Z' },
    ]
    const result = filterNewThreads(candidates, currentPageRows)
    expect(result).toEqual([])
  })

  test('현재 페이지에 thread 가 없으면 모두 통과', () => {
    const candidates = [
      { ...baseRow, blockId: 'src-1' },
      { ...baseRow, blockId: 'src-2' },
    ]
    expect(filterNewThreads(candidates, [])).toEqual(candidates)
  })

  test('candidates 의 originBlockId 가 있으면 그것을 thread key 로', () => {
    const candidates = [
      // 이미 한 번 이월된 row (origin 이 따로 있음)
      { ...baseRow, blockId: 'src-1', originBlockId: 'true-origin' },
    ]
    const currentPageRows = [
      // 현재 페이지에 같은 true-origin 의 이월본
      { ...baseRow, blockId: 'curr-a', originBlockId: 'true-origin' },
    ]
    expect(filterNewThreads(candidates, currentPageRows)).toEqual([])
  })
})

describe('toCarryOverRow', () => {
  test('blockId 재발급, originBlockId 승계', () => {
    const result = toCarryOverRow(baseRow, ctx)
    expect(result.blockId).not.toBe(baseRow.blockId)
    expect(result.originBlockId).toBe(baseRow.blockId)
  })

  test('이미 이월본인 src 의 originBlockId 는 그대로 승계 (최초 원본 추적)', () => {
    const src = { ...baseRow, originBlockId: 'true-origin' }
    const result = toCarryOverRow(src, ctx)
    expect(result.originBlockId).toBe('true-origin')
  })

  test('isCarryOver=true, carryOverFrom = 원본 page_date', () => {
    const result = toCarryOverRow(baseRow, ctx)
    expect(result.isCarryOver).toBe(true)
    expect(result.carryOverFrom).toBe('2026-04-27')
  })

  test('isTodo todo 는 미완료 상태로 reset', () => {
    const src = { ...baseRow, isTodo: true, todoChecked: true, todoStatus: 'done' }
    const result = toCarryOverRow(src, ctx)
    expect(result.todoChecked).toBe(false)
    expect(result.todoStatus).toBe('open')
  })

  test('todo 가 아니면 todoChecked 그대로', () => {
    const src = { ...baseRow, isTodo: false, todoChecked: true }
    const result = toCarryOverRow(src, ctx)
    expect(result.todoChecked).toBe(true)
  })

  test('ctx 의 pageId / pageDate / userId 가 박힘', () => {
    const result = toCarryOverRow(baseRow, ctx)
    expect(result.pageId).toBe('page-curr')
    expect(result.pageDate).toBe('2026-04-28')
    expect(result.userId).toBe('user-1')
  })

  test('parentBlockId 는 null (현재 트리 평탄화 정책)', () => {
    const src = { ...baseRow, parentBlockId: 'some-parent' }
    const result = toCarryOverRow(src, ctx)
    expect(result.parentBlockId).toBeNull()
  })

  test('sectionId / textContent / richContent 보존', () => {
    const src = {
      ...baseRow,
      sectionId: 'sec-X',
      textContent: '구체 텍스트',
      richContent: [{ type: 'paragraph', content: [{ type: 'text', text: '구체 텍스트' }] }],
    }
    const result = toCarryOverRow(src, ctx)
    expect(result.sectionId).toBe('sec-X')
    expect(result.textContent).toBe('구체 텍스트')
    expect(result.richContent).toEqual(src.richContent)
  })

  test('isFixedSection 은 항상 false (이월된 섹션 row 는 없음)', () => {
    const src = { ...baseRow, isFixedSection: true }
    const result = toCarryOverRow(src, ctx)
    expect(result.isFixedSection).toBe(false)
  })

  test('재이월 시 carryOverFrom 은 최초 원본 날짜 보존', () => {
    const src = {
      ...baseRow,
      isCarryOver: true,
      carryOverFrom: '2026-04-26',  // 최초 원본 (이미 한 번 이월됨)
      pageDate: '2026-04-27',       // 직전 페이지
    }
    const result = toCarryOverRow(src, ctx)
    // 최초 날짜 그대로 (사용자가 todo 가 처음 만들어진 시점 추적)
    expect(result.carryOverFrom).toBe('2026-04-26')
  })

  test('새 이월 (carryOverFrom 없음) 은 src 의 pageDate', () => {
    const src = { ...baseRow, isCarryOver: false, carryOverFrom: null, pageDate: '2026-04-27' }
    const result = toCarryOverRow(src, ctx)
    expect(result.carryOverFrom).toBe('2026-04-27')
  })
})

describe('filterRootCandidates', () => {
  test('부모/자식 모두 후보면 부모만 남음', () => {
    const parent = { ...baseRow, blockId: 'p1', parentBlockId: 'sec1' }
    const child  = { ...baseRow, blockId: 'c1', parentBlockId: 'p1' }
    expect(filterRootCandidates([parent, child]).map(r => r.blockId)).toEqual(['p1'])
  })

  test('부모가 후보 아니면 자식이 root 로 남음 (완료된 부모 + 미완료 자식)', () => {
    // candidates 에는 자식만 들어와 있다 (부모는 selectCarryOverCandidates 에서 걸러짐)
    const child = { ...baseRow, blockId: 'c1', parentBlockId: 'p1-non-candidate' }
    expect(filterRootCandidates([child])).toEqual([child])
  })

  test('형제 todo 들 — 모두 root', () => {
    const a = { ...baseRow, blockId: 'a', parentBlockId: 'sec1' }
    const b = { ...baseRow, blockId: 'b', parentBlockId: 'sec1' }
    expect(filterRootCandidates([a, b]).map(r => r.blockId)).toEqual(['a', 'b'])
  })

  test('parentBlockId null 인 후보는 항상 root', () => {
    const r = { ...baseRow, blockId: 'r1', parentBlockId: null }
    expect(filterRootCandidates([r])).toEqual([r])
  })

  test('빈 / null 입력', () => {
    expect(filterRootCandidates([])).toEqual([])
    expect(filterRootCandidates(null)).toEqual([])
  })
})

describe('toCarryOverSubtree', () => {
  // 어제 페이지의 트리:
  //   p1 (미완료 todo, sec1 자식)
  //   ├── c1 (자식 todo)
  //   │   └── g1 (손자 todo)
  //   └── c2 (자식 todo)
  const p1 = { ...baseRow, blockId: 'p1', parentBlockId: 'sec1', sectionId: 'sec1', position: 1 }
  const c1 = { ...baseRow, blockId: 'c1', parentBlockId: 'p1', sectionId: 'sec1', position: 1, textContent: 'c1' }
  const c2 = { ...baseRow, blockId: 'c2', parentBlockId: 'p1', sectionId: 'sec1', position: 2, textContent: 'c2' }
  const g1 = { ...baseRow, blockId: 'g1', parentBlockId: 'c1', sectionId: 'sec1', position: 1, textContent: 'g1' }
  const allRows = [p1, c1, c2, g1]

  test('root + 자손이 모두 변환됨', () => {
    const result = toCarryOverSubtree(p1, allRows, ctx)
    expect(result).toHaveLength(4)
    const texts = result.map(r => r.textContent)
    expect(texts).toEqual(expect.arrayContaining(['할일', 'c1', 'c2', 'g1']))
  })

  test('root 의 parentBlockId 는 null (트리는 새 페이지의 root 자식으로)', () => {
    const result = toCarryOverSubtree(p1, allRows, ctx)
    expect(result[0].parentBlockId).toBeNull()
  })

  test('자손의 parentBlockId 는 새 blockId 매핑으로 갱신', () => {
    const result = toCarryOverSubtree(p1, allRows, ctx)
    const newRoot = result[0]
    const newC1 = result.find(r => r.textContent === 'c1')
    const newG1 = result.find(r => r.textContent === 'g1')
    expect(newC1.parentBlockId).toBe(newRoot.blockId)
    expect(newG1.parentBlockId).toBe(newC1.blockId)
  })

  test('모든 row 의 blockId 는 새로 발급 (원본과 다름)', () => {
    const result = toCarryOverSubtree(p1, allRows, ctx)
    const oldIds = new Set(['p1', 'c1', 'c2', 'g1'])
    for (const r of result) {
      expect(oldIds.has(r.blockId)).toBe(false)
    }
  })

  test('각 row 의 originBlockId 는 자기 자신의 원본 thread', () => {
    const result = toCarryOverSubtree(p1, allRows, ctx)
    expect(result.find(r => r.textContent === '할일').originBlockId).toBe('p1')
    expect(result.find(r => r.textContent === 'c1').originBlockId).toBe('c1')
    expect(result.find(r => r.textContent === 'g1').originBlockId).toBe('g1')
  })

  test('미완료 root todo 는 미완료 그대로 (새 페이지에서 시작)', () => {
    const lonely = { ...baseRow, blockId: 'r1', parentBlockId: null, isTodo: true, todoChecked: false }
    const result = toCarryOverSubtree(lonely, [lonely], ctx)
    expect(result[0].todoChecked).toBe(false)
    expect(result[0].todoStatus).toBe('open')
  })

  test('완료 root todo + 미완료 자손 → root 의 todoChecked 유지 (완료유지 이월)', () => {
    // 어제: 프로젝트A(완료) ─ 기획(완료) ─ 검토(미완료)
    const proj = { ...baseRow, blockId: 'proj', parentBlockId: null, isTodo: true, todoChecked: true, todoStatus: 'done', textContent: '프로젝트A' }
    const plan = { ...baseRow, blockId: 'plan', parentBlockId: 'proj', isTodo: true, todoChecked: true, todoStatus: 'done', textContent: '기획' }
    const review = { ...baseRow, blockId: 'rev', parentBlockId: 'plan', isTodo: true, todoChecked: false, textContent: '검토' }

    const result = toCarryOverSubtree(proj, [proj, plan, review], ctx)
    const newProj = result.find(r => r.textContent === '프로젝트A')
    const newPlan = result.find(r => r.textContent === '기획')
    const newRev  = result.find(r => r.textContent === '검토')
    expect(newProj.todoChecked).toBe(true)
    expect(newProj.todoStatus).toBe('done')
    expect(newPlan.todoChecked).toBe(true)
    expect(newRev.todoChecked).toBe(false)
  })

  test('전부완료 자손 todo (하위 미완료 없음) 은 이월 대상에서 제외 — CARRY-OVER-MAP §1', () => {
    // p1(미완료) ─ c1(완료, 자손 없음)
    const completedC = { ...c1, todoChecked: true, todoStatus: 'done' }
    const result = toCarryOverSubtree(p1, [p1, completedC], ctx)
    const texts = result.map(r => r.textContent)
    expect(texts).not.toContain('c1')
    expect(texts).toEqual(['할일'])  // root 만 남음
  })

  test('완료 자손 todo 라도 하위에 미완료가 있으면 완료유지한 채 이월', () => {
    // p1(미완료) ─ c1(완료) ─ g1(미완료)
    const completedC1 = { ...c1, todoChecked: true, todoStatus: 'done' }
    const result = toCarryOverSubtree(p1, [p1, completedC1, g1], ctx)
    const newC = result.find(r => r.textContent === 'c1')
    const newG = result.find(r => r.textContent === 'g1')
    expect(newC).toBeDefined()
    expect(newC.todoChecked).toBe(true)
    expect(newC.todoStatus).toBe('done')
    expect(newG).toBeDefined()
    expect(newG.todoChecked).toBe(false)
  })

  test('미완료 자손 todo 는 원본 todoChecked 그대로 (자손 reset 없음)', () => {
    // p1(미완료) ─ c1(미완료)
    const result = toCarryOverSubtree(p1, [p1, c1], ctx)
    const newC = result.find(r => r.textContent === 'c1')
    expect(newC.todoChecked).toBe(false)
    expect(newC.todoStatus).toBe('open')
  })

  test('완료 자손 형제 중 미완료 있는 가지만 남고 전부완료 가지는 제거됨', () => {
    // p1(미완료)
    //   ├─ c1(완료) ─ g1(미완료)   ← 유지 (완료유지)
    //   └─ c2(완료, 자손 없음)      ← 제거
    const completedC1 = { ...c1, todoChecked: true, todoStatus: 'done' }
    const completedC2 = { ...c2, todoChecked: true, todoStatus: 'done' }
    const result = toCarryOverSubtree(p1, [p1, completedC1, completedC2, g1], ctx)
    const texts = result.map(r => r.textContent)
    expect(texts).toContain('c1')
    expect(texts).toContain('g1')
    expect(texts).not.toContain('c2')
  })

  test('soft-deleted 자손은 끌고 오지 않음', () => {
    const deletedC = { ...c1, deletedAt: '2026-04-27T01:00:00Z' }
    const result = toCarryOverSubtree(p1, [p1, deletedC, c2, g1], ctx)
    // c1 이 deleted 면 그 자손 g1 도 제외되어야 함
    const texts = result.map(r => r.textContent)
    expect(texts).not.toContain('c1')
    expect(texts).not.toContain('g1')
    expect(texts).toEqual(expect.arrayContaining(['할일', 'c2']))
  })

  test('자손 순서: position asc 로 보존', () => {
    const c2first = { ...c2, position: 0 }
    const c1second = { ...c1, position: 1 }
    const result = toCarryOverSubtree(p1, [p1, c1second, c2first], ctx)
    const childTexts = result.slice(1).map(r => r.textContent)
    expect(childTexts).toEqual(['c2', 'c1'])
  })

  test('isCarryOver=true 가 모든 row 에 박힘', () => {
    const result = toCarryOverSubtree(p1, allRows, ctx)
    for (const r of result) {
      expect(r.isCarryOver).toBe(true)
      expect(r.carryOverFrom).toBe('2026-04-27')
    }
  })

  test('자손이 없으면 root 1개만 반환', () => {
    const lonely = { ...baseRow, blockId: 'lonely', parentBlockId: null }
    const result = toCarryOverSubtree(lonely, [lonely], ctx)
    expect(result).toHaveLength(1)
    expect(result[0].parentBlockId).toBeNull()
  })

  test('sectionIdMap 적용 시 sectionId 가 새 페이지 섹션 blockId 로 매핑됨 (§9.9)', () => {
    const root = { ...baseRow, blockId: 'r1', parentBlockId: null, sectionId: 'old-section-todo' }
    const child = { ...baseRow, blockId: 'c1', parentBlockId: 'r1', sectionId: 'old-section-todo' }
    const sectionIdMap = new Map([['old-section-todo', 'new-section-todo']])
    const result = toCarryOverSubtree(root, [root, child], ctx, sectionIdMap)
    for (const r of result) {
      expect(r.sectionId).toBe('new-section-todo')
    }
  })

  test('sectionIdMap 에 없는 sectionId 는 그대로', () => {
    const root = { ...baseRow, blockId: 'r1', parentBlockId: null, sectionId: 'unknown-sec' }
    const result = toCarryOverSubtree(root, [root], ctx, new Map())
    expect(result[0].sectionId).toBe('unknown-sec')
  })
})

describe('buildSectionIdMap', () => {
  test('master_id 가 같은 어제↔오늘 section row 매핑', () => {
    const prev = [
      { blockType: 'section', blockId: 'old-todo',   sectionMasterId: 'fixed_todo' },
      { blockType: 'section', blockId: 'old-notice', sectionMasterId: 'fixed_notice' },
    ]
    const curr = [
      { blockType: 'section', blockId: 'new-todo',   sectionMasterId: 'fixed_todo' },
      { blockType: 'section', blockId: 'new-notice', sectionMasterId: 'fixed_notice' },
    ]
    const map = buildSectionIdMap(prev, curr)
    expect(map.get('old-todo')).toBe('new-todo')
    expect(map.get('old-notice')).toBe('new-notice')
  })

  test('section 외 row 는 무시', () => {
    const prev = [
      { blockType: 'section', blockId: 'sec-old', sectionMasterId: 'm1' },
      { blockType: 'toggle',  blockId: 'tog-old', sectionMasterId: null },
    ]
    const curr = [
      { blockType: 'section', blockId: 'sec-new', sectionMasterId: 'm1' },
    ]
    const map = buildSectionIdMap(prev, curr)
    expect(map.size).toBe(1)
    expect(map.get('sec-old')).toBe('sec-new')
  })

  test('새 페이지에 같은 master 가 없으면 매핑 안 됨', () => {
    const prev = [{ blockType: 'section', blockId: 'sec-old', sectionMasterId: 'orphan-master' }]
    const curr = []
    const map = buildSectionIdMap(prev, curr)
    expect(map.size).toBe(0)
  })

  test('빈 / null 입력', () => {
    expect(buildSectionIdMap([], []).size).toBe(0)
    expect(buildSectionIdMap(null, null).size).toBe(0)
  })
})
