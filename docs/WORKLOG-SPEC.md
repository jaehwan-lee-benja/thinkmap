# 업무일지 기획서 (WorkLog Specification)

> 작성일: 2026-04-12
> 최종 업데이트: 2026-04-14
> 상태: Phase 1~5 완료
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

### 2.3 신규 테이블: worklog_templates
```sql
-- 업무일지 전용 섹션 템플릿 (page_templates와 별도)
CREATE TABLE worklog_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 섹션 구성
  sections JSONB NOT NULL DEFAULT '[]',
  -- [
  --   { "id": "todos", "type": "fixed", "title": "할 일", "order": 0 },
  --   { "id": "notices", "type": "fixed", "title": "전달사항", "order": 1 },
  --   { "id": "custom_abc", "type": "custom", "title": "구매 목록", "order": 2 },
  --   { "id": "closing", "type": "fixed", "title": "마무리 기록", "order": 99 }
  -- ]
  
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Daily 페이지 구조

### 3.1 페이지 헤더 (메타 정보)

캘린더에서 날짜 클릭 → daily 페이지 생성 시 자동 세팅:

```
┌─────────────────────────────────────┐
│  업무일지                            │
│  📅 2026-04-12(토)    ✏️ 작성자: 김매니저  │
└─────────────────────────────────────┘
```

- **날짜**: `page_date` 기반, 수정 가능 (수정 시 캘린더 위치도 이동)
- **작성자**: 로그인 사용자 자동 표시, `app_users.email` 기반
- **요일**: 날짜에서 자동 계산 표시

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

| 섹션 | 설명 | 특징 |
|---|---|---|
| **할 일** | todo 체크리스트 | 이월 자동, 체크박스, 하위 토글 지원 |
| **전달사항** | 직원/이사 간 전달 메모 | 일반 토글 블록 |
| **마무리 기록** | 하루 마감 시 작성 | "당일 이슈" 하위 섹션 포함 |

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
        "order": 0
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
        "order": 1
      },
      "content": [...]
    },
    {
      "type": "worklogSection",
      "attrs": {
        "sectionId": "custom_abc123",
        "sectionType": "custom",
        "title": "구매 목록",
        "order": 2
      },
      "content": [...]
    },
    {
      "type": "worklogSection",
      "attrs": {
        "sectionId": "closing",
        "sectionType": "fixed",
        "title": "마무리 기록",
        "order": 99
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
- 전날(또는 가장 최근) daily 페이지에서 `isTodo: true && todoChecked: false` 인 항목
- `todoStatus: "hold"` 항목은 이월하되 별도 표시

### 4.2 이월 타이밍
- **새 daily 페이지 생성 시** 자동 실행
- 가장 최근 daily 페이지의 미완료 항목을 스캔

### 4.3 이월 로직
```
1. 새 daily 페이지 생성 요청
2. 같은 calendar 하위의 가장 최근 daily 페이지 조회
3. 해당 페이지의 "할 일" 섹션에서 미완료 todo 추출
4. 새 페이지의 "할 일" 섹션 상단에 [이월] 태그와 함께 삽입
5. 원본에는 carryOverTo: "새_페이지_날짜" 표시 (추적용)
```

### 4.4 이월 데이터 구조

toggle 노드에 추가되는 속성:
```json
{
  "isCarryOver": true,
  "carryOverFrom": "2026-04-11"
}
```
- `isCarryOver` (boolean) — 이 항목이 이월된 사본인지
- `carryOverFrom` (string, YYYY-MM-DD) — 어느 날짜에서 이월되었는지

### 4.5 이월 표시 UI
```
[이월 04/11] ☐ 오픈 시점 루틴 비치하기
```
- 연한 배경색 또는 태그로 이월 항목 구분
- 이월 원본 날짜 표시 (클릭 시 해당 날짜로 이동 가능)

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
- **순서 변경**: 섹션 드래그 핸들로 이동 (마무리 기록은 항상 최하단 고정)
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
- [x] 페이지 헤더에 날짜/작성자 표시
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

### Phase 3: 이월 기능 — ✅ 완료 (2026-04-14)
- [x] `isCarryOver`, `carryOverFrom` 속성 추가 (toggle 노드)
- [x] 이전 daily 페이지 미완료 todo 스캔
- [x] 새 페이지 생성 시 이월 항목 자동 삽입
- [x] [이월 MM/DD] 태그 UI 표시
- [x] 이월 원본 추적 — 최초 출처 날짜 유지 (반복 이월 시에도 원본 날짜 보존)

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

## 10-1. 미해결: 다른 계정에서 업무일지가 안 보이는 문제 (2026-04-15)

**현상**: A 계정이 만든 calendar/daily 페이지가 B 계정에서 보이지 않음.

**원인**: pages 테이블 RLS 정책이 `auth.uid() = user_id`로 제한되어 있어, 생성자 외 계정에서 접근 불가.

**시도한 것**:
1. RLS SELECT/UPDATE 정책에 calendar/daily 페이지 조건 추가 — 같은 프로젝트 멤버면 접근 허용
2. 처음 시도: `pages` 테이블에서 자기 조회 → **infinite recursion** 오류 발생
3. 수정: `projects` 테이블로 멤버십 확인하도록 변경 (`fix-rls-recursion.sql` 실행 완료)
4. 하지만 여전히 다른 계정에서 안 보임 — **추가 디버깅 필요**

**추정 원인**:
- `projects.user_id = auth.uid()` 조건은 프로젝트 소유자만 통과 → B 계정이 프로젝트 소유자가 아니면 여전히 차단
- B 계정이 프로젝트에 접근하는 경로가 shares/linked_accounts인 경우, calendar/daily 조건의 projects 서브쿼리를 통과하지 못함
- **해결 방향**: projects 서브쿼리를 shares/linked_accounts도 포함하도록 확장하거나, app_users 기반으로 변경 필요

**관련 파일**: `fix-rls-recursion.sql`, `migrate-dynamic-master.sql`

**다음 작업 시 확인할 것**:
1. B 계정이 프로젝트에 어떤 방식으로 접근하는지 확인 (shares? linked_accounts? 직접 소유?)
2. RLS 정책의 calendar/daily 조건을 해당 접근 방식에 맞게 수정
3. Supabase SQL Editor에서 `SELECT * FROM projects WHERE user_id = '<B계정 auth.uid>'` 실행하여 B 계정이 프로젝트를 소유하는지 확인

---

## 11. 관련 파일 (구현 시 참고)

| 파일 | 역할 |
|---|---|
| `src/components/CalendarView/CalendarView.jsx` | 캘린더 뷰 메인 |
| `src/components/TipTapEditor/TipTapTestPage.jsx` | 페이지 에디터 (daily 페이지 렌더링) |
| `src/components/TipTapEditor/WorklogHeader.jsx` | daily 페이지 헤더 (날짜/작성자/삭제) |
| `src/components/TipTapEditor/WorklogComments.jsx` | 코멘트 UI (목록/입력/@멘션) |
| `src/components/TipTapEditor/extensions/ToggleExtension.js` | 토글 블록 (todo, pin, 이월 포함) |
| `src/hooks/usePages.js` | 페이지 CRUD + daily 페이지 생성 |
| `src/hooks/useWorklogComments.js` | 코멘트 CRUD + 실시간 구독 |
| `src/utils/worklogTemplate.js` | daily 페이지 초기 템플릿 (이월/pin 포함) |
| `src/utils/worklogUtils.js` | todo 통계 파싱 + daily 페이지 생성 공유 유틸리티 |
| `src/components/GlobalTopBar/GlobalTopBar.jsx` | "오늘" 바로가기 버튼 |
| `src/hooks/useCalendarCommentCounts.js` | 캘린더용 배치 코멘트 수 조회 훅 |
| `create-worklog-comments-table.sql` | 코멘트 테이블 + RLS |
| `alter-pages-add-calendar.sql` | calendar/daily page_type 스키마 |
| `docs/TOGGLE-BLOCK-SPEC.md` | 토글 블록 명세 (todo 속성 포함) |
| `docs/DESIGN-PHILOSOPHY.md` | 건조한 스타일 디자인 철학 |

---

## 12. 리팩토링 기록 (2026-04-15)

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
