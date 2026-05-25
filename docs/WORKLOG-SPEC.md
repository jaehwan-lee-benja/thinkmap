# 업무일지 리팩토링 기획서 v2 (WorkLog Refactor — Per-Todo Row Model)

> 🆕 **신규 버전 (v2)** — JSON 통째 저장 → 개별 todo row 모델로 전환하는 리팩토링 기획서이자 신규 기능명세서.
>
> 이전 버전은 [WORKLOG-SPEC.v1.md](./WORKLOG-SPEC.v1.md) 참조 (Phase 1~6 완료 시점 스냅샷, 2026-04-23 기준).
>
> 작성일: 2026-04-28
> 작성자: jaehwan-lee-benja
> 상태: **기획 (구현 미착수)**
> 상위 컨텍스트: [ARCHITECTURE.md](./ARCHITECTURE.md) — ThinkMap 의 두 plane(Documents / Structured Data) 안에서 업무일지 v2 가 **Structured Data plane 의 첫 도메인**임을 정의한다. 이 리팩토링은 단일 기능 정리를 넘어, 향후 회계·물자 등 동일 plane 의 후속 도메인이 따를 패턴의 출발점.
>
> 관련 문서: [TOGGLE-BLOCK-SPEC.md](./TOGGLE-BLOCK-SPEC.md), [CARRY-OVER-MAP.md](./CARRY-OVER-MAP.md), [DESIGN-PHILOSOPHY.md](./DESIGN-PHILOSOPHY.md)
>
> 📌 **중요 결정 (2026-04-28)**: 기존 daily/calendar 페이지 데이터는 **모두 더미였으며 v2 착수 직전 전부 폐기**. 따라서 이 기획서는 **마이그레이션 없는 깨끗한 시작**을 전제로 한다. 듀얼라이트·백필·일치성 검증 단계가 모두 제거되었다.

---

## 0. TL;DR

- **현재 (v1)**: 하루치 업무일지 본문 전체를 `pages.content_tiptap` JSONB 한 컬럼에 통째로 직렬화. 모든 todo·섹션·이월 메타가 그 안의 TipTap node tree 에 인코딩됨.
- **문제**: 부분 업데이트 불가 → autosave race, `_dismissed` 유실 위험. todo 단위 쿼리/인덱싱 불가 → 검색·통계·todo 코멘트 모두 막힘. 이월/동기화는 클라이언트가 매번 90일치 JSON 을 끌어와 메모리에서 처리.
- **목표 (v2)**: todo 와 섹션을 **개별 row** 로 분리한 정규화 테이블 (`daily_blocks`) 도입. daily 페이지의 `content_tiptap` 컬럼은 **사용 중지** (옵션 A 채택, §3.5).
- **데이터 폐기 전제**: 기존 더미 데이터를 모두 제거하고 v2 스키마에서 처음부터 시작. 마이그레이션·백필·듀얼라이트·일치성 검증 단계 없음.
- **블로커**: TipTap 에디터의 부분 업데이트 통합, blockId 의 영구 unique 제약, 변환 레이어(`blocksToDoc` / `docToBlocks`)의 안정성.

---

## 1. 리팩토링 배경

### 1.1 v1 모델의 누적된 한계

조사 결과 (2026-04-28 기준) 다음 항목이 모두 JSON 통째 저장 구조에서 비롯된 문제로 확인되었다.

| 영역 | 현 동작 | 한계 |
|---|---|---|
| **이월** | 매번 최근 90일치 daily 페이지의 `content_tiptap` 을 끌어와 클라이언트 메모리에서 트리 순회 | 페이지 수에 비례한 네트워크/CPU. 90일 윈도우 외 동기화 불가 |
| **체크박스 동기화** | `syncBlockAcrossPages` 가 90일치 페이지 JSON 을 다시 다운로드 → 트리 수정 → 통째로 PUT | N개 페이지 동기화 = N회 JSON 덮어쓰기. race 조건 상존 |
| **autosave** | `setContent(prev => merged)` functional form 강제, `stripDismissed`, `isReloading` 플래그 등 회피책 다층 | "한 컬럼에 모든 게 있는" 모델 자체의 race. v1.4.8 에서 재현·수정 후에도 구조적 위험 남음 |
| **`_dismissed`** | content_tiptap 루트의 비표준 키 → React state 가 단일 소스 | TipTap 직렬화 대상 아님 → 손쉽게 유실. 영구 저장 보장 부재 |
| **todo 단위 코멘트** | 미구현 (섹션/페이지 코멘트만 동작) | `worklog_comments.target_id` 가 blockId 를 가리키도록 만들려 해도 blockId 가 인덱싱되지 않아 비효율 |
| **검색·통계** | 클라이언트가 JSON 을 메모리 순회 (`parseTodoStats`) | 월별·섹션별·완료율·태그별 등 어떤 집계도 SQL 로 불가 |
| **blockId 무결성** | 8자 base36 난수, 생성·검증 단일 진입점만 정리됨 | DB 레벨 unique 제약 없음. 충돌·누락 감지는 사후적 |
| **권한(visibility)** | `worklog_sections` 테이블 + content_tiptap attrs 이중 관리 | 비관리자 저장 시 master 섹션 유실 위험 → autosave merge 로 우회 (v1 §12) |

### 1.2 왜 지금인가

1. **이월 파이프라인이 이미 단일화됨 (v1 §12.7)** — `carryOverPipeline.js` 가 입출력을 깔끔히 정의해서, 내부 구현을 row 모델로 갈아끼워도 콜사이트가 영향을 덜 받는다.
2. **blockId 가 자리잡았음** — `utils/blockId.js` 단일 진입점, 모든 todo 가 발급받는 상태. row 의 PK 로 승격하기 좋다.
3. **섹션이 이미 row** — `worklog_sections` 테이블이 있으므로, 같은 패턴을 todo 까지 확장하는 형태로 설계가 일관된다.
4. **데이터 폐기 합의 완료** — 기존 daily/calendar 데이터는 모두 더미였고 v2 착수 직전 전부 삭제. 마이그레이션 비용이 0이라, 호환 부담 없이 가장 깔끔한 스키마로 시작 가능.
5. **Structured Data plane 의 첫 도메인** — ARCHITECTURE.md 의 두 plane 모델에서, 업무일지가 Documents plane 에서 Structured plane 으로 이주하는 첫 사례다. 여기서 정립하는 패턴(blockId 영구 식별 / position fractional / soft delete / 코멘트 연결 / visibility) 을 회계·물자 등 후속 도메인이 그대로 재사용한다.

### 1.3 비목표 (v2 가 다루지 않는 것)

- TipTap 자체 교체. 에디터는 그대로 쓰되, 데이터 소스만 분리한다.
- 일반 페이지 (`page_type='normal'`) 의 데이터 모델 변경. 이번 리팩토링은 daily/calendar 만 대상.
- 권한 모델 자체 재설계. `visibility` 의 저장 위치를 정리할 뿐, 정책은 v1 그대로.
- 임퍼소네이션 시스템 (별도 명세).

---

## 2. v1 현황 요약 (참조)

상세는 [WORKLOG-SPEC.v1.md](./WORKLOG-SPEC.v1.md). 여기서는 v2 설계의 출발점만 옮긴다.

```
pages
├─ id, page_type='daily', page_date, parent_id, user_id, project_id=NULL
└─ content_tiptap : JSONB
   └─ doc.content [
        toggle (h2, sectionId='fixed_todo', isFixedSection)
          ├─ paragraph "할 일"
          └─ toggle (isTodo, todoChecked, blockId, originBlockId, isCarryOver, carryOverFrom, isPinned, visibility)
              └─ paragraph "할 일 텍스트"
              └─ toggle (자식 — 동일 구조 재귀)
        toggle (h2, sectionId='fixed_notice') ...
        toggle (h2, sectionId='fixed_wrapup') ...
        toggle (h2, sectionId='sec_xxx', isPinned=true)  ← 사용자 자유 섹션
      ]
   └─ _dismissed : string[]   ← 비표준 루트 키, 재이월 차단
```

연관 row 테이블 (이미 분리됨):
- `worklog_sections` — 섹션 정의 (id, title, type, sort_order, visibility)
- `worklog_user_settings` — 계정별 섹션 순서
- `worklog_comments` — 코멘트 (target_type/target_id 로 섹션·페이지 코멘트 지원, todo 코멘트는 미구현)

---

## 3. v2 데이터 모델

### 3.1 설계 원칙

