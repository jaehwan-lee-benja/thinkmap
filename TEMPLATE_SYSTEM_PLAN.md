# 양식(템플릿) 시스템 기획서

> 작성일: 2026-03-20
> 상태: 기획 완료, 구현 대기

---

## 1. 개요

### 목적
페이지를 **여러 섹션으로 구분된 양식**으로 사용할 수 있게 한다.
Google Forms처럼 섹션을 추가/편집할 수 있고, 양식을 재사용할 수 있다.

### 핵심 가치
- **관리자**: 프로젝트 전체 실루엣을 한눈에 파악, 업무 구조 설계
- **실무자**: 정해진 양식에 맞춰 빠르게 내용 작성, 무엇을 채워야 하는지 직관적

### 사용 예시
- 업무일지: `오늘 할 일` → `진행 상황` → `블로커` → `메모`
- 회의록: `참석자` → `안건` → `결정 사항` → `액션 아이템`
- 프로젝트 현황: `전체 진행률` → `단계별 상세` → `리스크` → `다음 마일스톤`

---

## 2. 사용자 경험 (UX)

### 2-1. 양식 없는 페이지 (기존 방식)

현재와 동일. 단일 에디터 영역에서 자유롭게 작성.

```
┌─ 페이지 헤더 ──────────────────────┐
│  ◁ ▷  페이지 제목  ▾ ☆ [저장] ... │
├────────────────────────────────────┤
│                                    │
│  ┌─ 에디터 (content_tiptap) ────┐  │
│  │  자유 편집 영역               │  │
│  └──────────────────────────────┘  │
│                                    │
└────────────────────────────────────┘
```

### 2-2. 양식이 적용된 페이지

섹션별로 나뉜 에디터 영역. 각 섹션에 제목이 표시된다.

```
┌─ 페이지 헤더 ──────────────────────┐
│  ◁ ▷  페이지 제목  ▾ ☆ [저장] ... │
│                         [양식 편집] │
├────────────────────────────────────┤
│                                    │
│  ┌─ 섹션: "오늘 할 일" ─────────┐  │
│  │  (TipTap 에디터)              │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌─ 섹션: "진행 상황" ─────────┐  │
│  │  (TipTap 에디터)              │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌─ 섹션: "메모" ──────────────┐  │
│  │  (TipTap 에디터)              │  │
│  └──────────────────────────────┘  │
│                                    │
│           [ + 섹션 추가 ]          │
│                                    │
└────────────────────────────────────┘
```

### 2-3. 양식 편집 모드

`[양식 편집]` 버튼 클릭 시 진입. 섹션 구조를 수정할 수 있다.

```
┌─ 양식 편집 모드 ───────────────────┐
│                                    │
│  양식 이름: [업무일지        ]      │
│                                    │
│  ┌─ 섹션 1 ────────────────────┐  │
│  │  ≡ [오늘 할 일        ] [✕] │  │
│  └─────────────────────────────┘  │
│  ┌─ 섹션 2 ────────────────────┐  │
│  │  ≡ [진행 상황          ] [✕] │  │
│  └─────────────────────────────┘  │
│  ┌─ 섹션 3 ────────────────────┐  │
│  │  ≡ [메모              ] [✕] │  │
│  └─────────────────────────────┘  │
│                                    │
│          [ + 섹션 추가 ]           │
│                                    │
│  ┌─ 저장 옵션 ─────────────────┐  │
│  │ [전체 적용] [이 페이지만]    │  │
│  │ [이후부터 계속 적용]         │  │
│  └─────────────────────────────┘  │
│                                    │
│          [취소]  [저장]            │
└────────────────────────────────────┘
```

**편집 가능한 것들:**
- 섹션 제목 수정 (인라인 편집)
- 섹션 순서 변경 (≡ 핸들 드래그)
- 섹션 삭제 (✕ 버튼, 확인 필요)
- 섹션 추가 (+ 버튼)
- 양식 이름 수정

### 2-4. 양식 저장 옵션 상세

