# 기획서: 하위 페이지(Sub-page) 기능

## 1. 개요

### 1.1 배경
현재 thinkmap의 페이지 구조는 프로젝트 내에서 **1단계 플랫 리스트**로만 존재합니다.
사용자가 정보를 계층적으로 정리할 수 없어 페이지가 많아질수록 관리가 어려워집니다.

### 1.2 목표
Notion과 유사하게 **페이지 안에 하위 페이지**를 생성할 수 있는 트리 구조를 구현합니다.

### 1.3 기대 효과
- 정보의 계층적 구조화 (예: "프로젝트 기획" > "UI 설계" > "컴포넌트 목록")
- 사이드바에서 접기/펼치기로 깔끔한 페이지 관리
- 기존 기능(편집, 공유, 백업)과 완벽 호환

---

## 2. 기능 상세

### 2.1 하위 페이지 생성
- 사이드바에서 페이지에 마우스를 올리면 **`+` 버튼** 표시
- 클릭 시 하위 페이지 이름 입력 -> 해당 페이지 아래에 하위 페이지 생성
- 하위 페이지는 독립적인 페이지 (자체 콘텐츠 편집 가능)
- 중첩 깊이 제한 없음 (UI상 들여쓰기로 깊이 표현)

### 2.2 트리 형태 사이드바 표시
- 하위 페이지가 있는 페이지에 토글 화살표 표시
- 클릭 시 접기/펼치기 (회전 애니메이션)
- 하위 페이지는 20px씩 들여쓰기로 계층 표현
- 하위 페이지가 없는 페이지는 기존과 동일한 모습

### 2.3 삭제 동작
- **부모 페이지 삭제 시 하위 페이지도 함께 삭제** (CASCADE)
- 삭제 전 경고 메시지로 하위 페이지 존재 여부 안내
- 마지막 최상위 페이지는 삭제 불가 (기존 동작 유지)

### 2.4 기존 기능 호환
- 새 페이지 추가 (하단 `+ 새 페이지` 버튼): 최상위 페이지로 생성
- 페이지 더블클릭 이름 수정: 기존과 동일
- 페이지 공유: 기존과 동일 (개별 페이지 단위)
- 백업/복원: 계층 구조 포함하여 백업 및 복원

---

## 3. 기술 설계

### 3.1 데이터베이스 변경

**파일:** `add-parent-id-to-pages.sql` (신규 생성)

`pages` 테이블에 `parent_id` 컬럼 추가:
```sql
ALTER TABLE pages ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES pages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id);
```

- `parent_id = NULL` -> 최상위 페이지 (기존 페이지는 모두 자동으로 최상위)
- `ON DELETE CASCADE` -> DB 레벨에서 부모 삭제 시 자식 자동 삭제
- 기존 데이터 마이그레이션 불필요 (NULL이 기본값)

### 3.2 수정 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `add-parent-id-to-pages.sql` | 신규 - parent_id 컬럼 추가 SQL |
| `src/hooks/usePages.js` | 트리 빌더 함수, createPage 시그니처 변경, deletePage 자손 처리 |
| `src/components/Sidebar/Sidebar.jsx` | 재귀 트리 렌더링, 접기/펼치기 토글, 하위 페이지 추가 버튼 |
| `src/components/Sidebar/Sidebar.css` | 토글 버튼, 들여쓰기, 하위 페이지 버튼 스타일 (다크모드) |
| `src/App.jsx` | pageTree prop 전달 추가 |
| `src/hooks/useBackup.js` | 복원 시 parent_id ID 매핑 처리 |

### 3.3 핵심 로직

#### usePages.js - 트리 빌드
```
플랫 배열 [A, B, C(parent=A), D(parent=A)]
     ↓ buildPageTree()
트리 [{A, children: [C, D]}, {B, children: []}]
```

#### usePages.js - createPage 변경
```
기존: createPage(name)
변경: createPage(name, parentId = null)
```
- parentId가 있으면 해당 페이지의 자식으로 생성
- position은 같은 parent를 가진 형제 페이지 수 기반