1. **하나의 todo = 하나의 row**. 하위 todo 도 별개 row. 부모-자식은 `parent_block_id` 로 표현.
2. **blockId 는 PK 또는 unique key**. 영구 식별자로 승격.
3. **섹션은 row**, 섹션 안의 todo 와는 외래키 관계.
4. **순서는 명시적 컬럼** (`position` 또는 fractional indexing). JSON 배열 순서에 의존하지 않음.
5. **content_tiptap 의 역할 결정** — §3.5 에서 두 갈림길 제시.
6. **이월·체크 동기화는 SQL 한 방에**. 클라이언트가 90일 페이지를 끌어오는 패턴 폐기.

### 3.2 신규 테이블

#### 3.2.1 `daily_blocks` — 모든 블록의 공통 row

```sql
CREATE TABLE daily_blocks (
  block_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- §9.5 결정: native UUID
  page_id         uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  page_date       date NOT NULL,                          -- denormalized (이월/동기화 쿼리 가속)
  user_id         uuid NOT NULL REFERENCES auth.users(id),

  -- 구조
  block_type        text NOT NULL CHECK (block_type IN ('paragraph','heading','toggle','section','quote','code','image','table')),
  parent_block_id   uuid REFERENCES daily_blocks(block_id) ON DELETE CASCADE,
  section_id        uuid NOT NULL REFERENCES daily_blocks(block_id) ON DELETE CASCADE,  -- self-ref. h2 row 자체는 자기 자신
  section_master_id text REFERENCES worklog_sections(id),  -- §9.9 옵션 A. section row 만 채움. 자식 row 는 NULL
  position          numeric NOT NULL,                       -- fractional index (0.5 사이 삽입 가능)

  -- 본문
  text_content    text,                                   -- plain text (검색용)
  rich_content    jsonb,                                  -- TipTap node 의 content 배열 (paragraph 이하)

  -- todo 속성 (block_type='toggle' && is_todo=true 일 때만 의미)
  is_todo         boolean NOT NULL DEFAULT false,
  todo_checked    boolean NOT NULL DEFAULT false,
  todo_status     text DEFAULT 'open' CHECK (todo_status IN ('open','done','hold')),

  -- 이월
  is_carry_over   boolean NOT NULL DEFAULT false,
  carry_over_from date,
  origin_block_id uuid,                                   -- 최초 원본 (이월 thread 추적)

  -- 기타 메타
  is_pinned       boolean NOT NULL DEFAULT false,
  background_color text,                                  -- 섹션/블록 배경색 (TipTap backgroundColor attr, CSS 색상 문자열). null=기본
  visibility      text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all','master')),
  is_fixed_section boolean NOT NULL DEFAULT false,        -- h2 섹션이 worklog_sections 의 fixed 와 매핑되는지

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz                              -- soft delete (재이월 차단 겸용, §3.2.2)
);

-- 인덱스
CREATE INDEX idx_daily_blocks_page          ON daily_blocks(page_id, position) WHERE deleted_at IS NULL;
CREATE INDEX idx_daily_blocks_section       ON daily_blocks(page_id, section_id, position) WHERE deleted_at IS NULL;
CREATE INDEX idx_daily_blocks_origin        ON daily_blocks(origin_block_id) WHERE origin_block_id IS NOT NULL;
CREATE INDEX idx_daily_blocks_todo_open     ON daily_blocks(page_date, section_id) WHERE is_todo=true AND todo_checked=false AND deleted_at IS NULL;
CREATE INDEX idx_daily_blocks_pinned        ON daily_blocks(user_id, page_date) WHERE is_pinned=true AND deleted_at IS NULL;
CREATE INDEX idx_daily_blocks_text_trgm     ON daily_blocks USING gin (text_content gin_trgm_ops);
```

#### 3.2.2 재이월 차단 — soft delete 채택 (2026-04-28 결정, §9.3)

별도 dismissed 테이블을 두지 않고 `daily_blocks.deleted_at` 만으로 처리한다.

- 사용자가 이월본을 지움 → 해당 row 의 `deleted_at = now()`.
- lazy 이월의 dedup 키는 **`COALESCE(origin_block_id, block_id)`** (thread 단위). 같은 thread 의 row 가 (살아있든 죽었든) 현재 페이지에 존재하면 다시 받지 않는다.
- 복구 시: `deleted_at` 을 NULL 로 되돌리거나, 사용자가 명시적으로 새 row 를 만든다.

#### 3.2.3 `worklog_sections` 변경 — 자유 섹션도 row 화 (2026-04-28 결정, §9.4)

자유 섹션 (`[+ 섹션 추가]` 로 만든 사용자 정의 섹션) 도 동일 테이블에 row 로 등록한다. 고정 섹션과의 구분은 `scope` 컬럼으로.

```sql
ALTER TABLE worklog_sections
  ADD COLUMN scope text NOT NULL DEFAULT 'global'
    CHECK (scope IN ('global', 'user'));
-- 'global' : 모든 사용자가 공유하는 고정 섹션 (fixed_todo 등)
-- 'user'   : 특정 사용자가 만든 자유 섹션. created_by 필수

-- created_by 는 v1 부터 컬럼이 존재. scope='user' 일 때 NOT NULL 의미.
-- RLS: scope='user' row 는 created_by = auth.uid() 만 SELECT/UPDATE/DELETE
```

**선택 추가 항목** (구현 시 검토):
- `is_active` (boolean) — 시드 섹션의 폐기 vs 비활성 구분
- `template_version` — 섹션 템플릿 변경 추적

**관계 (요약):**
- `worklog_sections` row 1개 ↔ 사용자가 작성하는 모든 daily 페이지의 같은 `section_id` h2 row N개 (1:N).
- 섹션 rename / 삭제는 마스터 row 에서 한 번 처리하면 모든 daily 에 자동 반영 (섹션 표시 이름은 마스터에서 끌어옴).
- `worklog_user_settings.section_order` 는 마스터 id 배열로 일관 — 자유 섹션도 안정 id 를 가지므로 순서 보존.

### 3.3 blockId 생성·검증 (UUID, 2026-04-28 결정 §9.5)

- **타입**: PG `uuid` (native). v1 의 `'blk_' + 8자 base36` 형식은 폐기.
- **생성**:
  - 클라이언트: `crypto.randomUUID()` (브라우저 표준 / Node 19+).
  - 서버 default: `gen_random_uuid()` (생성 위치를 가리지 않음).
  - `utils/blockId.js` 는 `crypto.randomUUID()` 한 줄 wrapper 로 단순화. `BLOCK_ID_PREFIX` / `'blk_'` 흔적 제거.
- **검증**: PK 제약. UUID v4 충돌은 사실상 0이므로 재시도 로직 불필요.
- **외부 노출**: ThinkMap 의 다른 PK (`pages.id`, `worklog_comments.id`) 와 동일한 UUID 패턴 — 시스템 일관성.

### 3.4 섹션 ↔ 블록 관계 (§9.9 옵션 A)

- h2 섹션 자체도 `daily_blocks` 의 한 row (`block_type='section'`).
- `section_id` 컬럼은 **같은 페이지 내 section row 의 block_id 를 가리키는 self-reference**. 섹션 row 자체는 `block_id == section_id` (R6 자기참조).
- `section_master_id` 컬럼은 **섹션 마스터 (`worklog_sections.id`) 를 가리킨다**. section row 만 채워지고, 그 자식들은 NULL.
- 모든 섹션 (고정 + 자유) 은 `worklog_sections` 마스터 row 를 가진다 (§3.2.3, §9.4 결정).
- 사용자가 [+ 섹션 추가] → 두 곳에 INSERT:
  1. `worklog_sections` 에 `scope='user'`, `created_by=auth.uid()`, `id` 는 새 UUID (text 로 저장)
  2. 현재 daily 페이지에 `block_type='section'`, `block_id=새 UUID`, `section_id=자기 block_id`, `section_master_id=worklog_sections.id` 의 h2 row 1개
- 다음 daily 페이지 templating 시 `worklog_user_settings.section_order` + `worklog_sections` 를 조회해 사용자별 섹션 구성을 자동 재현. 새 페이지에서 section row 의 `block_id` 는 매번 새로 발급, `section_master_id` 가 동일 마스터를 가리킴.
- v1 의 `isPinned` (블록 attrs) 는 v2 에서 의미 약화 — 자유 섹션이 마스터 row 를 갖는 순간 "다음 daily 에도 등장" 이 보장되므로. 본문 블록의 `is_pinned` 는 "섹션 안의 특정 todo 를 다음 daily 에 끌고 가기" 용도로만 잔존.
- 섹션 row 의 `text_content` 는 `worklog_sections.title` 의 **denormalized cache**. 변환 레이어는 row 만 읽고 마스터 조회 안 함. 마스터 title 변경 시 모든 해당 daily_blocks 섹션 row 의 text_content 도 함께 UPDATE (배치 또는 trigger).

