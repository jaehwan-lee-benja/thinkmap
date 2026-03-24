# 기획서: 쪽 나눠보기 — 구글 문서 스타일 종이 경계

## 목표
구글 문서처럼 표가 쪽 경계를 넘을 때 **실제 종이 여백과 쪽 사이 갭**이 보이면서, 편집은 항상 가능한 상태.

## 구현 방식

### 1. 용지 스타일 (CSS)
- `.table-print-preview .table-area`에 A4 용지 스타일 적용
- 흰색 배경, `max-width: 210mm`, 상하 38px / 좌우 45px 패딩 (실제 여백)
- 그림자 없음 — 그래픽 부담 최소화

### 2. 종이 경계 (JS + CSS)
쪽 경계에서 **실제 공간**을 만들어 종이 분리를 표현:

```
│ 마지막 행 (현재 쪽)          │
├──────────────────────────────┤ ← #bbb 경계선 (1px)
│       하단 여백 (38px 흰색)   │
│       ─── 1 / 3 ───         │ ← 쪽 사이 갭 (16px 회색 #525659)
│       상단 여백 (38px 흰색)   │
├──────────────────────────────┤ ← #bbb 경계선 (1px)
│ 첫 행 (다음 쪽)              │
```

- **공간 생성**: 경계 행의 `<td>/<th>`에 `padding-top` 추가 (92px)
- **시각 표현**: 절대 위치 오버레이에 `linear-gradient`로 여백+갭+경계선 표현
- 오버레이는 `pointer-events: none` → 편집 방해 없음

### 3. 편집 기능 완전 유지
원본 ProseMirror 테이블이 항상 DOM에 존재:
- 셀 편집, 열 리사이즈, 드래그 선택, 열 문자 메뉴
- 열 숨기기/보이기, 행 번호, +핸들 모두 동작

## 핵심 치수 (A4 기준)
| 항목 | 값 |
|------|-----|
| A4 크기 | 210mm × 297mm |
| 상하 여백 | 10mm (38px) |
| 좌우 여백 | 12mm (45px) |
| 인쇄 가능 높이 | 277mm (~1047px) |
| 쪽 사이 갭 | 16px |
| 경계선 | 1px #bbb |
| 총 경계 높이 | 38 + 16 + 38 = 92px |

## 관련 파일
- `src/components/TipTapEditor/extensions/FoldableTable.js` — renderPageBreaks(), clearPageBreaks()
- `src/components/TipTapEditor/TipTapEditor.css` — .table-print-preview, .table-page-break-band
