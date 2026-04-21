/**
 * blockId / originBlockId 생성 유틸
 * 포맷: 'blk_' + base36 난수 8자
 * 이월 체인 추적(original 블록 → 이월본)의 핵심 식별자
 */

export const BLOCK_ID_PREFIX = 'blk_'

export function genBlockId() {
  return BLOCK_ID_PREFIX + Math.random().toString(36).slice(2, 10)
}

export function isBlockId(value) {
  return typeof value === 'string' && value.startsWith(BLOCK_ID_PREFIX)
}
