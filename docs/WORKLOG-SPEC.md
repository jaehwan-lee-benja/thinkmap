# 업무일지 기획서 (WorkLog Specification)

> 작성일: 2026-04-12
> 최종 업데이트: 2026-04-21
> 상태: Phase 1~6 완료
> 관련 페이지: CalendarView, daily 페이지 시스템, WorklogComments

---

## 1. 배경 및 목적

### 1.1 현재 상황
- 일반 페이지(`page_type: 'normal'`)에 날짜별 토글로 업무일지 14건 작성 중
- 수동으로 날짜 토글 생성, 미완료 항목 수동 복사(이월)
- 완료 표시가 `(완료)` 텍스트 → `isTodo` 체크박스로 자연스럽게 전환됨
- 별도 "투두" 페이지와 이중 관리 발생
- 캘린더 뷰(`page_type: 'calendar'`)는 껍데기만 존재, daily 페이지 0건

### 1.2 목표
- 캘린더 뷰 기반의 **구조화된 일별 업무일지** 시스템 구축
- **고정 섹션 + 자유 섹션** 조합으로 유연한 양식 제공
- **이월 기능**으로 미완료 항목 자동 관리
- **@멘션 코멘트**로 팀 내 커뮤니케이션 지원

---

## 2. 데이터 구조

### 2.1 기존 테이블 활용
```
pages 테이블:
  - page_type: 'daily'
  - page_date: DATE (캘린더 위치 결정)
  - parent_id: calendar 페이지 ID
  - content_tiptap: JSONB (아래 구조)
```

### 2.2 신규 테이블: worklog_comments
```sql
CREATE TABLE worklog_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 코멘트 위치
  target_type TEXT NOT NULL CHECK (target_type IN ('section', 'todo', 'page')),
  target_id TEXT,              -- 섹션 ID 또는 todo 블록의 위치 식별자
  
  -- 내용
  content TEXT NOT NULL,
  mentions JSONB DEFAULT '[]', -- [{ "email": "...", "display_name": "..." }]
  
  -- 상태
  resolved BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_worklog_comments_page ON worklog_comments(page_id, created_at DESC);
CREATE INDEX idx_worklog_comments_mentions ON worklog_comments USING GIN(mentions);
```

### 2.3 신규 테이블: worklog_sections (2026-04-20 추가)
```sql
-- 업무일지 섹션 정의 테이블
-- 고정/pinned 섹션의 ID를 중앙 관리하여 이월 시 섹션 매칭에 사용
CREATE TABLE worklog_sections (
  id            text PRIMARY KEY,          -- 'fixed_todo', 'fixed_notice', 'sec_xxx...'
  title         text NOT NULL,
  section_type  text NOT NULL DEFAULT 'fixed',  -- 'fixed' | 'pinned'
  is_default    boolean NOT NULL DEFAULT true,   -- 새 daily 생성 시 자동 포함
  sort_order    int NOT NULL DEFAULT 0,
  visibility    text NOT NULL DEFAULT 'all',     -- 'all' | 'master'
  parent_id     text REFERENCES worklog_sections(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 고정 섹션 시드 데이터
-- fixed_todo, fixed_notice, fixed_wrapup, fixed_daily_issue
```

**설계 원칙**: 섹션 이름이 아닌 **ID로 식별**. 이전에는 `sectionTitle === '할 일'` 같은 이름 매칭이었으나, `worklog_sections` 테이블의 안정적인 ID로 전환.

### 2.4 신규 테이블: worklog_templates (향후)
```sql
-- 업무일지 전용 섹션 템플릿 (page_templates와 별도, 향후 구현)
CREATE TABLE worklog_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sections JSONB NOT NULL DEFAULT '[]',
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.5 신규 테이블: worklog_user_settings (2026-04-20 추가)
```sql
-- 업무일지 계정별 설정 (섹션 순서 등)
CREATE TABLE worklog_user_settings (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  section_order  jsonb DEFAULT '[]',   -- worklog_sections.id 배열
  updated_at     timestamptz NOT NULL DEFAULT now()
);
```

계정별 섹션 표시 순서를 저장. `section_order`가 빈 배열이면 `worklog_sections.sort_order` 기본값 사용.

---

## 3. Daily 페이지 구조

### 3.1 페이지 헤더

- **페이지 이름**: `업무일지_2026-04-21(월)` — `dailyPageName()` 유틸로 생성
- **헤더 버튼**: ◁(전날) ▷(다음날) 캘린더 삭제
- 날짜/작성자 메타 정보는 표시하지 않음 (페이지 이름에 포함)

### 3.2 섹션 구성

#### A. 고정 섹션 (기본 제공)

```
━━ 할 일 ━━━━━━━━━━━━━━━━━━━━━━━━━
  [이월] ☐ 오픈 시점 루틴 비치하기          ← 전날 미완료 자동 이월
  [이월] ☐ 구급상자 약 정리                 ← 전날 미완료 자동 이월
  ☐ 오늘 새로운 할일 입력...               ← 빈 입력 필드

━━ 전달사항 ━━━━━━━━━━━━━━━━━━━━━━━
  ▶ (자유 텍스트 영역)

━━ 마무리 기록 ━━━━━━━━━━━━━━━━━━━━━
  ▶ 당일 이슈
    ▶ ...
