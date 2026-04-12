# 업무일지 기획서 (WorkLog Specification)

> 작성일: 2026-04-12
> 상태: 기획 확정 → 구현 대기
> 관련 페이지: CalendarView(작업중), daily 페이지 시스템

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

### 4.4 이월 표시 UI
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

### Phase 1: 기본 구조 (MVP)
- [ ] `worklogSection` TipTap 커스텀 노드 구현
- [ ] daily 페이지 생성 시 고정 섹션 3개 자동 삽입
- [ ] 페이지 헤더에 날짜/작성자 표시
- [ ] 캘린더 뷰에서 daily 페이지 생성/열기 연동
- [ ] 기존 양식(page_templates) 관련 UI 제거 (CLAUDE.md 지시대로)

### Phase 2: 자유 섹션
- [ ] [+ 섹션 추가] 기능
- [ ] 섹션 제목 편집
- [ ] 섹션 삭제 (고정 섹션 보호)
- [ ] 섹션 순서 드래그
- [ ] 섹션 구성을 worklog_templates에 저장

### Phase 3: 이월 기능
- [ ] 이전 daily 페이지 미완료 todo 스캔
- [ ] 새 페이지 생성 시 이월 항목 자동 삽입
- [ ] [이월] 태그 UI 표시
- [ ] 이월 원본 추적 (carryOverFrom/To)

### Phase 4: @멘션 코멘트
- [ ] worklog_comments 테이블 생성 + RLS
- [ ] 코멘트 입력 UI (섹션별, todo별)
- [ ] @ 타이핑 시 멤버 드롭다운
- [ ] 코멘트 목록 표시 + 해결됨 토글
- [ ] 캘린더 뷰에 코멘트 배지

### Phase 5: 캘린더 뷰 강화
- [ ] 날짜 셀에 완료율/코멘트 수 표시
- [ ] 월간 요약 통계

---

## 9. 현재 데이터 마이그레이션

기존 일반 페이지 업무일지(14건)를 daily 페이지로 이관하는 것은 **선택사항**.
- 기존 데이터는 일반 페이지에 그대로 유지 (참조용)
- 새 업무일지는 캘린더 시스템에서 작성
- 향후 필요시 마이그레이션 스크립트 제공

---

## 10. 관련 파일 (구현 시 참고)

| 파일 | 역할 |
|---|---|
| `src/components/CalendarView/CalendarView.jsx` | 캘린더 뷰 메인 |
| `src/components/TipTapEditor/TipTapTestPage.jsx` | 페이지 에디터 (daily 페이지 렌더링) |
| `src/components/TipTapEditor/extensions/ToggleExtension.js` | 토글 블록 (todo 포함) |
| `src/hooks/usePages.js` | 페이지 CRUD + daily 페이지 생성 |
| `alter-pages-add-calendar.sql` | calendar/daily page_type 스키마 |
| `docs/TOGGLE-BLOCK-SPEC.md` | 토글 블록 명세 (todo 속성 포함) |

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
