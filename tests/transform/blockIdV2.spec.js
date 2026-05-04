// blockIdV2 단위 테스트.

import { describe, test, expect } from 'vitest'
import { newBlockId, isBlockIdV2 } from '../../src/utils/blockIdV2.js'

describe('newBlockId', () => {
  test('UUID 형식 반환', () => {
    const id = newBlockId()
    expect(isBlockIdV2(id)).toBe(true)
  })

  test('100회 호출에서 모두 unique', () => {
    const ids = Array.from({ length: 100 }, () => newBlockId())
    expect(new Set(ids).size).toBe(100)
  })
})

describe('isBlockIdV2', () => {
  test('정규 UUID v4 형식 통과', () => {
    expect(isBlockIdV2('12345678-1234-4234-9234-123456789012')).toBe(true)
  })

  test('v1 의 blk_ prefix 형식은 거절', () => {
    expect(isBlockIdV2('blk_abcd1234')).toBe(false)
  })

  test('빈 문자열 / null / undefined / number 거절', () => {
    expect(isBlockIdV2('')).toBe(false)
    expect(isBlockIdV2(null)).toBe(false)
    expect(isBlockIdV2(undefined)).toBe(false)
    expect(isBlockIdV2(123)).toBe(false)
  })

  test('형식 깨진 UUID 거절', () => {
    expect(isBlockIdV2('not-a-uuid')).toBe(false)
    expect(isBlockIdV2('12345678123412341234123456789012')).toBe(false) // 하이픈 없음
  })
})
