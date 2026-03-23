# 기획서: 쪽 나눠보기 상호작용 개선

## 현재 상태

### 구현 완료
- 표 레벨 "쪽 나눠보기" / "쪽 없이 보기" 토글 (fold bar 내)
- A4 세로(210mm x 297mm) 페이지 프레임으로 표 분할 표시
- 숨긴 열 반영, 헤더 행 반복, 쪽 번호 표시
- 엑셀 스타일 열 문자(A,B,C) + 행 번호(1,2,3) 표시
- 열 문자 클릭 시 컨텍스트 메뉴 (열 추가/삭제/숨기기)
- 숨긴 열 사이 구분선 표시
- 쪽 나눠보기가 기본 보기로 설정됨

### 문제점
현재 쪽 나눠보기는 **클론 방식**으로 구현됨:
1. 원본 테이블을 `display: none`으로 숨김
2. 테이블 HTML을 클론하여 A4 프레임에 삽입
3. 클론은 ProseMirror가 관리하지 않으므로 **모든 상호작용 불가**:
   - 셀 편집 불가
   - 칸 크기(열 너비) 조절 불가
   - 셀 드래그 선택 불가
   - 열 문자 클릭 메뉴의 액션이 실제 테이블에 반영 안 됨

## 개선 방향: 오버레이 방식으로 전환

### 핵심 아이디어
클론을 제거하고, **원본 테이블을 그대로 유지**하면서 페이지 경계를 오버레이로 표시.

### 구현 방법

#### 1. 원본 테이블 유지
- `this.tableArea.style.display = 'none'` 제거
- 원본 ProseMirror 테이블이 항상 DOM에 존재하며 편집 가능

#### 2. 페이지 경계 오버레이
- A4 인쇄 가능 높이(267mm) 기준으로 행 단위 쪽 나누기 계산 (기존 로직 재사용)
- 각 쪽 경계 위치에 **절대 위치 오버레이 밴드** 삽입:
  - 밴드 높이: 약 30~40px (상단 페이지 하단 여백 + 하단 페이지 상단 여백 시뮬레이션)
  - 배경: 회색(#525659) — 페이지 사이 간격 표현
  - 밴드 내 쪽 번호 표시: `N쪽 | N+1쪽`
- 밴드는 `pointer-events: none`으로 편집 방해 없음

#### 3. 스타일 적용 (기존 유지)
- `table-print-preview` 클래스:
  - 배경 회색, 테이블 흰 배경
  - 테두리 색상 인쇄용(#bbb)
  - 텍스트 색상 검정
  - 추가 핸들/리사이즈 핸들 숨김 → **숨김 해제 필요** (편집 가능하므로)

#### 4. 테이블 래퍼 스타일
- 쪽 나눠보기 시 tableWrapper에 A4 너비(210mm) 적용
- 상하 여백 표현: 테이블 상단/하단에 padding 추가
- 마지막 페이지 이후 빈 공간은 별도 처리 불필요 (오버레이 방식이므로)

### 삭제할 코드
- `renderPageBreaks()` 내 클론 관련 로직 (`cloneVisibleTable`, `_pageContainer`, `table-pages-container`)
- `clearPageBreaks()` 내 `tableArea.style.display` 토글
- CSS: `.table-pages-container`, `.table-page-frame`, `.table-page-table`, `.table-page-area`, `.table-page-col-letters`, `.table-page-row-numbers`, `.page-col-letter`, `.page-row-number`

### 새로 작성할 코드
- `renderPageBreaks()`: 오버레이 밴드 생성/배치
- `clearPageBreaks()`: 오버레이 밴드 제거
- CSS: `.table-page-break-overlay` 스타일

### 보존할 상호작용
- 셀 편집 (ProseMirror 네이티브)
- 열 너비 리사이즈 (columnResizing 플러그인)
- 셀 드래그 선택 + TableToolbar
- 열 문자(A,B,C) 클릭 메뉴
- 열 숨기기/보이기 on/off 버튼
- 행 번호 표시
- 테이블 오른쪽/아래 + 핸들

### 트레이드오프
- 각 쪽이 별도 종이처럼 물리적으로 분리되는 느낌은 약해짐
- 대신 구분 밴드로 쪽 경계를 명확히 표시하여 인쇄 시 어디서 잘리는지 파악 가능
- 편집/리사이즈/선택 등 **모든 상호작용 완전 유지**

## 관련 파일
- `src/components/TipTapEditor/extensions/FoldableTable.js` — FoldableTableView 클래스
- `src/components/TipTapEditor/TipTapEditor.css` — 테이블 관련 CSS
- `src/components/TipTapEditor/components/TableToolbar.jsx` — 셀 선택 시 툴바