### 3.5 `pages.content_tiptap` 의 운명 — 옵션 A 채택 (2026-04-28 결정)

데이터 폐기 합의로 마이그레이션 호환 부담이 사라졌으므로 **옵션 A** 를 처음부터 채택한다.

- **daily 페이지에서는 `content_tiptap` 컬럼 미사용.** 단일 소스는 `daily_blocks` row.
- 에디터 마운트 시 `blocksToDoc(rows)` 로 TipTap doc 조립.
- 편집 시 `docToBlocks(prevDoc, nextDoc)` 가 diff 를 계산해 row INSERT / UPDATE / soft-delete.
- `pages` 테이블의 `content_tiptap` 컬럼 자체는 **normal 페이지가 계속 사용**하므로 유지. daily 페이지의 row 에 한해 NULL 로 둔다.
- drift 위험 0. 캐시 무효화 규칙 불필요.

> 검토했던 옵션 B (듀얼 라이트 / 캐시) 는 데이터 보존이 필요할 때의 마이그레이션 안전장치였다. v2 는 마이그레이션 자체가 없으므로 채택하지 않는다.

### 3.6 `worklog_comments.target_id` = blockId 정착

- v1 의 `target_type` 그대로 ('section' | 'todo' | 'page').
- todo 코멘트가 가능해지는 것이 v2 의 사용자 가시 기능.
- `target_id` 가 `daily_blocks.block_id` 를 가리키는 FK 제약 추가 검토 (CASCADE 보다는 SET NULL 또는 코멘트는 살리고 block_id 만 NULL 처리).

### 3.7 변환 레이어 인터페이스 (Phase v2.1 진입점)

v2 는 row 가 단일 진실(§3.5)이고 TipTap 에디터는 **렌더링/입력 surface** 일 뿐이다. 둘을 잇는 변환 레이어를 먼저 인터페이스로 못박고, SQL 과 구현은 이 인터페이스에 맞춰 따라간다 (구조 안정 우선 순서, §10 Phase v2.1).

#### 3.7.1 타입 정의 (TypeScript-스타일 의사 표기)

```ts
// daily_blocks 한 row 의 클라이언트 표현 (camelCase)
type DailyBlock = {
  blockId:        string         // UUID v4
  pageId:         string         // pages.id (UUID)
  pageDate:       string         // 'YYYY-MM-DD'
  userId:         string         // auth.users.id

  // 구조
  blockType:        'paragraph' | 'heading' | 'toggle' | 'section'
                  | 'quote' | 'code' | 'image' | 'table'
  parentBlockId:    string | null  // null = 최상위
  sectionId:        string         // 같은 페이지의 section row blockId. h2 row 자체는 자기 자신 (R6)
  sectionMasterId:  string | null  // worklog_sections.id 참조. section row 만 채움 (§9.9 옵션 A)
  position:         number         // fractional index (numeric)

  // 본문
  textContent:    string | null  // plain text (검색용)
  richContent:    object | null  // TipTap node 의 content 배열 (paragraph 이하)

  // todo 속성 (blockType='toggle' && isTodo 일 때만 의미 있음)
  isTodo:         boolean
  todoChecked:    boolean
  todoStatus:     'open' | 'done' | 'hold'

  // 이월
  isCarryOver:    boolean
  carryOverFrom:  string | null  // 'YYYY-MM-DD'
  originBlockId:  string | null  // 최초 원본 (이월 thread 추적)

  // 메타
  isPinned:        boolean
  backgroundColor: string | null  // 섹션/블록 배경색 (CSS 색상 문자열). null=기본
  visibility:      'all' | 'master'
  isFixedSection:  boolean

  createdAt:      string         // ISO timestamp
  updatedAt:      string
  deletedAt:      string | null  // soft delete (§3.2.2)
}

// TipTap doc (ProseMirror JSON 구조 그대로)
type TipTapDoc = {
  type: 'doc'
  content: TipTapNode[]
}

// docToBlocks 의 컨텍스트 (현재 페이지 정보)
type WriteContext = {
  pageId:    string
  pageDate:  string
  userId:    string
}

// docToBlocks 의 결과
type BlockDiff = {
  insert:     DailyBlock[]
  update:     Array<{ blockId: string; patch: Partial<DailyBlock> }>
  softDelete: string[]   // blockId 목록
}
```

#### 3.7.2 시그니처

```ts
// row 들 → TipTap doc 조립 (read 경로)
function blocksToDoc(blocks: DailyBlock[]): TipTapDoc

// TipTap doc 변경 → row diff (write 경로)
function docToBlocks(
  prevDoc: TipTapDoc | null,   // 직전 저장된 doc (없으면 null = 신규 페이지)
  nextDoc: TipTapDoc,
  ctx: WriteContext
): BlockDiff

// 보조: 두 doc 의 의미적 동등성 (round-trip 일치성 검증용)
function docsEqual(a: TipTapDoc, b: TipTapDoc): boolean
```

#### 3.7.3 불변 규칙 (round-trip 일치성)

변환 레이어는 다음 invariant 를 만족해야 하며, 단위 테스트로 검증한다.

| # | 규칙 | 의미 |
|---|---|---|
| R1 | `docsEqual(blocksToDoc(rows), blocksToDoc(rows))` | 결정적 (deterministic) |
| R2 | `docToBlocks(prev, prev, ctx)` 의 `insert`/`update`/`softDelete` 모두 빈 배열 | "변경 없음" 이 검출돼야 함 |
| R3 | `docsEqual(doc, blocksToDoc(applyDiff(rows, docToBlocks(prev, doc, ctx))))` | doc 분해 후 재조립이 원본과 일치 |
| R4 | 블록 순서: `position` 오름차순. 동률 시 `createdAt` tiebreak | 순서 보존 |
| R5 | 트리: `parentBlockId === null` row 가 doc.content 최상위. 자식은 부모의 content 안에 평탄화/중첩 | 위계 보존 |
| R6 | 섹션(h2): 항상 `parentBlockId === null` 이고 `sectionId === blockId` | 섹션은 자기참조 |
| R7 | UUID 보존: 기존 row 의 `blockId` 는 doc → row 변환 후에도 그대로 (재발급 금지) | thread 추적 안전성 |

#### 3.7.4 시나리오 픽스처 목록 (Phase v2.1 작업 항목)

각 시나리오는 입력 (`prevDoc`, `nextDoc`) 과 기대 (`BlockDiff`) 쌍으로 작성. round-trip 도 함께 검증.

- [ ] 새 daily 페이지 첫 마운트 (rows = 고정 섹션 4개만, todo 없음)
- [ ] 사용자가 todo 한 줄 추가
- [ ] 체크박스 토글
- [ ] 이월된 todo 가 들어와 있는 doc 의 첫 마운트
- [ ] 이월된 todo 의 textContent 수정
- [ ] 이월된 todo 삭제 (soft delete → 재이월 차단)
- [ ] Quick Todo 외부 INSERT 가 끼어들었다가 다음 마운트 시 doc 재조립
- [ ] 자유 섹션 추가 (worklog_sections 신규 row + h2 daily_block 신규 row)
- [ ] 섹션 visibility 'all' ↔ 'master' 토글
- [ ] 하위 todo (parent 가 있는 toggle) 추가/이동/삭제
- [ ] 빈 doc → blocksToDoc → docToBlocks 멱등성

#### 3.7.5 책임 경계

- 변환 레이어는 **DB 쿼리를 실행하지 않는다**. `BlockDiff` 를 반환할 뿐이고, 적용은 `useDailyBlocks` 훅이 수행.
- 변환 레이어는 **이월/동기화 정책을 모른다**. 그건 `carryOverPipeline.js` 의 책임.
- 변환 레이어는 **autosave debounce / race 처리를 하지 않는다**. 호출자(에디터 통합)의 책임.

---

## 4. 데이터 흐름

### 4.1 daily 페이지 열람 (Read)

