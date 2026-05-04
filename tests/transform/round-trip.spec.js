// 변환 레이어 round-trip 테스트 러너. WORKLOG-SPEC.md §3.7.3 (R1~R7).
//
// Phase v2.1 단계:
//   - 2단계: 이 러너를 작성. 변환 레이어가 stub 이라 모든 테스트 fail (정상).
//   - 4단계: 변환 레이어 구현. fail 이 점진적으로 pass 로 전환.
//
// 픽스처마다 명시된 rules 배열만 검사. R1~R7 의 의미는 §3.7.3 참조.

import { describe, test, expect } from 'vitest'
import { listFixtures, loadFixture } from './loadFixture.js'
import { blocksToDoc, docsEqual } from '../../src/utils/blocksToDoc.js'
import { docToBlocks } from '../../src/utils/docToBlocks.js'

const FIXTURES = listFixtures()

describe('변환 레이어 round-trip (Phase v2.1 §3.7.3)', () => {
  for (const file of FIXTURES) {
    const fx = loadFixture(file)
    const rules = new Set(fx.rules || [])

    describe(`${file} — ${fx.name}`, () => {
      // R1: blocksToDoc 결정성
      test.runIf(rules.has('R1'))(
        'R1 결정성 — blocksToDoc 두 번 호출 결과 동일',
        () => {
          const a = blocksToDoc(fx.initialRows)
          const b = blocksToDoc(fx.initialRows)
          expect(a).toEqual(b)
        }
      )

      // R1 추가: blocksToDoc 결과가 expectedDocFromBlocks 와 일치
      test.runIf(rules.has('R1') && fx.expectedDocFromBlocks)(
        'R1 정확성 — blocksToDoc 결과가 expectedDocFromBlocks 와 일치',
        () => {
          const result = blocksToDoc(fx.initialRows)
          expect(result).toEqual(fx.expectedDocFromBlocks)
        }
      )

      // R2: 변경 없음 검출 (prev === next 일 때 모든 카테고리 비어있음)
      test.runIf(rules.has('R2'))(
        'R2 변경 없음 — docToBlocks(prev, prev) 의 diff 가 전부 빈 배열',
        () => {
          const diff = docToBlocks(fx.prevDoc, fx.prevDoc, fx.ctx)
          expect(diff.insert).toEqual([])
          expect(diff.update).toEqual([])
          expect(diff.softDelete).toEqual([])
        }
      )

      // expectedDiff 검증 (모든 픽스처)
      test('docToBlocks(prev, next, ctx) 가 expectedDiff 와 일치', () => {
        const diff = docToBlocks(fx.prevDoc, fx.nextDoc, fx.ctx)

        // insert: 순서 무관 비교. blockId 로 정렬 후 동등성.
        const sortByBlockId = arr => [...arr].sort((a, b) => a.blockId.localeCompare(b.blockId))
        // expectedDiff.insert 의 row 에는 createdAt/updatedAt 이 없을 수 있음 (런타임이 채움)
        // → patch 동등성은 expected 의 키만 비교
        const stripTimestamps = row => {
          const { createdAt, updatedAt, ...rest } = row
          void createdAt
          void updatedAt
          return rest
        }
        expect(sortByBlockId(diff.insert).map(stripTimestamps))
          .toEqual(sortByBlockId(fx.expectedDiff.insert).map(stripTimestamps))

        expect(sortByBlockId(diff.update)).toEqual(sortByBlockId(fx.expectedDiff.update))
        expect([...diff.softDelete].sort()).toEqual([...fx.expectedDiff.softDelete].sort())
      })

      // R3: round-trip 일치 (별도 테스트로, expectedAfterApply 가 명시된 경우만)
      test.runIf(rules.has('R3') && fx.expectedAfterApply)(
        'R3 round-trip — diff 적용 후 row 를 다시 doc 으로 만들면 nextDoc 과 일치',
        () => {
          const result = blocksToDoc(fx.expectedAfterApply.rows)
          expect(docsEqual(result, fx.nextDoc)).toBe(true)
        }
      )

      // R6: 섹션 자기참조 (block_type='section' 인 row 의 sectionId == blockId)
      test.runIf(rules.has('R6'))(
        'R6 섹션 자기참조 — block_type=section 인 row 는 sectionId === blockId',
        () => {
          const sections = fx.initialRows.filter(r => r.blockType === 'section')
          for (const s of sections) {
            expect(s.sectionId).toBe(s.blockId)
          }
          const insertedSections = (fx.expectedDiff.insert || []).filter(r => r.blockType === 'section')
          for (const s of insertedSections) {
            expect(s.sectionId).toBe(s.blockId)
          }
        }
      )
    })
  }
})

describe('픽스처 sanity checks (러너 자체 검증)', () => {
  test('픽스처 모두 로드됨 (최소 11개)', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(11)
  })

  test('모든 픽스처에 ctx, prevDoc, nextDoc, expectedDiff 가 있음', () => {
    for (const file of FIXTURES) {
      const fx = loadFixture(file)
      expect(fx.ctx).toBeDefined()
      expect(fx.prevDoc).toBeDefined()
      expect(fx.nextDoc).toBeDefined()
      expect(fx.expectedDiff).toBeDefined()
      expect(Array.isArray(fx.expectedDiff.insert)).toBe(true)
      expect(Array.isArray(fx.expectedDiff.update)).toBe(true)
      expect(Array.isArray(fx.expectedDiff.softDelete)).toBe(true)
    }
  })
})