```

| 섹션 | 설명 | 특징 | 기본 권한 |
|---|---|---|---|
| **할 일** | todo 체크리스트 | 이월 자동, 체크박스, 하위 토글 지원 | all |
| **전달사항** | 직원/이사 간 전달 메모 | 일반 토글 블록 | all |
| **마무리 기록** | 하루 마감 시 작성 | "당일 이슈" 하위 섹션 포함 | all |

#### B. 자유 섹션 (사용자 추가/삭제 가능)

```
━━ 구매 목록 ━━━━━━━━━━━━ [✕ 삭제] [↕ 이동]
  ▶ 말렌카통 주문
  ▶ 머그컵 추가 구매

━━ 교육 기록 ━━━━━━━━━━━━ [✕ 삭제] [↕ 이동]
  ▶ 우영님 커피 오픈/마감 교육(3일차)
```

- **[+ 섹션 추가]** 버튼으로 자유 섹션 생성
- 섹션 제목 직접 입력
- 드래그로 순서 변경 가능
- 삭제 가능 (고정 섹션은 삭제 불가, 숨기기만 가능)
- 자주 쓰는 자유 섹션은 **템플릿에 저장** 가능

### 3.3 content_tiptap 저장 구조

```json
{
  "type": "doc",
  "content": [
    {
      "type": "worklogSection",
      "attrs": {
        "sectionId": "todos",
        "sectionType": "fixed",
        "title": "할 일",
        "order": 0,
        "visibility": "all"
      },
      "content": [
        {
          "type": "toggle",
          "attrs": {
            "isTodo": true,
            "todoChecked": false,
            "isCarryOver": true,
            "carryOverFrom": "2026-04-11"
          },
          "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "오픈 시점 루틴 비치하기" }] }
          ]
        },
        {
          "type": "toggle",
          "attrs": { "isTodo": true, "todoChecked": false },
          "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "새 할일" }] }
          ]
        }
      ]
    },
    {
      "type": "worklogSection",
      "attrs": {
        "sectionId": "notices",
        "sectionType": "fixed",
        "title": "전달사항",
        "order": 1,
        "visibility": "all"
      },
      "content": [...]
    },
    {
      "type": "worklogSection",
      "attrs": {
        "sectionId": "custom_abc123",
        "sectionType": "custom",
        "title": "구매 목록",
        "order": 2,
        "visibility": "all"
      },
      "content": [...]
    },
    {
      "type": "worklogSection",
      "attrs": {
        "sectionId": "closing",
        "sectionType": "fixed",
        "title": "마무리 기록",
        "order": 99,
        "visibility": "master"
      },
      "content": [...]
    }
  ]
}
```

---

## 4. 이월 기능

### 4.0 데이터 방식 결정 (2026-04-14 확정)

**A 방식 (JSON 복사) 채택.**

- 이월된 todo는 새 페이지의 `content_tiptap` JSON 안에 **독립된 사본**으로 복사
- 원본과 사본은 별개 데이터 — 한쪽 수정이 다른 쪽에 영향 없음
- `isCarryOver: true`, `carryOverFrom: "YYYY-MM-DD"` 속성으로 출처 추적
- B 방식(별도 todo 테이블에서 공유 참조)은 현재 구조와 맞지 않아 보류. 향후 필요 시 마이그레이션 가능

### 4.1 이월 대상
- **미완료 todo**: `isTodo: true && todoChecked: false` — 하위 블록 포함 전체 노드 복사
- **고정(pinned) 블록**: `isPinned: true` — 투두가 아닌 일반 텍스트도 고정하면 다음 날에 이월
- `todoStatus: "hold"` 항목은 이월하되 별도 표시
- 이월 시 하위 블록(들여쓰기된 자식 토글)이 모두 함께 복사됨

> **변경 이력 (2026-04-21)**: 이전에는 텍스트만 추출했으나, 전체 노드(하위 블록 포함)를 deep clone하여 이월. pinned 텍스트 블록도 이월 대상에 추가.

### 4.2 이월 타이밍
- **새 daily 페이지 생성 시** 자동 실행
- 가장 최근 daily 페이지의 미완료 항목을 스캔

### 4.3 이월 로직
```
1. 새 daily 페이지 생성 요청
2. 같은 calendar 하위의 가장 최근 daily 페이지 조회
3. 해당 페이지의 모든 섹션에서 미완료 todo 추출 (sectionId와 함께)
4. 새 페이지에서 동일 sectionId의 섹션에 [이월] 태그와 함께 삽입
5. 원본에는 carryOverTo: "새_페이지_날짜" 표시 (추적용)
```

> **변경 이력 (2026-04-20)**: 이전에는 "할 일" 섹션에서만 이월했으나, 모든 섹션(고정/pinned)의 미완료 투두를 원래 섹션으로 이월하도록 수정. 섹션 매칭은 이름이 아닌 `worklog_sections.id` 기반.

> **변경 이력 (2026-04-21)**: 이월 �� 전체 노드(하위 블록 포함) deep clone. 완료된 상위 todo라도 하위에 미완료가 있으면 완료 상태 ���지한 채 이월. `todoId`/`originTodoId` 기반 thread 동기화 추가 — 원본 완료 시 이월본도 자동 완료.

### 4.4 이월 데이터 구조

toggle 노드에 추가되는 속성:
```json
{
  "isCarryOver": true,
  "carryOverFrom": "2026-04-11",
  "blockId": "blk_abc12345",
  "originBlockId": "blk_xyz67890"
}
```
- `isCarryOver` (boolean) — 이 항목이 이월된 사본인지
- `carryOverFrom` (string, YYYY-MM-DD) — 어느 날짜에서 이월되었는지
- `blockId` (string) — 각 블록의 고유 ID (`blk_` prefix). 생성은 `utils/blockId.js::genBlockId()` 단일 진입점으로 일원화
- `originBlockId` (string) — 이월 원본의 blockId (thread 추적, 교차 페이지 동기화에 사용)

> **변경 이력 (2026-04-21)**: `todoId`/`originTodoId` → `blockId`/`originBlockId` 리네이밍. pinned 텍스트 블록도 같은 구조로 관리.

**최초 원본 추적 규칙:** 이월본을 다시 이월할 때 `originBlockId`는 **최초 원본**을 가리켜야 한다. 구현: `toCarryOverNode`/`syncCarryOver`에서 `originBlockId = node.attrs.originBlockId || node.attrs.blockId`로 결정. 즉 이전 이월본의 `originBlockId`가 있으면 그걸 그대로 승계.

### 4.5 교차 페이지 완료 동기화 (Thread 방식)

원본 todo 완료/해제 시 같은 `originBlockId`를 가진 이월본도 자동 동기화.

```
21일: blockId: 'blk_abc' (원본) → 완료 처리
22일: blockId: 'blk_xyz', originBlockId: 'blk_abc' (이월본) → 자동 완료
```

- 범위: 최근 `CARRY_OVER_SYNC_WINDOW_DAYS`(=90)일 이내의 daily 페이지. `ToggleExtension.js::syncBlockAcrossPages`
- `blockId` 문자열 포함 여부로 관련 없는 페이지를 조기 컷
- 매칭된 페이지의 content_tiptap을 업데이트 후 `quicktodo-inserted` 이벤트 발행
- 하위 블록의 todo도 각각 독립적 `blockId`를 가지며 개별 동기화

> **변경 이력 (2026-04-21)**: 기존 `limit(7)` 하드코딩 제거. 일자 갭이 7일 이상이면 동기화가 끊기던 문제 해결.

### 4.6 페이지 열 때 이월 동기화 (Lazy Carry-Over)

이미 생성된 daily 페이지를 열 때, 이전 날짜에 새로 추가된 미완료 todo를 자동 삽입.

**동작 원리 (2026-04-21: 파이프라인 단일화):**

Eager(새 daily 생성)와 Lazy(기존 daily 열람) 양쪽 모두 `utils/carryOverPipeline.js`의 동일한 함수를 공유한다.

1. daily 페이지 로드 시 `syncCarryOver()` 실행
2. `backfillBlockIds(prev)` — 이전 페이지에 blockId 없는 legacy 블록에 부여 (1회)
3. `extractCarryOverData(prev, prevDate)` — 이월 후보 추출
4. `filterNewCarryOvers(candidates, current, dismissedIds)` — 신규만 필터
5. `buildCarryOverNodes(candidates)` — `toCarryOverNode`로 노드 생성
6. `insertIntoH2Sections(content, bySection)` — sectionId별 h2 섹션에 삽입
7. DB 자동 저장

**중복 방지 3단계** (`filterNewCarryOvers`):
1. 원본 `blockId`가 현재 페이지의 blockId/originBlockId 집합에 이미 있으면 건너뜀
2. 원본 `blockId`가 `_dismissed`에 있으면 건너뜀 (삭제 의사 존중)
3. legacy 항목(blockId 없음)은 텍스트 중복으로 판정

**트리거:**
| 트리거 | 설명 |
|---|---|
| **페이지 전환** | `currentPageId` 변경 → `loadContent()` |
| **브라우저 탭 복귀** | `visibilitychange` → `loadContent()` |
| **Quick Todo 삽입** | `quicktodo-inserted` 이벤트 → `loadContent()` |
| **Todo 완료 동기화** | `quicktodo-inserted` 이벤트 → `loadContent()` |

**설계 원칙:** `loadContent`가 유일한 콘텐츠 로드 진입점. 모든 트리거가 이 함수를 호출하므로 이월 동기화도 자동으로 실행됨.

### 4.7 이월 표시 UI
```
[이월 04/11] ☐ 오픈 시점 루틴 비치하기
```
- 연한 배경색 또는 태그로 이월 항목 구분
- 이월 원본 날짜 표시 (클릭 시 해당 날짜로 이동 가능)

### 4.8 재이월 차단 메커니즘 (_dismissed, 2026-04-21)

**요구사항:** 사용자가 이월본을 **삭제 경로와 무관하게** 지우면 재이월되지 않아야 한다.

**데이터 위치:** `content_tiptap._dismissed: string[]` — 삭제된 `blockId`/`originBlockId` 목록. 루트에 붙는 비표준 키이므로 접근은 반드시 `utils/carryOverPipeline.js`의 유틸로만:
- `readDismissedIds(content)` — Set 반환
- `writeDismissedIds(content, set)` — 새 content 반환
- `stripDismissed(content)` — TipTap editor에 넘기기 전 제거

**삭제 감지 (단일 진입점):** `ToggleExtension.js`의 ProseMirror plugin `carryOverDismissTracker`가 모든 transaction 후 `view.update`에서 이전/현재 문서를 비교. 사라진 `isCarryOver` 또는 `isPinned` 블록이 있으면 `block-dismissed` DOM 이벤트를 발행한다. 이로써 휴지통 버튼/Backspace/멀티셀렉트/드래그 모든 경로를 커버.

**setContent로 인한 오탐지 방지:** `editor.commands.setContent` 호출 직전 `editor.storage.toggle.isReloading = true`로 플래그. plugin은 이 플래그가 켜진 동안 감지를 건너뛴다. `Promise.resolve().then(...)`으로 transaction 완료 후 해제.

**저장 race 방지 (핵심 함정):**
- React state `content`에 `_dismissed`를 유지해야 autosave가 보존한다. editor는 `_dismissed`를 모르므로 `editor.getJSON()` 결과에는 빠져 있다.
- `handleUpdate(newContent)`는 반드시 **functional form** `setContent(prev => ...)`로 호출해야 `block-dismissed` 핸들러가 큐에 넣은 `_dismissed` 업데이트를 덮어쓰지 않는다. direct form `setContent(merged)`는 race를 유발해 `_dismissed`가 유실됨 (2026-04-21 재현/수정 완료).
- 에디터에 전달하는 prop은 `stripDismissed(content)`로 정제 — 비교 로직이 오작동하지 않도록.

### 4.9 이전/다음 업무일지 네비게이션 (2026-04-21)

WorklogHeader의 좌/우 화살표 동작. `TipTapTestPage.jsx::goToPrevWorklog`, `goToNextWorklog`.

| 버튼 | 툴팁 | 동작 |
|---|---|---|
| ← | "이전 업무일지로 가기" | **과거** daily 중 가장 최근 페이지로 점프. 없으면 `alert('이전 업무일지는 없습니다.')`. **신규 생성 절대 안 함** |
| → | "다음 업무일지로 가기" | **미래** daily 중 가장 가까운 페이지로 점프. 없으면 다음날 날짜로 `confirm`, 확인 시만 생성 |

> **변경 이유:** 기존 `navigateToDailyPage(dateKey)`는 "전날/다음날"을 확정 날짜로 계산 후 없으면 무조건 생성했다. 뒤로 가기에서 원치 않는 신규 페이지가 만들어지고 이월까지 동반되는 버그가 있었다. 좌/우 비대칭으로 재설계.

---

## 5. @멘션 코멘트 시스템

### 5.1 코멘트 진입점
- 각 **섹션 헤더** 옆 💬 아이콘
- 각 **todo 항목** 옆 💬 아이콘 (호버 시 표시)
- 페이지 하단 **전체 코멘트 영역**

### 5.2 @멘션 동작
```
입력: "@" 타이핑 → 드롭다운에 프로젝트 멤버(shares + linked_accounts) 목록 표시
선택: 멤버 선택 → "@김매니저" 태그 삽입
저장: worklog_comments.mentions에 기록
```

### 5.3 멘션 대상 조회
```javascript
// shares 테이블 + linked_accounts 테이블에서 현재 프로젝트에 접근 가능한 사용자 목록
const mentionableUsers = [
  ...sharesUsers,      // 프로젝트/페이지 공유된 사용자
  ...linkedAccounts,   // 연결된 계정
  currentUser          // 본인
]
```

### 5.4 코멘트 UI
```
┌─ 💬 코멘트 (2) ──────────────────────┐
│                                       │
│  김매니저 · 04/12 14:30               │
│  @이사님 카이막 빵쪽 매뉴얼 검토 부탁드립니다  │
│                                       │
│  이사님 · 04/12 15:10                 │
│  확인했습니다. 수정본 반영해주세요 ✅          │
│  [해결됨으로 표시]                      │
│                                       │
│  ┌────────────────────────────┐       │
│  │ 코멘트 입력... @            │       │
│  └────────────────────────────┘       │
└───────────────────────────────────────┘
```

### 5.5 알림 (향후 확장)
- 현재: 코멘트 배지 표시 (캘린더 뷰에서 💬 아이콘)
- 향후: 멘션된 사용자에게 알림 (잔디/이메일 연동 등)

---

## 6. 자유 섹션 관리

### 6.1 섹션 추가
```
[+ 섹션 추가] 클릭
  → 섹션 제목 입력 모달
  → "할 일" 아래, "마무리 기록" 위에 삽입