```
사용자가 daily 페이지 진입
  ↓
TipTapTestPage 마운트
  ↓
daily_blocks SELECT WHERE page_id = ? ORDER BY position
  ↓
blocksToDoc(rows) → TipTap doc 조립 (utils/blocksToDoc.js 신설)
  ↓
이월 lazy 동기화 (§4.3) — 신규 row 가 생기면 doc 재조립
  ↓
에디터 mount
```

### 4.2 편집 (Write)

```
에디터 transaction
  ↓
ProseMirror plugin (기존 carryOverDismissTracker 확장)
  ↓
docToBlocks(prevDoc, nextDoc) — 추가/수정/삭제 row 식별
  ↓
debounce (500ms)
  ↓
row CRUD 묶음 (단일 트랜잭션):
  - INSERT daily_blocks (신규 노드)
  - UPDATE daily_blocks SET ... WHERE block_id IN (...)
  - UPDATE daily_blocks SET deleted_at = now() WHERE block_id IN (...)  (soft)
  ↓
실시간 구독한 다른 클라이언트에 반영 (Supabase Realtime)
```

### 4.3 이월 (Carry-Over)

#### Eager (새 daily 페이지 생성)

```sql
-- 어제 미완료 + pinned + master 섹션 한 방 조회
WITH src AS (
  SELECT * FROM daily_blocks
   WHERE page_date = :prev_date
     AND deleted_at IS NULL
     AND (
       (is_todo=true AND todo_checked=false)
       OR is_pinned=true
     )
)
SELECT * FROM src ORDER BY section_id, position;
```

→ 클라이언트가 새 daily 페이지의 row 로 insert (blockId 재발급, originBlockId 승계, isCarryOver=true).

#### Lazy (기존 daily 페이지 열람 시)

```sql
-- 현재 페이지에 존재하는 thread (살아있든 deleted 든)
SELECT COALESCE(origin_block_id, block_id) AS thread_id
  FROM daily_blocks
 WHERE page_id = :curr;     -- deleted_at 무관 — soft delete 도 차단 효과를 가짐 (§3.2.2)

-- 추가될 후보 — 직전 daily 페이지의 살아있는 미완료/pinned
-- (3년 윈도우는 thread 동기화의 범위이지, lazy 이월의 시간축이 아님.
--  lazy 이월은 "직전 페이지의 신규 미완료" 만 끌어옴 — v1 동작과 동일)
SELECT * FROM daily_blocks
 WHERE page_id = :prev_page_id
   AND deleted_at IS NULL
   AND (is_todo=true AND todo_checked=false OR is_pinned=true)
   AND COALESCE(origin_block_id, block_id) NOT IN (:existing_thread_ids);
```

→ 차이만 INSERT. v1 처럼 90일치 JSON 전체 다운로드 불필요. dismissed 별도 테이블 없이 thread 단위 dedup 으로 재이월 차단.

### 4.4 체크박스 동기화 (Thread)

```sql
-- 같은 thread (originBlockId) 의 모든 row 한 번에 업데이트
UPDATE daily_blocks
   SET todo_checked = :new_state, updated_at = now()
 WHERE COALESCE(origin_block_id, block_id) =
       COALESCE((SELECT origin_block_id FROM daily_blocks WHERE block_id=:b), :b)
   AND page_date >= now()::date - INTERVAL '3 years';
```

- **윈도우 = 3년** (2026-04-28 결정, §9.2).
- 3년 초과 thread 는 자동 동기화에서 제외되며, 별도 **Leftover 관리 UI** (§6.3) 에서 사용자가 수동으로 처리한다.
- 변경된 page_id 목록을 클라이언트에 broadcast → 해당 페이지가 열려있으면 에디터 갱신.

### 4.5 검색·통계

신규 가능 항목:

```sql
-- 월간 완료율
SELECT page_date,
       COUNT(*) FILTER (WHERE is_todo) AS total,
       COUNT(*) FILTER (WHERE is_todo AND todo_checked) AS done
  FROM daily_blocks
 WHERE user_id = :u AND page_date >= date_trunc('month', now())
 GROUP BY page_date
 ORDER BY page_date;

-- 텍스트 검색 (pg_trgm)
SELECT block_id, page_date, section_id, text_content
  FROM daily_blocks
 WHERE text_content % :query
 ORDER BY similarity(text_content, :query) DESC
 LIMIT 50;

-- 미완료 누적 (오래 묵은 todo)
SELECT * FROM daily_blocks
 WHERE is_todo AND NOT todo_checked AND deleted_at IS NULL
   AND COALESCE(carry_over_from, page_date) < now()::date - INTERVAL '14 days'
 ORDER BY carry_over_from ASC;
```

---

## 5. 출범 전략 (마이그레이션 없음)

기존 daily/calendar 데이터는 모두 더미였으므로 **사전 폐기 후 v2 스키마로 처음부터 시작**한다. 듀얼라이트·백필·일치성 검증은 모두 불필요.

### 5.1 사전 폐기 작업

v2 코드 머지 직전, 다음을 단일 트랜잭션으로 실행:

```sql
-- 1. daily 페이지 본문/파생 데이터 모두 제거
DELETE FROM worklog_comments
 WHERE page_id IN (SELECT id FROM pages WHERE page_type IN ('daily','calendar'));

DELETE FROM pages
 WHERE page_type IN ('daily','calendar');

-- 2. (필요시) worklog_user_settings 의 section_order 초기화
UPDATE worklog_user_settings SET section_order = '[]'::jsonb;
```

> `worklog_sections` (고정 섹션 시드) 는 보존. `worklog_user_settings` 는 row 자체는 유지하고 순서만 초기화.

### 5.2 v2 스키마 적용

```sql
-- 신규 테이블만 생성
\i migrate-create-daily-blocks.sql
```

- 기존 데이터 변환 로직 없음.
- RLS 정책은 적용 시점부터 즉시 유효.

### 5.3 코드 릴리즈

- daily 페이지 read/write 경로를 `daily_blocks` 기반으로 일괄 교체.
- content_tiptap 미사용으로 전환 (daily 한정).
- 첫 사용자 액션 (예: "오늘" 버튼) 시점에 신규 calendar 페이지 + 첫 daily 페이지가 row 모델로 만들어진다.

### 5.4 롤백

데이터가 비어 있는 상태에서 출범하므로, 결함 발견 시:
- 코드 revert + `daily_blocks` 테이블 TRUNCATE 또는 DROP 만으로 원상 복귀.
- 사용자 데이터 손실 없음 (이미 폐기된 더미였으므로).

---

## 6. 기능 명세 변화 (v1 대비)

### 6.1 사용자가 보는 기능

| 기능 | v1 | v2 |
|---|---|---|
| 일별 업무일지 작성/편집 | 동일 | 동일 |
| 미완료 todo 자동 이월 | 클라이언트 90일 JSON 스캔 | row 인덱스 쿼리 (즉시) |
| 체크박스 교차 동기화 | 90일 페이지 JSON 일괄 갱신 | row UPDATE 한 방 (윈도우 3년, §6.3) |
| 섹션별 코멘트 | ✅ | ✅ (구현 동일) |
| **todo 코멘트** | ❌ 미구현 | ✅ 신규 |
| **검색** | ❌ (메모리) | ✅ pg_trgm |
| **통계** | 페이지 단위만 | 섹션·기간·태그·thread 등 |
| _dismissed (재이월 차단) | content_tiptap 루트 | `daily_blocks.deleted_at` (soft delete) — thread 단위 dedup 으로 차단 |
| 권한 (visibility) | 테이블 + JSON 이중 | row 컬럼 단일 |

### 6.2 개발자가 보는 변화

- **`carryOverPipeline.js`** 의 함수 시그니처는 유지하되 내부가 row 기반으로 재작성.
- **`worklogTemplate.js::toCarryOverNode`** 는 row → row 함수로 의미가 바뀜 (기존 node clone → row clone).
- **에디터 통합 레이어 신설**: `utils/blocksToDoc.js` (row → TipTap), `utils/docToBlocks.js` (TipTap → row diff).
- **ProseMirror plugin** `carryOverDismissTracker` 는 dismissed 를 해당 row 의 `deleted_at` UPDATE 로 발행 (별도 테이블 없음).

### 6.3 Leftover 관리 UI (3년 초과 항목, 신규)

체크박스 동기화 윈도우(3년) 를 벗어난 thread 는 자동 동기화에서 제외된다. 그러나 데이터는 보존되므로, 사용자가 명시적으로 확인·정리할 수 있는 UI 가 필요하다.