#### Sidebar.jsx - 재귀 렌더링
```
renderPageItem(page, depth=0)
  |- 토글 화살표 (자식 있을 때)
  |- 아이콘 + 페이지명
  |- [+] 하위페이지 / 공유 / 삭제 버튼
  └- 자식 페이지들 -> renderPageItem(child, depth+1)
```

#### useBackup.js - 복원 시 ID 매핑
```
1단계: old ID -> new ID 매핑 테이블 생성
2단계: 루트 페이지부터 insert (parent_id를 매핑된 new ID로 변환)
```

---

## 4. UI/UX 와이어프레임

```
사이드바
+----------------------------+
| 📁 My Project              |
+----------------------------+
| PAGES                      |
|                            |
| v 📄 프로젝트 기획    [+]  |  <- 자식 있음, 펼쳐진 상태
|    📄 UI 설계        [+]   |  <- depth 1 (들여쓰기)
|    📄 기능 정의      [+]   |  <- depth 1 (들여쓰기)
| > 📄 회의록          [+]   |  <- 자식 있음, 접힌 상태
|   📄 참고자료        [+]   |  <- 자식 없음 (토글 없음)
|                            |
| + 새 페이지                |
+----------------------------+
| 도구                       |
| 프로젝트 백업              |
+----------------------------+
```

- 호버 시 [+] 공유 삭제 버튼이 나타남 (기존 패턴과 동일)
- 토글 화살표 클릭 -> 자식 접기/펼치기
- [+] 클릭 -> 하위 페이지 이름 입력 프롬프트

---

## 5. 검증 시나리오

| # | 시나리오 | 기대 결과 |
|---|---------|-----------|
| 1 | 페이지에 hover -> + 클릭 -> 이름 입력 | 해당 페이지 아래에 하위 페이지 생성, 부모 자동 펼침 |
| 2 | 하위 페이지가 있는 페이지의 > 클릭 | 하위 페이지 접기/펼치기 토글 |
| 3 | 하위 페이지 선택 | 에디터에서 해당 페이지 콘텐츠 표시 및 편집 |
| 4 | 하위 페이지가 있는 부모 삭제 | 경고 메시지 표시 후 부모+자식 모두 삭제 |
| 5 | 하단 + 새 페이지 클릭 | 최상위 페이지로 생성 (기존과 동일) |
| 6 | 백업 생성 -> 복원 | 계층 구조가 유지된 상태로 복원 |
| 7 | 기존 프로젝트 (parent_id 없는 데이터) | 모든 페이지가 최상위로 표시 (하위 호환) |

---

## 6. 구현 상태

- [x] SQL 마이그레이션 작성 (`add-parent-id-to-pages.sql`)
- [x] Supabase에 마이그레이션 실행 완료 (`parent_id` 컬럼 추가, `app_users` 테이블 생성)
- [x] usePages.js 수정 — `buildPageTree`, `getDescendantIds`, `createPage(name, parentId)`, `getDescendantCount`
- [x] Sidebar.jsx 수정 — 재귀 `renderPageItem`, 토글 expand/collapse, `+` 하위 페이지 버튼
- [x] Sidebar.css 수정 — `.page-toggle-arrow`, `.page-toggle-spacer`, `.page-subpage-button`, `.page-tree-node`
- [x] App.jsx 수정 — `pageTree`, `getDescendantCount` prop 전달
- [x] useBackup.js 수정 — 복원 시 `parent_id` ID 매핑 (토폴로지 정렬)
- [x] 버그 수정: 페이지 전환 시 이전 콘텐츠가 새 페이지에 잘못 저장되는 문제 (TipTapTestPage.jsx)
- [x] 버그 수정: TipTap StarterKit Link 중복 경고 (TipTapEditor.jsx `link: false`)
- [ ] 사용자 테스트 진행 중

### 추가 수정 사항 (기획서 범위 외)

| 파일 | 변경 내용 |
|------|-----------|
| `src/components/TipTapEditor/TipTapTestPage.jsx` | 페이지 전환 시 콘텐츠 초기화 + `prevPageRef` 오염 방지 + cleanup 시점 수정 |
| `src/components/TipTapEditor/TipTapEditor.jsx` | StarterKit에서 Link 중복 제거 (`link: false`) |
| `create-app-users-table.sql` | Supabase에 실행 완료 (기존 미실행 마이그레이션) |