```

### 6.2 섹션 편집
- **제목 변경**: 섹션 헤더 클릭하여 인라인 편집
- **순서 변경**: 섹션 헤더의 ▲/▼ 버튼으로 이동, 순서는 `worklog_user_settings.section_order`에 계정별 저장 (2026-04-20)
- **삭제**: 자유 섹션만 삭제 가능, 확인 다이얼로그

### 6.3 템플릿 저장/적용
```
[⚙️ 양식 설정] 버튼 (캘린더 뷰 상단)
  → 현재 섹션 구성을 기본 템플릿으로 저장
  → 이후 새 daily 페이지 생성 시 이 템플릿 적용
```

---

## 7. 캘린더 뷰 개선

### 7.1 날짜 셀 표시
```
┌──── 12(토) ────┐
│ ☑ 3/5 완료      │   ← 할일 완료율
│ 💬 2            │   ← 코멘트 수
│ 커피 교육...     │   ← 첫 번째 할일 미리보기
└────────────────┘
```

### 7.2 빈 날짜 클릭
- [+] 버튼 → daily 페이지 생성 + 템플릿 적용 + 이월 실행

### 7.3 기존 날짜 클릭
- daily 페이지 에디터로 이동

---

## 8. 구현 순서 (Phase)

### Phase 1: 기본 구조 (MVP) — ✅ 완료 (2026-04-14)
- [x] ~~`worklogSection` TipTap 커스텀 노드~~ → 기존 toggle 노드 + `blockType` 속성으로 대체 (별도 노드 불필요)
- [x] daily 페이지 생성 시 고정 섹션 3개 자동 삽입
- [x] 페이지 헤더에 전날/다음날/캘린더/삭제 버튼
- [x] 캘린더 뷰에서 daily 페이지 생성/열기 연동
- [x] 기존 양식(page_templates) 관련 UI 제거
- [x] 섹션 카드 레이아웃 (구글 설문지 스타일, daily 페이지 전용)
- [x] 건조한 스타일 철학 적용 (폰트 크기/밑줄/장식 제거)

### Phase 2: 자유 섹션 — ✅ 완료 (2026-04-14)
- [x] [+ 섹션 추가] 기능
- [x] 섹션 삭제 (고정 섹션 보호 — `isFixedSection`)
- [x] 섹션 pin 기능 (pinned 섹션은 새 daily 페이지에 자동 포함)
- [x] 섹션 제목 인라인 편집 — 토글 첫 paragraph에서 직접 편집 (별도 UI 불필요)
- [x] 섹션 순서 드래그 — 기존 토글 드래그 핸들로 동작
- [ ] 섹션 구성을 worklog_templates에 저장 (향후)

### Phase 3: 이월 기능 — ✅ 완료 (2026-04-14, 2026-04-20 보강)
- [x] `isCarryOver`, `carryOverFrom` 속성 추가 (toggle 노드)
- [x] 이전 daily 페이지 미완료 todo 스캔
- [x] 새 페이지 생성 시 이월 항목 자동 삽입
- [x] [이월 MM/DD] 태그 UI 표시
- [x] 이월 원본 추적 — 최초 출처 날짜 유지 (반복 이월 시에도 원본 날짜 보존)
- [x] **모든 섹션 이월** — "할 일" 섹션뿐 아니라 모든 고정/pinned 섹션의 미완료 투두를 원래 섹션으로 이월 (2026-04-20)
- [x] **섹션 ID 기반 매칭** — `worklog_sections` 테이블의 안정적 ID로 섹션 식별, 이름 하드코딩 제거 (2026-04-20)

### Phase 4: @멘션 코멘트 — ✅ 기본 완료 (2026-04-14)
- [x] worklog_comments 테이블 생성 + RLS (`create-worklog-comments-table.sql`)
- [x] useWorklogComments 훅 (CRUD + 실시간 구독 + 멘션 사용자 목록)
- [x] 코멘트 입력 UI (페이지 하단 전체 코멘트 영역)
- [x] @ 타이핑 시 멤버 드롭다운
- [x] 코멘트 목록 표시 + 해결됨 토글
- [x] 섹션별 코멘트 — h2 섹션 헤더에 💬 아이콘, 클릭 시 해당 섹션 코멘트 필터링
- [ ] todo별 코멘트 (향후 확장)
- [x] 캘린더 뷰에 코멘트 배지 (Phase 5에서 구현)

### Phase 5: 캘린더 뷰 강화 — ✅ 완료 (2026-04-15)
- [x] 날짜 셀에 완료율/코멘트 수 표시
- [x] 월간 요약 통계 (완료율, 코멘트 수, 작성일 수)
- [x] "오늘" 바로가기 버튼 (북마크 바 최좌측, 날짜 표시)
  - 오늘자 daily 페이지 존재 시 → 바로 이동
  - 없으면 → 이월/pin 포함 자동 생성 후 이동
  - daily 페이지 생성 로직을 `worklogUtils.buildDailyPageTemplate()`로 통합 (캘린더 "+"와 동일 구조 보장)
  - `fetchPages()` 호출로 로컬 상태 동기화 후 네비게이션

### Phase 6: 섹션별 권한 (Visibility) — ✅ 완료 (2026-04-17)
- [x] 섹션 attrs에 `visibility` 속성 추가 (`"all"` | `"master"`)
- [x] `visibility: "master"` 섹션은 마스터 계정에게만 표시
- [x] `visibility: "all"` 섹션은 모든 접근 계정에게 표시 (기본값)
- [x] 섹션 헤더 UI에 잠금 아이콘 버튼 (마스터만 표시/조작, all↔master 토글)
- [x] 고정 섹션·자유 섹션 모두 권한 설정 가능
- [x] daily 페이지 렌더링 시 현재 사용자 역할에 따라 섹션 필터링
- [x] 이월 시 권한 속성 보존 (pinned 섹션의 visibility 그대로 복사)
- [ ] worklog_templates DB 테이블에 visibility 필드 포함 (향후)

### Phase 4 보충: 캘린더 코멘트 배지 — ✅ 완료 (2026-04-15)
- [x] `useCalendarCommentCounts` 훅 — 배치 코멘트 수 조회 (`.in()` 단일 쿼리)
- [x] 캘린더 셀에 코멘트 수 배지 표시

---

## 9. 현재 데이터 마이그레이션

기존 일반 페이지 업무일지(14건)를 daily 페이지로 이관하는 것은 **선택사항**.
- 기존 데이터는 일반 페이지에 그대로 유지 (참조용)
- 새 업무일지는 캘린더 시스템에서 작성
- 향후 필요시 마이그레이션 스크립트 제공

---

## 10. 기술 부채: RLS 마스터 bypass 하드코딩 — ✅ 해결 (2026-04-15)

`is_master()` 함수(`migrate-dynamic-master.sql`에서 정의)로 일괄 교체 완료.

**교체된 파일**: `master-bypass-rls.sql`, `create-app-users-table.sql`, `create-linked-accounts.sql`, `create-worklog-comments-table.sql`

마스터 변경 시 `app_users` 테이블의 `role` 컬럼만 수정하면 됨.

---

## 10-1. 임퍼소네이션 체계

임퍼소네이션은 업무일지와 **별도의 체계**이다. 상세 명세는 [IMPERSONATION-SPEC.md](./IMPERSONATION-SPEC.md) 참조.

---

## 10-2. 업무일지 통합 접근 문제 (2026-04-16 ~ 진행 중)

**목표**: 모든 승인된 계정이 **임퍼소네이션 없이** 동일한 업무일지(calendar + daily 페이지)를 보고 편집할 수 있어야 함.

**원칙**:
1. 업무일지는 통합된 1개만 존재 (뷰어, 편집 모두 동일)
2. 섹션별 권한은 별도 Phase 6에서 처리 (마스터 전용 섹션 등)
3. 임퍼소네이션은 별도 체계 — 업무일지 접근에 영향을 주지 않아야 함

### 1차 원인 (해결 완료 — 2026-04-16)

RLS 함수(`is_linked_account_viewer` 등)가 `app_users.auth_uid` NULL 레코드 때문에 실패.

**조치**: `fix-linked-account-rls.sql` — `auth.users` 직접 JOIN 방식으로 전환, self-insert/update 정책 추가.

### 2차 원인 (미해결 — 핵심 문제)

RLS는 통과하지만 **클라이언트 쿼리가 본인 프로젝트만 가져옴**.

```
문제 지점: useProjects.js:45
  .eq('user_id', session.user.id)  ← B 로그인 시 B의 프로젝트만