| 옵션 | 설명 | 동작 |
|---|---|---|
| **전체 적용하기** | 이 양식을 사용하는 모든 페이지에 반영 | 템플릿 원본 수정. 기존 페이지들의 섹션 구조가 업데이트됨 (내용은 유지) |
| **이 페이지에만 적용** | 이 페이지만 양식 구조 변경 | 페이지가 템플릿에서 분리(fork). 독립적인 섹션 구조를 가짐 |
| **이후부터 계속 적용** | 이 페이지 + 앞으로 이 양식으로 만드는 페이지에 반영 | 템플릿 버전 증가. 기존 페이지는 이전 버전 유지, 새 페이지는 새 버전 사용 |

### 2-5. 양식 적용 방법

페이지에 양식을 처음 적용하는 진입점:

1. **페이지 생성 시**: 양식 선택 다이얼로그에서 선택
2. **기존 페이지에서**: 설정(⚙️) 메뉴 → "양식 적용" → 양식 목록에서 선택
3. **양식 해제**: 설정 메뉴 → "양식 해제" → 섹션 내용을 단일 에디터로 합칠지 확인

---

## 3. 데이터 모델

### 3-1. 새 테이블: `page_templates`

```sql
CREATE TABLE page_templates (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,               -- 양식 이름
  sections        JSONB NOT NULL DEFAULT '[]', -- 섹션 정의 배열
  version         INT NOT NULL DEFAULT 1,      -- 템플릿 버전
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**`sections` JSONB 구조:**
```json
[
  { "id": "uuid-1", "title": "오늘 할 일", "order": 0 },
  { "id": "uuid-2", "title": "진행 상황", "order": 1 },
  { "id": "uuid-3", "title": "메모", "order": 2 }
]
```

### 3-2. 새 테이블: `page_template_versions`

"이후부터 계속 적용" 옵션을 위한 버전 이력 테이블.

```sql
CREATE TABLE page_template_versions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id     UUID NOT NULL REFERENCES page_templates(id) ON DELETE CASCADE,
  version         INT NOT NULL,
  sections        JSONB NOT NULL,              -- 해당 버전의 섹션 구조
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 3-3. `pages` 테이블 컬럼 추가

```sql
ALTER TABLE pages ADD COLUMN template_id UUID REFERENCES page_templates(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN template_version INT;
ALTER TABLE pages ADD COLUMN sections_content JSONB;
ALTER TABLE pages ADD COLUMN template_forked BOOLEAN DEFAULT FALSE;
```

| 컬럼 | 설명 |
|---|---|
| `template_id` | 연결된 양식. NULL이면 기존 단일 에디터 |
| `template_version` | 참조하는 템플릿 버전 번호 |
| `sections_content` | 섹션별 내용 `{"섹션id": {tiptap JSON}, ...}` |
| `template_forked` | "이 페이지에만 적용"으로 분리된 페이지인지 |

### 3-4. 페이지 렌더링 로직

```
페이지 로드 시:
  template_id가 NULL → 기존 방식 (content_tiptap)
  template_id가 있음 →
    template_forked == true → pages.sections_content의 구조 사용 (독립)
    template_forked == false →
      page_template_versions에서 해당 version의 sections 가져옴
      sections_content에서 각 섹션의 내용 매칭
```

### 3-5. 양식 편집 저장 로직

```
"전체 적용하기":
  1. page_templates.sections 업데이트
  2. page_templates.version 증가
  3. page_template_versions에 새 버전 기록
  4. 이 템플릿을 쓰는 모든 페이지의 template_version을 새 버전으로 업데이트
  5. 새로 추가된 섹션 → sections_content에 빈 값 추가
  6. 삭제된 섹션 → sections_content에서 제거 (확인 필요)

"이 페이지에만 적용":
  1. pages.template_forked = true
  2. pages.sections_content에 현재 섹션 구조 + 내용 저장
     (sections_content에 구조 정보도 포함: {"_sections": [...], "섹션id": {...}})
  3. 템플릿 원본은 변경하지 않음

"이후부터 계속 적용":
  1. page_templates.sections 업데이트
  2. page_templates.version 증가
  3. page_template_versions에 새 버전 기록
  4. 현재 페이지의 template_version만 새 버전으로 업데이트
  5. 기존 다른 페이지는 이전 template_version 유지
```

