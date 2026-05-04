/**
 * blockId 생성 유틸 (v2 통합 후, 2026-05-01).
 *
 * §3.3 결정에 따라 UUID v4 반환. v1 의 'blk_' prefix 형식은 폐기.
 * daily_blocks 의 uuid 컬럼과 1:1 매핑되며, 다른 ThinkMap PK 와 동일 패턴.
 *
 * v1 코드 (ToggleExtension, toggleNodeFactory, carryOverPipeline, worklogTemplate) 가
 * 이 함수를 그대로 import 하면 자동으로 UUID 를 받게 된다.
 */

export function genBlockId() {
  return crypto.randomUUID()
}

// 호환 — 기존 호출자는 없으나 export 시그니처 보존
export const BLOCK_ID_PREFIX = ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isBlockId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}