#### 진입점
- 사이드바 "업무일지" 메뉴 안의 **[오래된 미완료 정리]** 항목 (가칭).
- 또는 캘린더 뷰의 통계 패널에서 "3년+ 미완료 N건" 배지 → 클릭 시 진입.

#### 화면 구성
- 3년 초과 미완료 todo 목록 (page_date 오름차순). 각 row 에 다음 표시:
  - 텍스트, 최초 작성일 (`carry_over_from` 또는 `created_at`), thread 길이 (몇 번 이월됐는지), 마지막 수정일.
- 일괄 액션: **완료 처리** / **dismiss (재이월 차단)** / **soft delete**.
- 단일 액션: 클릭 시 해당 thread 의 가장 최근 페이지로 점프.

#### 쿼리 (예시)

```sql
-- 3년 초과 미완료 thread 의 대표 row (thread 당 가장 최근)
SELECT DISTINCT ON (COALESCE(origin_block_id, block_id))
       block_id, origin_block_id, page_id, page_date,
       text_content, carry_over_from, updated_at,
       (SELECT count(*) FROM daily_blocks b2
         WHERE COALESCE(b2.origin_block_id, b2.block_id) =
               COALESCE(daily_blocks.origin_block_id, daily_blocks.block_id)) AS thread_length
  FROM daily_blocks
 WHERE is_todo = true
   AND todo_checked = false
   AND deleted_at IS NULL
   AND user_id = :u
   AND page_date < now()::date - INTERVAL '3 years'
 ORDER BY COALESCE(origin_block_id, block_id), page_date DESC;
```

#### 동작 정책
- 사용자가 "완료 처리" 선택 시: thread 의 모든 row 를 `todo_checked=true` (윈도우 무시).
- "dismiss" 선택 시: 현재 페이지의 해당 thread row 의 `deleted_at` 세팅 (재이월 차단). 살아있는 row 가 없으면 placeholder row (deleted 상태) INSERT.
- "soft delete" 선택 시: 해당 thread 의 모든 row 를 `deleted_at = now()`.
- 모든 액션은 **확인 다이얼로그** 후 실행.

## 7. 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| **row ↔ doc 변환 버그** | 콘텐츠 손실 | `blocksToDoc`/`docToBlocks` 단위 테스트 + 출범 초기 staging 검증. 마이그레이션 안전망(content_tiptap 복구) 없으므로 변환 레이어의 신뢰도가 핵심 |
| **편집 race** | 동일 row 가 여러 트랜잭션에서 동시 갱신 | `updated_at` 기반 optimistic concurrency. 충돌 시 마지막 쓰기 우선 + 사용자에게 알림 |
| **fractional position 의 재밸런스** | 무한 분할 시 정밀도 한계 | numeric 사용 + 일정 횟수 후 reorder 작업 |
| **출범 시 데이터 사용자 영향** | 사전 폐기로 기존 daily/calendar 페이지가 사라짐 | 더미 데이터만 존재해 영향 없음. 폐기 SQL 은 사용자 명시 승인 후 1회만 실행 |
| **TipTap 의존 범위 확대** | 변환 레이어가 TipTap 내부에 깊이 결합 | `blocksToDoc`/`docToBlocks` 를 순수 함수로 분리 + 단위 테스트 |
| **blockId 충돌** | INSERT 실패 → 사용자 경로 막힘 | PK 충돌 시 자동 재발급 + 로깅 |
| **외부 통합 (Quick Todo, GlobalTopBar) 회귀** | 기존 이벤트 (`quicktodo-inserted`) 흐름 영향 | 이벤트 인터페이스는 유지, 내부만 row 호출로 |
| **사전 폐기 SQL 오발사** | 사용자 데이터 손실 | 현재는 더미만 있어 손실 없음. 그러나 v2 출범 후 운영 데이터가 쌓이기 전에만 안전. 운영 시작 후 절대 재실행 금지 — 스크립트에 가드 주석 + 실행 시 사용자 승인 |

---

## 8. v1 대비 변경 요약 표

| 항목 | v1 | v2 |
|---|---|---|
| **데이터 위치** | `pages.content_tiptap` (JSONB) | `daily_blocks` (row, 단일 소스). daily 페이지의 content_tiptap 미사용 |
| **하나의 todo** | TipTap toggle 노드 | `daily_blocks` 한 row |
| **blockId** | TipTap attrs, DB unique 제약 없음 | `daily_blocks.block_id` PK |
| **순서** | content 배열 인덱스 | `position numeric` (fractional) |
| **이월** | 클라이언트 90일 JSON 스캔 | SQL 인덱스 쿼리 |
| **체크 동기화** | 90일 페이지 JSON 갱신 | row UPDATE |
| **`_dismissed`** | content_tiptap 루트 키 | `daily_blocks.deleted_at` (soft delete) + thread 단위 dedup |
| **검색·통계** | 클라이언트 메모리 | SQL |
| **todo 코멘트** | ❌ | ✅ |
| **권한** | 테이블 + JSON 이중 | row 컬럼 단일 |
| **autosave race** | 다층 회피책 | row 단위 트랜잭션, race 거의 소멸 |
| **TipTap 통합** | 직접 (content_tiptap == TipTap doc) | 변환 레이어 (`blocksToDoc`/`docToBlocks`) |

---

## 9. 미해결 / 결정 필요 사항

> 아래 항목은 **착수 전에 사용자와 합의해야** 한다. 임의 결정 금지.

### 9.1 ~~옵션 A vs B~~ — **결정 완료 (2026-04-28)**
- 옵션 A 채택. content_tiptap 은 daily 페이지에서 미사용. §3.5 참조.

### 9.2 ~~이월 윈도우~~ — **결정 완료 (2026-04-28)**
- **체크박스 동기화 윈도우 = 3년**. (§4.4 SQL `INTERVAL '3 years'`)
- **Lazy 이월** 은 직전 daily 페이지만 — 시간축 이동 없음.
- **3년 초과 thread** 는 자동 동기화에서 제외되며, 사용자가 [Leftover 관리 UI](§6.3) 에서 확인 후 수동으로 처리한다.

### 9.3 ~~`_dismissed` 처리~~ — **결정 완료 (2026-04-28)**
- **soft delete 채택** (`daily_blocks.deleted_at`). 별도 테이블 없음. §3.2.2 참조.
- 차단 키는 thread 단위: `COALESCE(origin_block_id, block_id)`. 같은 thread 의 row 가 페이지에 존재 (살아있든 deleted 든) 하면 lazy 이월 skip.
- "의도적 dismiss vs 단순 삭제" 구분은 두 옵션 모두 불가능했으므로, 단순한 쪽을 택함.

### 9.4 ~~자유 섹션을 `worklog_sections` row 로 등록할지~~ — **결정 완료 (2026-04-28)**
- **자유 섹션도 row 등록 (옵션 A)**. `worklog_sections.scope` 컬럼 추가 (`'global' | 'user'`), 자유 섹션은 `scope='user'` + `created_by=auth.uid()`.
- 이유: 다음 daily 자동 이월·section_order 안정 ID·rename/삭제 일원화. v1 의 `isPinned` (섹션) 는 마스터 row 자체로 흡수.
- 본문 블록의 `is_pinned` 는 "섹션 안 특정 todo 를 끌고 가기" 용도로만 잔존. §3.2.3, §3.4 참조.

### 9.5 ~~blockId 길이 확장~~ — **결정 완료 (2026-04-28)**
- **UUID v4 채택** (PG `uuid` 타입). v1 의 `'blk_' + 8자 base36` 폐기.
- 다른 ThinkMap PK 와 동일 패턴, 충돌 사실상 0, native 인덱스 효율. §3.3 참조.
- `utils/blockId.js` 는 `crypto.randomUUID()` wrapper 로 단순화.

### 9.6 ~~마이그레이션 시점·릴리즈 전략~~ — **무효화 (2026-04-28)**
- 데이터 폐기 후 깨끗한 출범으로 결정. §5 참조.

### 9.7 ~~Quick Todo 와의 관계~~ — **결정 완료 (2026-04-28)**
- **`daily_blocks` row INSERT 한 줄로 단순화.** content_tiptap 직접 삽입 폐기.
- 사용자 경험 동일. `quicktodo-inserted` 이벤트 인터페이스는 유지.

