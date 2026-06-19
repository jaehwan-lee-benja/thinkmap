# PLAN — 멀티셀렉트 → 컨테이너 드래그 통합 (진행 중, inside 드롭 미해결)

> 브랜치: `feat/unified-multiselect-drag` (base `main` = f8f4924)
> 상태: **Phase 1 부분 완료 + 1건 미해결로 세션 중단** (2026-06-19)
> 진입 문서. 다음 세션은 이 문서부터 읽고 이어간다.

## 0. 목표 (사용자 기획)

"바탕화면 아이콘 선택하듯" 여러 블록을 마키(영역 드래그)로 선택한 뒤, 그 묶음을
다른 토글(컨테이너) **안으로** 끌어다 넣는 경험을 **전 뷰 공통**으로 제공한다.

적용 범위(우선순위):
- **TipTap 토글 에디터** (일반 페이지 + 데일리 + 데일리 2단) — 같은 `ToggleExtension` 한 곳
- **ColumnView(칼럼뷰)** — dnd-kit 기반, 현재 단일선택만
- **CardView(Canvas 카드뷰)** — SVG `<g>`, 현재 onClick만 (가장 큰 작업)

## 1. 현재 동작 메커니즘 (조사 결과)

세 가지가 **독립적으로** 설계돼 있다 (`src/components/TipTapEditor/`):

| 동작 | 트리거 | 위치 |
|---|---|---|
| 편집모드 | 더블클릭 (`editable:false`→`true`) | `TipTapEditor.jsx:138,653` |
| 마키 다중선택 | **여백에서** 드래그 / Cmd·Ctrl+클릭 / Shift+클릭 | `TipTapTestPage.jsx:955~` (pageRef capture mousedown) |
| 토글 안으로 이동 | 드래그 핸들(⠿) 또는(이번 작업) 선택 블록 본문 | `ToggleExtension.js` dragstart + blockDropIndicator plugin |

- 마키 선택은 `.toggle-block`만 수집(`collectMarqueeHits`, TipTapTestPage). 일반 비-toggle 블록은 안 잡힘.
- 다중선택 상태 = `multiSelectPluginKey` (selectedPositions[]), 전부 toggle 전제.
- 드롭 처리 = `blockDropIndicator` plugin의 dragover(인디케이터) + 별도 plugin의 `handleDrop`.
- 실제 운영 페이지는 **TipTapTestPage**(이름만 Test). 데일리=DailyPageV2→DailyColumnPane→TipTapEditor.

## 2. 이번 세션에서 한 작업 (feat 브랜치, 미커밋)

변경 파일 2개 (`git diff --stat`: +93/-9):
- `src/components/TipTapEditor/extensions/ToggleExtension.js`
- `src/components/TipTapEditor/TipTapEditor.css`

### (A) 선택 블록 본문 드래그 — **됨**
- dragstart 로직을 `startBlockDrag(e, fromHandle)` 공용 함수로 추출 (핸들/본문 공유).
- 선택(멀티셀렉트)된 블록의 root `dom.draggable = true` 로 설정
  - 초기 렌더(`hasMultiSelectClass(decorations)`) + `update()` 에서 동기화.
- `dom` 에 dragstart/dragend 리스너 추가 → 선택 블록은 본문 어디를 잡아도 묶음 드래그.
- CSS `.toggle-block-multiselected { user-select:none; cursor:grab }` 추가
  - **원인**: user-select 켜져 있으면 본문 잡을 때 "텍스트 선택 드래그"가 우선해 요소 드래그가 안 됨.
  - 이걸로 본문 드래그가 시작되는 것은 **확인됨**.

### (B) 마키가 일반 블록도 선택 — **보류**
- 에디터가 사실상 전부 toggle 기반이라 리스크 대비 실효성 낮다고 판단, 손대지 않음.

### (C) 마키 시작 조건 완화 — **미착수**

### inside 드롭 경합 수정 시도 — **여전히 안 됨 (핵심 미해결)**
- 가설: 드롭 순간 `handleDrop`이 캐시된 `_dropState.target`을 읽는데, 별도 `drop`/디바운스
  리스너가 먼저 `null`로 비워 fallback(형제 삽입)으로 샌다.
- 조치: `computeDropTarget(view, clientX, clientY)` 헬퍼 추가(dragover와 동일 로직),
  `handleDrop`에서 **드롭 좌표로 타겟 재계산** → `const target = computeDropTarget(...) || _dropState.target`.
- 결과: **여전히 토글 안으로 안 들어가고 형제로 떨어짐.** → 경합이 원인이 아니거나, 다른 원인.

## 3. 사용자 검증으로 좁혀진 사실 (중요)

- 가운데 호버 시 **inside 인디케이터(박스)는 뜬다** → dragover의 inside **감지·표시는 정상**.
- **핸들(⠿)로도** 안 들어간다 → **본문 드래그 문제가 아님.** "여러 블록 묶음을 inside로 드롭"
  경로 자체의 문제. (단일 블록 inside 드롭은 SPEC상 동작한다고 되어 있음 — 미재확인.)

## 4. 다음 세션 디버깅 출발점 (가설 우선순위)

1. **단일 블록 inside 드롭이 실제로 되는지 먼저 확인.** 되면 = 다중(bundle) 경로만의 버그로 확정.
2. `handleDrop` (`ToggleExtension.js` ~2018~) 에 임시 console.log 박아 브라우저에서 관찰:
   - `isBlockDrag`, `target`(mode/togglePos), `contentToInsert.childCount`, insert 직전 `mappedPos`,
     dispatch 후 에러 여부.
3. 의심 지점:
   - 다중 노드 JSON payload 복원: `event.dataTransfer.getData('application/x-thinkmap-block')`이
     배열(`isMulti`)일 때 `restored`/`Fragment.fromArray` 가 schema fitting에 걸려 insert 실패?
   - PM이 multi-node 드롭을 자체 처리(view.dragging.slice 기반)하여 handleDrop보다 먼저 형제 삽입?
     → handleDrop이 true 반환 전에 throw 하면 PM 기본 동작으로 넘어갈 수 있음. try/catch(2092) 로그 확인.
   - 드롭 성공 후 onUpdate→setContent 정규화(`normalizeToggleStates`/이월 정규화)가 되돌리는지.
4. 두 개의 `drop` 리스너 순서(plugin `editorView.dom` drop=clearIndicator vs PM handleDrop) 실측.

## 5. 통합/배포 상태 (carryover 세션 인계)

- **carryover 세션 완료**: `fix/daily-carryover` @ `4b3375b`
  - "데일리 생성 시 빈 카드 — eager 이월 재조회 race 제거"
  - 변경: `src/utils/carryOverPipelineV2.js`, `src/utils/createDailyPageV2.js` (이 세션과 다른 영역, 충돌 거의 없음)
  - 로컬(Edge OFF) 검증 완료.
- ⚠️ **이 멀티셀렉트(feat) 작업은 inside 드롭 미해결이라 main 통합 금지.** carryover만 별도 처리 권장.
- carryover 배포 시 필수(메모리 [[reference_edge_function_deploy]] / [[project_daily_master_visibility_rls]]):
  - `npx supabase functions deploy ensure-daily-page --project-ref sqisntxippjzcekyhqyo` (1회용 PAT, 쓰고 revoke)
  - 순서: **Edge 먼저 → 프론트 push**. push 시 Actions가 gh-pages 자동 배포.
  - `.env`의 `VITE_USE_EDGE_DAILY=false`는 로컬 검증용/gitignore라 프로덕션 무관(CI가 =true 주입).