```

업무일지(calendar 페이지)는 A의 프로젝트 하위에 존재 → B는 A의 프로젝트를 로드하지 않으므로 업무일지 자체가 안 보임.

### 해결 방향: 방안 C 확정 — calendar 페이지를 프로젝트에서 분리

프로젝트는 계정에 귀속되는 구조이므로, 업무일지(calendar/daily)를 프로젝트에서 독립시킨다.

**핵심 변경**:
1. `pages.project_id` NOT NULL 제약 해제 (calendar/daily 페이지만 NULL 허용)
2. calendar/daily 페이지 조회를 프로젝트 스코프 밖에서 수행
3. 사이드바 "업무일지" 버튼이 `page_type='calendar'`를 직접 조회 (RLS 기반)
4. 기존 프로젝트 귀속 페이지는 변경 없음

**구현 작업**:
- [x] DB: `pages.project_id` NOT NULL 해제 (ALTER TABLE) — 2026-04-17 실행 완료
- [x] DB: calendar/daily 페이지 RLS — 모든 인증 사용자 접근 가능 — 2026-04-17 실행 완료
- [x] DB: 기존 calendar/daily 페이지의 `project_id`를 NULL로 마이그레이션 — 2026-04-17 실행 완료
- [x] 클라이언트: 사이드바 "업무일지" 클릭 시 `page_type='calendar'` 직접 조회 (project_id 필터 제거)
- [x] 클라이언트: daily 페이지 생성 시 `project_id=NULL`로 생성
- [x] 클라이언트: `usePages` — calendar/daily 페이지는 프로젝트 필터 우회하여 병합 로드
- [x] 마이그레이션 SQL: `migrate-worklog-independent.sql`

**관련 파일**:
- `fix-linked-account-rls.sql` (실행 완료)
- `create-linked-accounts.sql` (함수 동기화 완료)
- `src/hooks/useProjects.js:45` (프로젝트 조회 — 변경 불필요)
- `src/hooks/usePages.js` (calendar/daily 분리 조회 추가)
- `src/components/Sidebar/Sidebar.jsx:77-114` (업무일지 버튼 — 직접 조회로 변경)

### 향후: 가입 승인 시스템

현재는 연결 계정(linked_accounts)으로 접근을 관리하지만, 향후 **계정 가입 시 승인 절차**가 필요하다.

**배경**: 누구나 회원가입하면 업무일지에 접근할 수 있는 것은 보안상 문제. 마스터가 승인한 계정만 서비스를 사용할 수 있어야 한다.

**기본 구상**:
- 회원가입 후 `app_users.status = 'pending'` 상태로 대기
- 마스터가 관리자 패널에서 승인 → `status = 'approved'`
- `pending` 상태의 사용자는 로그인 후 "승인 대기 중" 화면만 표시
- RLS 정책에 `status = 'approved'` 조건 추가
- 업무일지(calendar/daily) 접근도 승인된 계정에만 허용

---

## 10-3. 이월 디버깅 도구

캘린더 뷰 하단에 **이월 테스트 패널**이 내장되어 있다 (마스터 전용, 기본 비활성).

### 활성화 방법

`TipTapTestPage.jsx`에서 `{false && isMaster &&`를 `{isMaster &&`로 변경.

### 버튼 3개

| 버튼 | 기능 |
|---|---|
| **1. 어제 더미 데이터 생성** | 어제 날짜로 daily 페이지 생성. 각 섹션(할 일/전달사항/마무리/당일이슈)에 미완료+완료 todo 포함 |
| **2. 이월 실행** | 오늘 daily 페이지를 이월 포함해서 생성 → 추출 결과를 alert로 표시 → 해당 페이지로 이동 |
| **3. 추출 결과 확인** | 가장 최신 daily에서 `extractCarryOverData()`로 이월 대상만 추출하여 alert (실제 생성 없음) |

### 더미 데이터 구성

```
할 일 (fixed_todo):        미완료 A, B / 완료 C
전달사항 (fixed_notice):    미완료 D / 완료 E
마무리 기록 (fixed_wrapup): 미완료 F
  └ 당일 이슈 (h3 하위):   미완료 하위 / 완료 하위
```

### 기대 이월 결과

A, B → fixed_todo / D → fixed_notice / F → fixed_wrapup / 당일이슈 미완료 → fixed_daily_issue

### 테스트 순서

1번(더미 생성) → 3번(추출 확인) → 2번(이월 실행) → 오늘 페이지에서 각 섹션 확인

---

## 11. 관련 파일 (구현 시 참고)

| 파일 | 역할 |
|---|---|
| `src/components/CalendarView/CalendarView.jsx` | 캘린더 뷰 메인 |
| `src/components/TipTapEditor/TipTapTestPage.jsx` | 페이지 에디터 (daily 페이지 렌더링) |
| `src/components/TipTapEditor/WorklogHeader.jsx` | daily 페이지 헤더 (전날/다음날/캘린더/삭제) |
| `src/components/TipTapEditor/WorklogComments.jsx` | 코멘트 UI (목록/입력/@멘션) |
| `src/components/TipTapEditor/extensions/ToggleExtension.js` | 토글 블록 (todo, pin, 이월 포함) |
| `src/hooks/usePages.js` | 페이지 CRUD + daily 페이지 생성 |
| `src/hooks/useWorklogComments.js` | 코멘트 CRUD + 실시간 구독 |
| `src/utils/worklogConstants.js` | 섹션 ID 상수, 기본 섹션 정의 (SECTION_IDS, FALLBACK_SECTIONS) |
| `src/utils/toggleNodeFactory.js` | TipTap 토글 노드 생성 팩토리 (섹션/투두/이월 등) |
| `src/utils/sectionUtils.js` | 섹션 추출/필터/매칭/삽입 공통 유틸리티 (isH2Section, insertIntoH2Sections, groupBySectionId) |
| `src/utils/worklogTemplate.js` | daily 페이지 초기 템플릿 + `toCarryOverNode` (이월/pin 포함) |
| `src/utils/worklogUtils.js` | todo 통계 파싱 + daily 페이지 생성 공유 유틸리티 |
| `src/utils/carryOverPipeline.js` | 이월 파이프라인 (backfill/filter/build + _dismissed I/O + stripDismissed) |
| `src/utils/blockId.js` | blockId 생성 단일 진입점 (`genBlockId`, `BLOCK_ID_PREFIX`) |
| `src/components/QuickTodo/QuickTodo.jsx` | Quick Todo 인라인 입력 (상단바) |
| `src/components/GlobalTopBar/GlobalTopBar.jsx` | "오늘" 바로가기 버튼 |
| `src/utils/dateUtils.js` | 날짜 유틸 (dailyPageName 등) |
| `migrate-quicktodo-pinned.sql` | Quick Todo 고정 섹션 컬럼 |
| `migrate-approval-system.sql` | 가입 승인 시스템 + RLS |
| `src/hooks/useCalendarCommentCounts.js` | 캘린더용 배치 코멘트 수 조회 훅 |
| `create-worklog-comments-table.sql` | 코멘트 테이블 + RLS |
| `migrate-worklog-sections.sql` | 섹션 정의 테이블 + 고정 섹션 시드 + RLS |
| `migrate-worklog-user-settings.sql` | 계정별 업무일지 설정 테이블 + RLS |
| `src/hooks/useWorklogUserSettings.js` | 계정별 섹션 순서 조회/저장 훅 |
| `alter-pages-add-calendar.sql` | calendar/daily page_type 스키마 |
| `docs/TOGGLE-BLOCK-SPEC.md` | 토글 블록 명세 (todo 속성 포함) |
| `docs/DESIGN-PHILOSOPHY.md` | 건조한 스타일 디자인 철학 |

---

## 12. 리팩토링 기록 (2026-04-21 업데이트)

### 12.0 주요 변경 (2026-04-21)

#### blockId 도입 (todoId → blockId 리네이밍)
- 모든 daily 페이지 블록(h2/h3 섹션 제외)에 `blockId` 자동 부여
- 이월 시 `originBlockId`로 원본 추적
- 체크박스 완료 시 교차 페이지 동기화 (`syncBlockAcrossPages`)

#### 이월 동기화 (Lazy Carry-Over)
- 이미 생성된 daily 페이지를 열 때 이전 날짜의 신규 미완료 todo를 자동 삽입
- blockId 기반 중복 방지 + 텍스트 시그니처 fallback
- `_dismissed` 배열: 사용자가 의도적으로 삭제한 이월 항목은 재삽입 안 함
- 이전 페이지에 blockId가 없으면 자동 backfill

#### 중복 감지
- 같은 섹션 내에서 동일 텍스트 → "중복?" (노란 태그) / "원본 · 중복?" (파란 태그)
- 원본 판정: `isCarryOver: false` = 원본, `isCarryOver: true` = 이월본
- 블록 삭제 시 즉시 재계산 (반응형)

#### 페이지 이름 형식
- daily 페이지: `업무일지_2026-04-21(월)` (기존: `2026-04-21`)
- `dailyPageName()` 유틸 함수로 통일

#### 페이지 활성화 시 최신 로드
- 트리거 A: `currentPageId` 변경 (탭 전환)
- 트리거 B: `visibilitychange` (다른 브라우저 탭에서 복귀)
- 트리거 C: `quicktodo-inserted` 이벤트 (Quick Todo / Block 동기화)
- `loadContent`가 유일한 진입점 — 이월 동기화도 자동 실행

---

### 12.1 daily 페이지 생성 로직 통합
- **이전**: TipTapTestPage(캘린더 "+")와 App.jsx("오늘" 버튼)에 이월/pinned 추출 로직이 30줄씩 복사
- **이후**: `worklogUtils.js`의 `extractCarryOverData()` + `buildDailyPageTemplate()`로 통합
- **효과**: 생성 경로와 무관하게 동일한 daily 페이지 구조 보장

### 12.2 요일 이름 상수 통합
- **이전**: `['일','월','화','수','목','금','토']` 배열이 4개 파일에 중복 정의
- **이후**: `dateUtils.js`의 `DAY_NAMES` 상수를 export하여 GlobalTopBar, CalendarView, WorklogHeader, dateUtils 내부에서 재사용
- **효과**: 단일 소스(single source of truth)

### 12.3 fetchPages 불필요 참조 제거
- **이전**: "오늘" 버튼이 `paneNavRef.fetchPages()`로 페이지 목록을 갱신한 뒤 이동하는 방식
- **이후**: `addTab()`으로 새 탭을 열어 이동하도록 변경 → `fetchPages`가 `paneNavRef`와 `pageCtx`에서 불필요해짐
- **효과**: PaneProvider의 pageCtx 축소, 불필요한 의존성 제거

### 12.4 useMemo 의존성 안정화
- **이전**: `calendarPageIds`의 useMemo 의존성이 `[calendarDailyPages.length, currentPageId]` (불완전)
- **이후**: `calendarDailyPages` 자체를 useMemo로 안정화 → `calendarPageIds`는 `[calendarDailyPages]`에 의존
- **효과**: 페이지 추가/삭제 시 정확한 재계산 보장

### 12.5 RLS 하드코딩 제거
- **이전**: 4개 SQL 파일에서 `auth.jwt() ->> 'email' = 'designerbenja@gmail.com'` 87회 사용
- **이후**: 모든 RLS 정책에서 `is_master()` 함수 호출로 교체
- **효과**: 마스터 계정 변경 시 `app_users.role` 수정만으로 전체 정책 반영

### 12.6 일회용 마이그레이션 파일 정리
- `fix-worklog-comments-rls.sql` 삭제 (Supabase에서 실행 완료된 일회용 스크립트)

### 12.7 이월 파이프라인 정리 (2026-04-21)

**배경:** 이월 로직이 여러 파일에 산재하고, `blockId` 생성·섹션 매칭·`_dismissed` 접근이 각 파일마다 다르게 구현되어 있었다. 삭제 경로에 따라 재이월 방지가 비일관적.

- **blockId 생성 일원화**: `utils/blockId.js::genBlockId()`. 기존 `'blk_' + Math.random()...` 인라인 9곳 치환
- **섹션 삽입/그룹핑**: `sectionUtils.js`에 `insertIntoH2Sections`, `groupBySectionId` 추가. Eager/Lazy 공용
- **originBlockId 체인 버그 수정**: 이월본의 재이월 시 `originBlockId`가 이전 이월본을 가리키던 문제 → `originBlockId || blockId` 우선순위로 **최초 원본** 추적 보존
- **이월 파이프라인 단일화**: `utils/carryOverPipeline.js` 신설. `backfillBlockIds` / `filterNewCarryOvers` / `buildCarryOverNodes` / `readDismissedIds` / `writeDismissedIds` / `stripDismissed`. Eager(`buildDailyPageTemplate`)와 Lazy(`syncCarryOver`) 공통
- **체크박스 동기화 범위**: `limit(7)` → 최근 `CARRY_OVER_SYNC_WINDOW_DAYS`(=90)일 쿼리 (§4.5)
- **재이월 구조적 차단**: `ToggleExtension.js`의 `carryOverDismissTracker` plugin이 `view.update`에서 이전/현재 문서 비교로 삭제된 `isCarryOver`/`isPinned` 블록을 감지 → 삭제 경로 무관하게 `block-dismissed` 이벤트 발행 (§4.8)
- **setContent 오탐지 방지**: `editor.storage.toggle.isReloading` 플래그 + `Promise.resolve().then(...)` 해제
- **autosave race 해결**: `handleUpdate`를 functional `setContent(prev => ...)`로 변경, 에디터에는 `stripDismissed(content)` 전달. direct form으로 호출하면 `block-dismissed` 핸들러의 `_dismissed` 업데이트를 덮어써 유실됨 (실측 재현 후 확정)
- **이전/다음 네비게이션 재설계**: `goToPrevWorklog`(과거 최근, 없으면 alert) / `goToNextWorklog`(미래 최근, 없으면 confirm 후 생성) (§4.9)

---

## 부록: 현재 업무일지 패턴 요약 (14건 분석)

### 작성 빈도
- 2월: 3건 (02/13, 02/23, 02/24)
- 3월: 8건 (03/05, 06, 09, 10, 13, 20, 23, 24, 26, 31)
- 4월: 1건 (04/06)
- 주 2~3회 작성 패턴

### 항목 유형 분포
- **완료 항목**: 약 70% (텍스트 `(완료)` + `todoChecked: true`)
- **미완료 항목**: 약 20% (다음 날짜로 이월되는 경향)
- **정보성 메모**: 약 10% (전달사항, 이슈 기록)

### 자주 등장하는 업무 카테고리
1. 매뉴얼 수정/프린트 (오픈마감, CS, 짬짬이 등)
2. 직원 교육/온보딩
3. 물품 구매/정리
4. 위생/청소 관련
5. 서류 작업 (스캔, 이카운트)
6. 시설 개선/수리