### 9.8 ~~`worklog_templates` 테이블~~ — **결정 완료 (2026-04-28, v2 범위 밖)**
- v2 에 포함하지 않음. 자유 섹션이 `worklog_sections` row 로 정착 (§9.4) 되어 사용자별 섹션 구성은 이미 영구화.
- "프로젝트 단위 공유 템플릿" 은 다른 사용자에게 같은 섹션 셋을 배포하는 별도 가치 — 향후 회계·물자 등 도메인이 늘어 "도메인별 템플릿" 패턴이 필요해질 때 묶어서 설계.

### 9.9 ~~fixed 섹션의 daily_blocks row 식별 방식~~ — **결정 완료 (2026-04-30)**

**옵션 A 채택**: `section_id` self-reference + `section_master_id` 분리. §3.2.1, §3.4 갱신 완료. 추가 마이그레이션 SQL `migrate-daily-blocks-section-self-ref.sql` 사용자 실행 대기.

---

#### (이력) 발견 시점의 모순 정리

**모순**: 다음 둘이 동시에 성립 불가.
- §3.2.1 SQL: `section_id text NOT NULL REFERENCES worklog_sections(id)` — fixed 섹션의 worklog_sections.id 는 `'fixed_todo'` 같은 text.
- §3.7.3 R6: section row 의 `sectionId === blockId` (UUID 자기참조).

fixed 섹션의 daily_blocks row 는 둘을 동시에 만족 못 함:
- block_id 는 uuid (PG default gen_random_uuid).
- section_id 가 `'fixed_todo'` text 면 R6 위반.
- section_id 가 자기 blockId UUID 면 worklog_sections 에 그 UUID 가 없어 FK 위반.

**옵션**:

A. **section_id 를 self-reference 로 + section_master_id 분리 (권장)**
   ```sql
   section_id        uuid REFERENCES daily_blocks(block_id),  -- 같은 페이지 내 section row
   section_master_id text REFERENCES worklog_sections(id),    -- 섹션 마스터 (제목/권한). section row 만 채움
   ```
   - R6 자기참조 그대로 성립. FK 깨끗.
   - 픽스처는 section_master_id 추가. 변환 레이어 / merge 모듈에 컬럼 추가.
   - SQL 추가 마이그레이션 필요 (이미 적용된 스키마에 ALTER).

B. **fixed 섹션 시드 id 를 UUID 로 갈아엎기**
   - SECTION_IDS = { TODO: 'fixed_todo', ... } 가 v1 코드에서 hardcoded — v2 통합 시 worklog_sections 조회로 대체.
   - SQL: 시드 데이터 재생성 + v1 코드의 `SECTION_IDS` 사용처 모두 수정.
   - 변경 폭 큼. R6 그대로.

C. **R6 약화**: section row 의 `sectionId === blockId` 등식을 자유 섹션에만 적용. fixed 는 worklog_sections.id (text) 가리킴.
   - 픽스처/명세 R6 의미 변경. 변환 레이어에 분기 추가.
   - 일관성 ↓.

**권장: 옵션 A**. self-reference 가 R6 의 의도에 가장 가까우며, master_id 분리로 마스터 메타 변경 (제목/권한) 이 자연스럽게 모든 daily 에 반영. 사용자 복귀 시 합의 후 적용.

---

## 10. 구현 Phase (제안)

> 각 Phase 끝마다 user 합의 필요. 임의 진행 금지.

### Phase v2.0 — 설계 확정 ✅ 완료 (2026-04-28)
- [x] v1 백업
- [x] v2 기획서 작성 (이 문서)
- [x] 옵션 A 채택, 데이터 폐기 합의 (§3.5, §5)
- [x] §9 모든 결정 사항 합의 (9.1~9.8)
- [x] DB 스키마 최종안 확정

### Phase v2.1 — 스키마 + 변환 레이어 (구조 안정 우선 순서)

진행 순서. 앞 단계가 박혀야 다음 단계가 안전하다.

**1. 인터페이스 설계** ✅ 완료
- [x] §3.7 변환 레이어 인터페이스 — 타입 / 시그니처 / 불변 규칙 / 시나리오 목록 / 책임 경계 모두 박힘

**2. 시나리오 픽스처 + round-trip 테스트** ✅ 완료
- [x] §3.7.4 의 11개 시나리오를 `tests/fixtures/daily-blocks/*.json` 으로 작성. 형식은 `tests/fixtures/daily-blocks/README.md`
- [x] vitest 도입 (`devDependency`, `npm run test` / `npm run test:run`)
- [x] 픽스처 placeholder 치환 유틸 (`tests/transform/loadFixture.js`)
- [x] round-trip 러너 (`tests/transform/round-trip.spec.js`) — 픽스처별 `rules` 에 따라 R1~R7 분리 실행
- [x] 변환 레이어 stub (`src/utils/blocksToDoc.js`, `src/utils/docToBlocks.js`) — throw not-implemented
- [x] 첫 실행 결과: 4 pass (sanity + R6) / 30 fail (stub) / 34 skipped (rules 미포함). **의도된 결과**
- [ ] 누락 시나리오 발견 시 §3.7.4 갱신

**3. SQL 스키마** ✅ 작성 완료 (Supabase 실행 대기)
- [x] `migrate-create-daily-blocks.sql` — 컬럼/인덱스/RLS/`scope` ALTER 통합 단일 트랜잭션
- [x] `migrate-purge-daily-pages.sql` — 사전 폐기 SQL (§5.1)
- [x] **사용자 액션**: Supabase SQL Editor 에서 두 SQL 순서대로 실행 (2026-04-28 완료)
- [x] 검증 쿼리 결과 확인

**4. 변환 레이어 구현** ✅ 완료
- [x] `src/utils/blocksToDoc.js` — row 트리 재구성 + 정렬(R4) + 섹션/토글 노드 변환 + `docsEqual` 함께 export
- [x] `src/utils/docToBlocks.js` — flattenDoc + diff (insert/update/softDelete) + todo_status 자동 동기화 + 변경 필드만 patch
- [x] **34 passed / 0 failed / 34 skipped** (skipped 는 픽스처별 rules 미포함 invariant 의 의도된 conditional skip)

**5. 통합 (Phase v2.2 의 첫 발판)** ✅ 신규 파일 + 단위 테스트 작성 완료. 기존 컴포넌트 교체는 v2.2 본격 진입 시.
- [x] `src/utils/dailyBlockMapper.js` — row ↔ DB row 변환 (camelCase ↔ snake_case) + 9 tests
- [x] `src/utils/dailyBlockOps.js` — fetchBlocks / applyDiffToSupabase / syncThreadCheckbox + 11 tests (mock Supabase)
- [x] `src/utils/dailyBlockMerge.js` — 순수 머지 로직 (mergeDiffLocal / applyRealtimeEvent / sortByPositionAndCreatedAt) + 15 tests
- [x] `src/hooks/useDailyBlocks.js` — React 훅 (state + Realtime + applyDiff). React 통합 테스트는 v2.2 본격 진입 시
- [x] `src/utils/blockIdV2.js` — `crypto.randomUUID()` wrapper + 6 tests. v1 의 `blockId.js` 는 그대로 (사이트 동작 보존)
- [x] `src/utils/carryOverPipelineV2.js` — selectCandidates / filterNewThreads / toCarryOverRow / Eager / Lazy + 19 tests. v1 의 `carryOverPipeline.js` 는 그대로
- **누적 단위 테스트**: 94 passed / 0 failed / 34 skipped
- ~~**알려진 한계**: `toCarryOverRow` 트리 평탄화~~ → 2026-04-30 해소: `toCarryOverSubtree` + `filterRootCandidates` 추가. root + 자손 모두 끌고 오면서 새 blockId 매핑 유지.
- **남은 블로커**: §9.9 (fixed 섹션 row 식별 방식, 2026-04-30 발견) — 사용자 합의 필요.

### Phase v2.2 — 읽기/쓰기 경로 교체
- [ ] `src/hooks/useDailyBlocks.js` 신설 (row CRUD + 실시간 구독)
- [ ] `TipTapTestPage` mount/autosave 를 row 기반으로 전환
- [ ] `carryOverPipeline.js` row 기반 재작성
- [ ] `ToggleExtension::syncBlockAcrossPages` row UPDATE 로 교체
- [ ] Quick Todo / "오늘" 버튼 / WorklogHeader 의 row INSERT 경로

### Phase v2.3 — 출범
- [ ] §5.1 사전 폐기 SQL 실행 (사용자 확인 필수)
- [ ] v2 코드 머지 + 릴리즈
- [ ] todo 코멘트 UI 활성화
- [ ] 검색·통계 페이지 베타 노출