---

## 4. 구현 계획

### Phase 1: 기반 구조 (DB + 기본 CRUD)

- [ ] `page_templates` 테이블 생성 (SQL + RLS)
- [ ] `page_template_versions` 테이블 생성 (SQL + RLS)
- [ ] `pages` 테이블 컬럼 추가 (SQL)
- [ ] `useTemplates` 훅 생성 — 템플릿 CRUD
- [ ] 템플릿 목록/선택 UI 컴포넌트

### Phase 2: 양식 편집 모드

- [ ] `TemplateEditor` 컴포넌트 — 양식 편집 UI
  - [ ] 섹션 추가/삭제/순서변경/이름변경
  - [ ] 양식 이름 편집
  - [ ] 저장 옵션 3가지 UI + 로직
- [ ] `[양식 편집]` 버튼 → 페이지 헤더 또는 설정 메뉴에 배치

### Phase 3: 양식 모드 렌더링

- [ ] `TipTapTestPage` 수정 — template_id 유무에 따라 분기
  - [ ] 양식 모드: 섹션별 TipTap 에디터 렌더링
  - [ ] 섹션 제목 표시
  - [ ] 섹션별 독립 자동저장
- [ ] `[ + 섹션 추가 ]` 버튼 (양식 편집 모드 진입)
- [ ] 기존 단일 에디터 모드와 호환 유지

### Phase 4: 양식 적용/해제

- [ ] 페이지 생성 시 양식 선택 다이얼로그
- [ ] 기존 페이지에 양식 적용 (설정 메뉴)
- [ ] 양식 해제 — 섹션 내용을 단일 에디터로 병합

### Phase 5: 버전 관리 + 전파

- [ ] "전체 적용하기" 로직 — 모든 연결 페이지 업데이트
- [ ] "이 페이지에만 적용" 로직 — fork 처리
- [ ] "이후부터 계속 적용" 로직 — 버전 분기
- [ ] 섹션 추가/삭제 시 기존 내용 보존 처리

---

## 5. 고려사항

### 하위 호환성
- `template_id`가 NULL인 기존 페이지는 변경 없이 그대로 동작
- 양식 적용/해제가 자유로워야 함 (비가역적 변경 없음)

### 섹션 삭제 시 데이터 처리
- "전체 적용"으로 섹션 삭제 시, 해당 섹션에 이미 내용이 있는 페이지들이 있을 수 있음
- 옵션: 삭제 확인 다이얼로그에서 경고 + `sections_content`에 orphan으로 보존

### 자동 저장
- 섹션별로 독립적으로 debounce 저장 (현재 500ms 패턴 유지)
- 한 섹션 편집 중 다른 섹션은 영향 없음

### 공유 페이지
- 공유된 페이지의 양식 구조는 소유자만 편집 가능
- 편집 권한이 있는 공유 사용자는 섹션 내용만 편집 가능

### 뷰어 모드
- 양식 모드에서도 뷰어 모드(읽기 전용) 동작 유지
- 양식 편집 버튼은 뷰어 모드에서 숨김

---

## 6. 파일 변경 예상

| 파일 | 변경 내용 |
|---|---|
| `create-page-templates-table.sql` | 새 파일 — 테이블 생성 |
| `alter-pages-add-template.sql` | 새 파일 — pages 컬럼 추가 |
| `src/hooks/useTemplates.js` | 새 파일 — 템플릿 CRUD 훅 |
| `src/components/TemplateEditor/` | 새 폴더 — 양식 편집 UI |
| `src/components/TipTapEditor/TipTapTestPage.jsx` | 수정 — 양식 모드 분기 렌더링 |
| `src/components/TipTapEditor/TipTapPage.css` | 수정 — 섹션 스타일 |
| `src/components/PaneProvider.jsx` | 수정 — 템플릿 데이터 제공 |
| `src/contexts/TemplateContext.jsx` | 새 파일 — 템플릿 컨텍스트 |
