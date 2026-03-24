# 표 리팩토링 기획서: "쪽 나눠보기" 단일 모드 전환

## 1. 현황 분석

### 현재 구조: 이중 모드(dual-mode) 시스템

표(`FoldableTableView`)는 두 가지 렌더링 모드를 동시에 지원한다.

| | 쪽 나눠보기 (`_printPreview = true`) | 쪽 없이 보기 (`_printPreview = false`) |
|---|---|---|
| 배경 | 회색(`#525659`) + 흰 용지 | 에디터 기본 (다크 테마) |
| 표 너비 | A4 고정 (210mm) | 콘텐츠 너비 자동 |
| 셀 색상 | 흰 배경 + 검정 텍스트 | 다크 테마 그대로 |
| 쪽 경계선 | `renderPageBreaks()` 표시 | 없음 |
| 확대/축소 | 맞춤/+/- 표시 | 숨김 |
| CSS 클래스 | `.table-print-preview` 붙음 | 없음 |

### "미러링"이란?

현재 코드에서 **하나의 표가 두 가지 외형을 모두 지원**하기 위해 발생하는 이중 관리 구조를 의미한다.

```
[JS 미러링]
- _printPreview 플래그로 모든 분기 처리
- togglePrintPreview()에서 모드 전환 시 상태 정리/재설정
- updateFoldBar()에서 모드별 조건부 UI 렌더링 (확대/축소 표시 여부)
- applyFold()에서 조건부 쪽 나눠보기 렌더링

[CSS 미러링]
- .table-print-preview 접두 스타일 ~15개 규칙
- .table-print-preview 없는 기본 스타일 (사실상 사용하지 않는 폴백)
```

---

## 2. 진단: 미러링 제거 가능한가?

**결론: 가능하다. 완전히 제거할 수 있다.**

"쪽 없이 보기"를 제거하면, `_printPreview`는 항상 `true`이므로 모든 조건 분기가 불필요해진다.

### 제거 가능한 항목

#### JS (`FoldableTable.js`)

| 항목 | 줄 | 설명 |
|---|---|---|
| `this._printPreview` 프로퍼티 | 70 | 항상 true → 제거 |
| `this._settingsOpen` 프로퍼티 | 72 | 설정 드롭다운용 → 제거 |
| `togglePrintPreview()` 메서드 | 808-830 | 모드 전환 로직 전체 → 제거 |
| `clearPageBreaks()` 메서드 | 932-935 | 모드 전환 시에만 호출 → 제거 |
| `if (this._printPreview)` 분기 3곳 | 251, 365, 823 | 항상 true → 무조건 실행으로 단순화 |
| 설정 드롭다운 전체 | 415-451 | 유일한 메뉴 항목이 "쪽 없이 보기" → 제거 |
| `_onDocClick` 리스너 | 134-143 | 설정 드롭다운용 → 제거 |
| `destroy()`의 `_onDocClick` 정리 | 937-941 | 위와 함께 제거 |

#### CSS (`TipTapEditor.css`)

| 항목 | 줄 | 설명 |
|---|---|---|
| `.fold-bar-settings-*` 규칙 5개 | 601-644 | 설정 드롭다운 스타일 → 제거 |
| `.table-print-preview` 접두사 | 723-818 | 접두사 제거, 기본 스타일로 승격 |

---

## 3. 리팩토링 계획

### Phase 1: 설정 드롭다운 제거
- `updateFoldBar()`에서 설정 버튼/드롭다운 코드 삭제
- `_settingsOpen`, `_onDocClick` 관련 코드 삭제
- CSS `.fold-bar-settings-*` 규칙 삭제

### Phase 2: `_printPreview` 플래그 제거
- `_printPreview = true` 초기화 삭제
- `togglePrintPreview()` 메서드 삭제
- `clearPageBreaks()` 메서드 삭제 (`_clearBreakElements`는 내부적으로 여전히 사용하므로 유지)
- 모든 `if (this._printPreview)` 조건문 → 무조건 실행으로 변경
- constructor에서 `table-print-preview` 클래스를 항상 붙이도록 (이미 그러함)

### Phase 3: input 리스너 정리
- 현재: `togglePrintPreview()`에서 ON 전환 시 `input` 리스너 등록
- 변경: constructor에서 바로 등록 (항상 쪽 나눠보기이므로)
- `destroy()`에서 해당 리스너 정리 추가

### Phase 4: CSS 정리
- `.table-print-preview` 접두 규칙들 → `.tableWrapper` 또는 직접 선택자로 변경
- 비-preview 모드 전용 폴백 스타일 존재 시 제거

---

## 4. 영향도

| 영역 | 영향 |
|---|---|
| 기존 저장된 표 | 영향 없음. DB에 `_printPreview` 상태는 저장되지 않음 (뷰 상태일 뿐) |
| 인쇄 기능 | 영향 없음. `printTable()`은 모드와 무관하게 동작 |
| 확대/축소 | 항상 표시됨 (현재는 쪽 나눠보기일 때만 표시) |
| 열 접기/펼치기 | 영향 없음 |
| 뷰어 모드 | 영향 없음 (뷰어에서도 동일하게 쪽 나눠보기로 표시) |

## 5. 삭제 코드량 추정

- JS: ~60줄 삭제, ~5줄 단순화
- CSS: ~45줄 삭제, ~15줄 접두사 제거
- 총: 약 120줄 감소, 조건 분기 3개 제거
