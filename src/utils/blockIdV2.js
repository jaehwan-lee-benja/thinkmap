// v2 blockId 발급 단일 진입점. WORKLOG-SPEC.md §3.3, §9.5.
//
// PG `uuid` 타입과 1:1 매핑되는 UUID v4 생성.
// v1 의 `'blk_' + 8자 base36` 형식은 v2 출범 시 폐기. v1 코드가 살아있는 동안은
// `blockId.js` 가 그대로 사용되고, v2 코드는 본 모듈을 사용.

export function newBlockId() {
  return crypto.randomUUID()
}

// 형식 검사 — UUID v4 (또는 v1~5 까지 형식상 호환). DB 가 PK 강제하므로 정확성은 DB 가 보장.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isBlockIdV2(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}
