# Daily Blocks 변환 레이어 픽스처

WORKLOG-SPEC.md §3.7 (변환 레이어 인터페이스) 의 round-trip 일치성을 검증하기 위한 시나리오 픽스처 모음. Phase v2.1 의 2단계 산출물.

## 픽스처 형식

각 파일은 다음 구조의 JSON.

```jsonc
{
  "name": "사람이 읽는 시나리오 이름",
  "description": "한 줄 설명 — 무엇이 일어나는지",
  "spec": "WORKLOG-SPEC.md §3.7.4 의 시나리오 번호",

  // 입력
  "ctx": {
    "pageId":   "<UUID>",
    "pageDate": "YYYY-MM-DD",
    "userId":   "<UUID>"
  },
  "prevDoc": null | { "type": "doc", "content": [...] },
  "nextDoc":         { "type": "doc", "content": [...] },

  // 출발 row 상태 (DB 에 이미 있어야 하는 row 들 — UPDATE/softDelete 대상이 됨)
  // prevDoc 과 일치해야 한다 (R3 invariant 의 시작점)
  "initialRows": [],

  // 기대 결과
  "expectedDiff": {
    "insert":     [],
    "update":     [],
    "softDelete": []
  },

  // round-trip 검증 (선택). 명시 시 러너가 추가 검사
  "expectedAfterApply": {
    // 다이프 적용 후의 row 상태가 nextDoc 과 round-trip 으로 일치하는지
    "rows": []
  }
}
```

## ID 사용 규칙

테스트 결정성을 위해 모든 UUID 는 고정 값. 패턴:

| 종류 | 패턴 | 예시 |
|---|---|---|
| 페이지 | `page-XXXX-...` | `page-0001-0000-0000-0000-000000000000` |
| 사용자 | `user-XXXX-...` | `user-0001-0000-0000-0000-000000000000` |
| 블록 | `blk-NNNN-...` | `blk-0001-0000-0000-0000-000000000000` |

UUID v4 의 형식 정규식 (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) 은 만족하지만 v4 식별 비트 (4xxx, [89ab]xxx) 는 픽스처에서는 검사하지 않음 (실제 런타임은 `crypto.randomUUID()` 가 보장).

## 시나리오 목록 (§3.7.4 대응)

| # | 파일 | 시나리오 |
|---|---|---|
| 1 | `01-empty-mount.json` | 새 daily 페이지 첫 마운트 (고정 섹션 4개, todo 0) |
| 2 | `02-add-todo.json` | 사용자가 todo 한 줄 추가 |
| 3 | `03-toggle-checkbox.json` | 체크박스 토글 |
| 4 | `04-carry-over-mount.json` | 이월된 todo 가 들어와 있는 doc 의 첫 마운트 |
| 5 | `05-edit-carried-todo.json` | 이월된 todo 의 textContent 수정 |
| 6 | `06-soft-delete-carried.json` | 이월된 todo 삭제 (재이월 차단) |
| 7 | `07-quicktodo-external-insert.json` | Quick Todo 외부 INSERT 후 다음 마운트 시 doc 재조립 |
| 8 | `08-add-custom-section.json` | 자유 섹션 추가 (worklog_sections + h2 row) |
| 9 | `09-toggle-section-visibility.json` | 섹션 visibility 'all' ↔ 'master' 토글 |
| 10 | `10-nested-toggle.json` | 하위 todo (parent 가 있는 toggle) 추가/이동/삭제 |
| 11 | `11-empty-doc-idempotent.json` | 빈 doc 멱등성 (R2) |

## 검증 규칙 (러너가 적용)

WORKLOG-SPEC.md §3.7.3 의 R1~R7. 픽스처마다 적용되는 규칙은 약간 다름.

| Rule | 적용 |
|---|---|
| R1 결정성 | 모든 픽스처 (러너가 2회 호출 후 결과 비교) |
| R2 변경 없음 | `prevDoc === nextDoc` 인 경우 (예: 픽스처 11) |
| R3 round-trip | `expectedAfterApply.rows` 가 명시된 픽스처 |
| R4 순서 | `blocksToDoc` 결과의 노드 순서 검사 |
| R5 트리 | parent 가 있는 row 의 위치 검사 |
| R6 섹션 자기참조 | `block_type='section'` 인 row 의 section_id == block_id |
| R7 UUID 보존 | UPDATE/이월 시나리오에서 기존 blockId 가 그대로인지 |

## 작성 원칙

- **결정적**: 모든 timestamp 와 UUID 가 고정. 랜덤 요소 없음.
- **최소**: 시나리오 핵심만. 부수적 attrs (created_at, updated_at) 는 fixture 안에서 동일 값 사용.
- **자기설명적**: 다른 문서 참조 없이 픽스처만 보고도 의도가 보이도록.