### Phase v2.4 — Leftover 관리 (3년 초과 항목)
- [ ] `src/components/Worklog/LeftoverManager.jsx` — 3년 초과 미완료 thread 목록 UI
- [ ] 사이드바 진입점 + 캘린더 통계 패널 배지
- [ ] 일괄 액션 (완료 / dismiss / soft delete) — 윈도우 무시 모드
- [ ] **출범 직후엔 데이터가 없으므로 즉시 노출 불필요**. v2.3 출범 후 약 1년 시점에 첫 의미 있는 데이터가 쌓이지만, UI 자체는 v2.3 단계에서 비어 있는 상태로 미리 배포 가능

---

## 11. 관련 파일 (현행)

### v1 그대로 유지 / v2 에서 수정 대상

| 파일 | v1 역할 | v2 변경 예상 |
|---|---|---|
| `src/utils/blockId.js` | blockId 생성 | `crypto.randomUUID()` wrapper 로 단순화. `BLOCK_ID_PREFIX` / `'blk_'` 제거 (§3.3, §9.5) |
| `src/utils/carryOverPipeline.js` | 이월 파이프라인 | 내부 row 기반 재작성, 시그니처 유지 |
| `src/utils/worklogTemplate.js::toCarryOverNode` | TipTap node clone | row clone 함수로 의미 변경 |
| `src/utils/sectionUtils.js` | 섹션 추출/그룹핑 | row 기반 헬퍼로 재작성 |
| `src/utils/worklogUtils.js::buildDailyPageTemplate` | 새 daily 페이지 생성 | row INSERT 묶음으로 |
| `src/components/TipTapEditor/TipTapTestPage.jsx` | autosave, loadContent | row 단일 소스로 read/write. content_tiptap 경로 제거 |
| `src/components/TipTapEditor/extensions/ToggleExtension.js` | syncBlockAcrossPages, carryOverDismissTracker | row UPDATE / soft delete (deleted_at 세팅) |
| `src/components/QuickTodo/QuickTodo.jsx` | content_tiptap 직접 수정 | row INSERT |
| `src/hooks/usePages.js` | calendar/daily 조회 | 동일 (row 는 별도 훅 신설) |

### v2 신규

| 파일 (예상) | 역할 |
|---|---|
| `migrate-create-daily-blocks.sql` | 신규 테이블 + 인덱스 + RLS |
| `migrate-purge-daily-pages.sql` | 사전 폐기용 단일 트랜잭션 SQL (§5.1, 사용자 승인 후 1회 실행) |
| `migrate-daily-blocks-section-self-ref.sql` | §9.9 옵션 A: section_id self-ref + section_master_id 분리 (사용자 실행 대기) |
| `migrate-daily-blocks-fix-missing-columns.sql` | 첫 마이그레이션 실행 시 일부 컬럼 누락된 케이스 회복 (origin_block_id 등 IF NOT EXISTS 보강) |
| `src/utils/docToBlocks.js` | TipTap doc → row diff |
| `src/utils/blocksToDoc.js` | row → TipTap doc 조립 |
| `src/hooks/useDailyBlocks.js` | row CRUD + 실시간 구독 |
| `src/components/Worklog/LeftoverManager.jsx` | 3년 초과 미완료 thread 관리 UI (§6.3) |
| `src/hooks/useLeftoverTodos.js` | 3년 초과 thread 조회 + 일괄 액션 |
| `src/utils/dailyBlockMapper.js` | row ↔ DB row 변환 (camelCase ↔ snake_case). ✅ 작성 |
| `src/utils/dailyBlockOps.js` | Supabase CRUD 순수 로직 (fetchBlocks / applyDiffToSupabase / syncThreadCheckbox). ✅ 작성 |
| `src/utils/dailyBlockMerge.js` | 순수 머지 (mergeDiffLocal / applyRealtimeEvent). ✅ 작성 |
| `src/utils/blockIdV2.js` | `crypto.randomUUID()` wrapper. v1 `blockId.js` 와 공존. ✅ 작성 |
| `src/utils/carryOverPipelineV2.js` | row 기반 이월 Eager / Lazy + pure 추출 함수. v1 `carryOverPipeline.js` 와 공존. ✅ 작성 |
| `src/utils/worklogTemplateV2.js` | 새 daily 페이지의 section row 들 생성. R6 self-ref + sectionMasterId. ✅ 작성 |
| `src/components/TipTapEditor/DailyPageV2.jsx` | daily 페이지 v2 본문 컴포넌트 (read/write/이월/체크 동기화 통합). 옵션 1 (별도 컴포넌트) 채택. ✅ TipTapTestPage 에서 호출 |
| `src/utils/createDailyPageV2.js` | 새 daily 페이지 생성 (pages INSERT + section row + carryOverEager). ✅ handleCreateDailyPage / goToNextWorklog 에서 호출 |

---

## 12. 결정 로그

| 일자 | 결정 / 합의 사항 | 메모 |
|---|---|---|
| 2026-04-28 | v1 백업, v2 기획서 출범 | 이 문서 |
| 2026-04-28 | **기존 daily/calendar 데이터 전부 폐기 후 깨끗한 출범** | 모두 더미 데이터. 마이그레이션·백필·듀얼라이트 단계 모두 제거 (§5) |
| 2026-04-28 | **옵션 A 채택** — daily 페이지에서 content_tiptap 미사용 | §3.5, §9.1 |
| 2026-04-28 | **이월/동기화 윈도우 = 3년**, 초과분은 Leftover 관리 UI 로 사용자 처리 | §4.4, §6.3, §9.2 |
| 2026-04-28 | **재이월 차단 = soft delete** (별도 테이블 없음, thread 단위 dedup) | §3.2.2, §4.3, §9.3 |
| 2026-04-28 | **자유 섹션도 `worklog_sections` row 등록** (`scope='user'`) | §3.2.3, §3.4, §9.4 |
| 2026-04-28 | **blockId = UUID v4** (PG native uuid 타입). `'blk_'` prefix 폐기 | §3.3, §9.5 |
| 2026-04-28 | **Quick Todo = row INSERT** (content_tiptap 직접 삽입 폐기) | §9.7 |
| 2026-04-28 | **`worklog_templates` 는 v2 범위 밖** (자유 섹션 row 화 (§9.4) 로 충분) | §9.8 |
| 2026-04-28 | **§9 모든 결정 완료**. Phase v2.0 종료, v2.1 (스키마 + 변환 레이어) 으로 진행 가능 | |
| 2026-04-28 | **변환 레이어 인터페이스 박힘** (§3.7) — Phase v2.1 의 1단계 완료. 다음: 시나리오 픽스처 작성 (2단계) | §3.7, §10 |
| 2026-04-28 | **시나리오 픽스처 11개 작성 완료** — `tests/fixtures/daily-blocks/`. 다음: 테스트 러너 도입 결정 + 스켈레톤 (2단계 마무리) | §3.7.4, §10 |
| 2026-04-28 | **vitest 도입 + 러너 스켈레톤 완료** — Phase v2.1 의 2단계 마무리. 4 pass / 30 fail (stub 의도) / 34 skipped. 다음: SQL 스키마 (3단계) | §10 |
| 2026-04-28 | **SQL 스키마 작성 완료** — `migrate-purge-daily-pages.sql`, `migrate-create-daily-blocks.sql`. 사용자 Supabase 실행 대기. 다음: 변환 레이어 구현 (4단계) | §10 |
| 2026-04-28 | **Supabase 실행 완료** — 사전 폐기 + v2 스키마 적용. Phase v2.1 의 3단계 종료. 다음: 변환 레이어 구현 (4단계) | §10 |
| 2026-04-28 | **변환 레이어 구현 완료** — `blocksToDoc` / `docToBlocks` / `docsEqual`. 픽스처 11개 단위 테스트 34/34 통과. Phase v2.1 의 4단계 종료. 다음: useDailyBlocks 훅 + 통합 (5단계) | §10 |
| 2026-04-28 | **5단계 신규 모듈 + 테스트 완료** — Mapper / Ops / Merge / 훅 / blockIdV2 / carryOverPipelineV2. 누적 94 passed / 0 failed / 34 skipped. 기존 컴포넌트 교체는 사용자 복귀 후. | §10, §11 |
| 2026-04-30 | **트리 정밀화 완료** — `toCarryOverSubtree` + `filterRootCandidates` 로 root+자손 묶음 이월. 109 passed / 0 failed / 34 skipped (+15) | §10 (Phase v2.2) |
| 2026-04-30 | **§9.9 모순 발견** — fixed 섹션 row 의 `section_id` FK vs R6 자기참조 충돌. 옵션 A (self-reference + section_master_id 분리) 권장. 사용자 합의 + 추가 마이그레이션 SQL 필요 | §3.2.1, §3.7.3, §9.9 |
| 2026-04-30 | **§9.9 옵션 A 채택**. SQL `migrate-daily-blocks-section-self-ref.sql` 작성, 명세 §3.2.1/§3.4/§3.7.1 갱신, 픽스처 11개 + mapper / 변환 레이어 / pipeline 모두 sectionMasterId 반영. 111 passed / 0 failed / 34 skipped. 사용자 SQL 실행 대기 | §3.2.1, §3.4, §3.7.1, §9.9, §11 |
| 2026-04-30 | **§9.9 SQL 실행 완료**. `worklogTemplateV2.js` 신규 (17 tests) + carryOverPipelineV2 의 sectionId 매핑 추가 (`buildSectionIdMap` + `toCarryOverSubtree(..., sectionIdMap)`, 6 tests). 누적 134 passed / 0 failed / 34 skipped | §11 |
| 2026-04-30 | **DailyPageV2.jsx 골격 작성** (옵션 1 채택). useDailyBlocks + 변환 레이어 + carryOverLazy + syncThreadCheckbox + Quick Todo 이벤트 구독 통합. 빌드 통과, 사이트 영향 0 (호출처 미연결) | §11 |
| 2026-04-30 | **TipTapTestPage 분기 추가**: daily 면 DailyPageV2 렌더 / loadContent / handleUpdate / saveImmediately 가 daily 시 early return / `createDailyPageV2.js` 신규 (pages INSERT + section row + 이월) / handleCreateDailyPage / goToNextWorklog 가 v2 헬퍼 사용. 빌드 통과, 134 tests 통과. **dev 서버 검증 필요** | §11 |
| 2026-05-01 | **dev 서버 검증 1차 통과**: 새 daily 페이지 생성 → 4개 고정 섹션 즉시 표시. 컬럼명 `name` (title 아님) + `position` 누락 수정, `pages-refresh` 이벤트 발행 추가, BubbleMenu race 회피 (`initialLoaded` 플래그). v2 자유 섹션 추가 버튼 (DailyPageV2 내장) 작성. 진단 로그 정리 | §11 |
| 2026-05-01 | **사용자 입력 selection 점프 해소** + 페이지 마운트 시 4섹션 표시 안정화. `flattenDoc` 가 doc 최상위 섹션 토글의 blockId 를 후속 형제 토글의 sectionId 로 상속 (NOT NULL 회피). `genBlockId` 를 UUID 로 통일 (v1 의 `'blk_'` prefix 폐기, §3.3). 각 섹션에 빈 자식 토글 자동 INSERT (입력 시작점). PageContext 에 `fetchPages` 노출하여 새 daily 페이지 즉시 렌더. `stableDoc` state + typing 가드 + "비어있다 → 콘텐츠 채워질 때 무조건 박음" 우선 규칙으로 selection 보존 + 첫 렌더 모두 통과 | §11 |
| 2026-05-01 | **체크박스 thread sync graceful degrade** — `syncThreadCheckbox` 가 `.or()` 단일 쿼리 대신 block_id / origin_block_id 두 번 update 로 분리. PostgREST schema cache 가 stale 일 때도 자기 자신 update 는 통과, origin 매칭만 silent skip. cache 갱신 후 자동 정상화 | §11 |
| 2026-05-04 | **이월 통합 완료**: "오늘" 버튼이 v2 `createDailyPageV2` 사용 + KST 기준 dateKey, 빈 페이지 회복 모드 (이미 만들어진 v1-style 페이지 자동 row 채움), `buildSectionIdMap` textContent fallback (옛 NULL master 매핑), 이월 root 들 position 1,2,3 으로 매겨 빈 자식(999) 위 정렬, 빈 textContent todo 는 이월 후보 제외. carryOverEager / 카드 안 정렬 모두 정상 검증 | §10 Phase v2.2, §11 |
| 2026-05-04 | **자유 섹션 빈 자식 토글 + 이월 태그 최초 원본 날짜 보존** — `handleAddSection` 이 섹션 row + 빈 자식 토글 동시 INSERT (입력 시작점). `toCarryOverRow` / `toCarryOverSubtree` 의 `carryOverFrom` 이 `src.carryOverFrom \|\| src.pageDate` 로 변경되어 재이월 시 최초 원본 날짜 유지 | §11 |
| 2026-05-04 | **§10 Phase v2.3 출범 1단계 — v1 dead code 정리**: `daily_blocks` 의 옛 NULL `section_master_id` 102/109 backfill (textContent 매칭). TipTapTestPage 의 v1 `syncCarryOver` 함수 + 호출 + daily 분기 (filter master/order/markDuplicate) + `_dismissed` useEffect 모두 제거. import 정리 (`backfillBlockIds`/`filterNewCarryOvers`/`buildCarryOverNodes`/`readDismissedIds`/`writeDismissedIds`/`SECTION_IDS` 정적 import). 빌드 + 139 tests 통과 | §10 Phase v2.3, §11 |
| 2026-05-07 | **B. todo 코멘트 (popover + thread 귀속)**: `CommentPopover.jsx` 추가 (anchor 옆 fixed positioning + 외부클릭/ESC 닫힘). `useWorklogComments` 가 daily 일 때 page 코멘트 + thread id 기반 다른 페이지 코멘트도 union fetch. `target_id = originBlockId \|\| blockId` 로 변경하여 코멘트가 이월 thread 따라감. ToggleExtension 의 `section-comment-click` detail 에 originBlockId 추가 | §11 |
| 2026-05-07 | **A2. v1 dead code 추가 정리** — `markDuplicateBlocks` / `applySectionOrder` / `blockCountRef` 함수/ref 제거. handleUpdate 의 daily 중복 마킹 분기 폐기. v2 row 모델에서는 thread 단위라 같은 텍스트 중복 자체가 의미 약화. 빌드 + 139 tests 통과 | §10 Phase v2.3, §11 |
| 2026-05-07 | **자물쇠 → 왕관** UI 변경 (마스터 전용 visibility 토글). UI 라벨 "관리자" → "마스터" 전체 통일. AdminModal 의 admin role 옵션 제거 (사용자 / 마스터 만). DB `migrate-merge-admin-into-master.sql` 으로 admin role 사용자 → master 변경 + CHECK constraint 갱신 | §11 |
| 2026-05-07 | **C. §6.3 Leftover 관리 UI** 추가 — `useLeftoverTodos` 훅 (3년 초과 thread 조회 + completeThread / deleteThread). `LeftoverManager` 모달 + CSS. CalendarView 헤더에 "오래된 todo 정리" 버튼 진입점 | §6.3, §11 |

---

## 부록 A: 조사 요약 (2026-04-28)

v1 모델의 한계가 가장 두드러진 지점들을 코드 경로와 함께 정리한다.

- **autosave race 회피책**: `TipTapTestPage.jsx::handleUpdate` 의 functional `setContent`, `editor.storage.toggle.isReloading` 플래그, `stripDismissed` — 모두 "JSON 한 컬럼 + React state" 모델의 race 를 다층으로 막는 코드.
- **이월 비용**: `ToggleExtension.js::syncBlockAcrossPages` 가 90일치 daily 페이지를 끌어와 텍스트 검색으로 1차 컷, 이후 트리 순회. 페이지 1개 체크박스 클릭 = 최대 90개 페이지 JSON 다운로드 + 업데이트.
- **`_dismissed` 의 취약성**: TipTap 직렬화 대상 아님 → React state 가 단일 소스 → 함수형 setContent 강제. 한 군데라도 direct form 호출 시 유실 (실제 발생, v1 §4.8 에서 수정).
- **검색 부재**: `worklogUtils.js::parseTodoStats` 가 클라이언트 메모리 순회. SQL 쿼리로 같은 작업 불가.
- **무결성 사후 처리**: blockId 누락 → `backfillBlockIds` 1회 실행. master 섹션 유실 → autosave merge 우회. 모두 한 컬럼 모델의 구조적 위험을 사후적으로 막는 코드.

조사 시점의 코드 경로 (file:line 까지 필요한 경우 v1 §11 / §12.7 참조).

---

> 본 문서는 **기획서**이며 구현 착수 전이다. §9 의 결정 사항이 합의되기 전까지 코드 변경 금지.
