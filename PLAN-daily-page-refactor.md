# 데일리 페이지 리팩토링 기획서

> 작성: 2026-05-25 · 상태: **점검 완료 / 실행 대기** (다음 작업 세션에서 이어서 진행)
> 범위: daily 페이지 서브시스템에 한정한 리팩토링 후보. 신규 기능·버그수정 아님.
> 관련 문서: [docs/TOGGLE-BLOCK-SPEC.md](docs/TOGGLE-BLOCK-SPEC.md), [docs/WORKLOG-SPEC.md](docs/WORKLOG-SPEC.md), [REFACTORING_PLAN.md](REFACTORING_PLAN.md)(앱 전반), [CRITICAL_LESSONS.md](CRITICAL_LESSONS.md)

---

## 0. 핵심 제약 (먼저 읽을 것)

- **자동 테스트 안전망 없음**: 현재 개발 환경이 **Node 19**라 `vitest`(rolldown)가 `node:util.styleText` 미존재로 실행 불가.
  `tests/transform/round-trip.spec.js` 등 라운드트립 검증을 돌릴 수 없다.
  → **데이터 파이프라인(`docToBlocks`/`blocksToDoc`/`dailyBlockMapper`) 리팩토링은 자동 검증 없이** 해야 하므로 위험이 한 단계 높다. 우선순위 뒤로.
  → Node 20.12+/22 로 올리거나 임시 standalone 노드 스크립트로 라운드트립 검증하는 우회책을 먼저 마련하면 파이프라인 리팩토링 안전성이 올라간다.
- **TOGGLE-BLOCK-SPEC §13/§15/§16/§17/§19 준수**: nodeView·레이아웃·삽입경로는 "절대 깨지면 안 되는" 영역. 수정 시 §16 체크리스트 수동 테스트 필수.
- 커밋/푸시는 사용자 명시 요청 시에만 (CLAUDE.md).

---

## 1. 규모 (2026-05-25 실측)

| 파일 | 줄 수 | 메모 |
|------|------|------|
| `src/components/TipTapEditor/extensions/ToggleExtension.js` | ~3,250 | 단일 `nodeView()`가 ~900줄 |
| `src/components/TipTapEditor/DailyPageV2.jsx` | ~955 | `handleUpdate()` L184–275 |
| `src/components/TipTapEditor/TipTapEditor.css` | ~2,630 | toggle 기본 + 일부 daily |
| `src/components/TipTapEditor/TipTapPage.css` | ~1,918 | daily 전용 룰 ~700줄 산재 |
| `src/utils/carryOverPipelineV2.js` | ~333 | |
| `src/utils/createDailyPageV2.js` | ~200 | |
| `src/utils/docToBlocks.js` / `blocksToDoc.js` / `dailyBlockMapper.js` | 194 / 144 / 93 | 데이터 파이프라인 (테스트 안전망 필요) |
| `src/utils/dailyBlockOps.js` / `dailyBlockMerge.js` | 151 / 70 | |
| `src/hooks/useDailyBlocks.js` / `useUserDailyBlocks.js` | 137 / 64 | |

---

## 2. 우선순위 로드맵

### ✅ Phase 1 — 저위험·고효용 (기능 변화 없음)

#### 1-1. CustomEvent 이름 상수화  *(위험: 매우 낮음)*
- **현황**: daily 관련 CustomEvent **8종**이 dispatch/listen 양쪽에 문자열 하드코딩 → 오타 시 조용히 깨짐.
  - 실측 종류: `toggle-page-navigate`, `section-comment-click`, `block-dismissed`, `toggle-more-menu`, `toggle-context-menu`, `section-visibility-toggle`, `quicktodo-inserted`, (+`pages-refresh`).
  - dispatch: `ToggleExtension.js` 다수 / listen: `TipTapEditor.jsx` L448·L460, `DailyPageV2.jsx`.
- **방향**: `src/constants/dailyEvents.js` 에 `Object.freeze({...})` 로 모으고 양쪽 치환.
- **검증**: 이벤트별 동작(섹션 댓글/이동/마스터토글/퀵투두 삽입) 수동 클릭.

#### 1-2. 죽은 Pin 버튼 제거  *(위험: 낮음, nodeView 내부라 주의)*
- **현황**: `toggle-pin-button` 은 v2에서 폐기. `pinButton.style.display = 'none'` 고정 + "v2 에서 폐기" 주석(ToggleExtension.js update 메서드).
- **대상**: pinButton 생성 + mousedown 핸들러 + actionsGroup append + update 분기 + `TipTapEditor.css` 의 `.toggle-pin-button`/`.toggle-pinned-marker` 룰.
- **주의**: actionsGroup 조립 순서/우측정렬(§17)에 영향 없도록. 제거 후 §16 일부(우측 정렬) 확인.

### 🟡 Phase 2 — 중위험 (구조 개선)

#### 2-1. `DailyPageV2.handleUpdate()` 분해 (L184–275, ~92줄)
- **현황 7책임**: ① 타이핑/리로드 가드 ② mass-softDelete 가드(2026-05-13 사고 방지) ③ diff 계산 ④ 스냅샷 결정 ⑤ Supabase apply + 로컬 merge ⑥ 체크박스 thread 동기 ⑦ 섹션 순서(userData) 동기 + 에러 리커버.
- **방향**: 순수 헬퍼로 추출 → `validateDiffSafety(diff, liveCount)`, `syncCheckboxThreads(updates)`, `syncSectionOrder(prevOrder, nextOrder, userId)`. `handleUpdate` 는 ~30줄 오케스트레이터로.
- **주의**: ② 가드 로직(insert/update 없고 softDelete가 active의 절반↑ 차단) 의미 보존 필수. 디바운스/ref 타이밍 유지.

#### 2-2. 캐러셀/카드뷰 네비 → `useCardCarouselNav()` 훅 (L476–599, ~123줄)
- **현황**: wheel→가로스크롤, drag-to-scroll, IntersectionObserver(카드 가시성), MutationObserver(카드 수), 키보드(←→)가 한 곳에 혼재.
- **방향**: `useCardCarouselNav(rootRef, isEnabled)` → `{ currentCardIndex, cardCount, scrollToCard(delta) }`.
- **주의**: column/card 뷰 모드 전환 시 옵저버 정리(cleanup) 누수 없게.

#### 2-3. nodeView 버튼/팝업 팩토리화 (~250줄 중복)
- **현황**: move·color·visibility·comment·star·(pin)·delete 버튼이 동일 패턴 반복(createElement→class→title→display→innerHTML(svg)→mousedown). move/color 팝업도 body-append+위치보정+doc-click-close 패턴 동일.
- **방향**: `createActionButton({cls, title, svg, show, onClick})`, `createAnchoredPopup(...)` 팩토리. SVG는 상수 묶음으로.
- **주의**: contentEditable=false, mousedown preventDefault/stopPropagation, opacity hover 룰 등 세부 보존. §17 우측정렬 영향 확인.

#### 2-4. daily 전용 CSS 분리 → `DailyPageV2.css`
- **현황**: `.tiptap-page--daily`, `.tiptap-editor-wrapper--daily`, `.daily-page-v2--carousel/column/card`, `.worklog-*`, `.toggle-more-menu` 등 ~700줄이 `TipTapPage.css`에 산재.
- **방향**: daily 전용 룰만 신규 파일로 이동, `.toggle-*` 공통은 잔류.
- **주의**: §17/§19 의 h2 카드 자식 width 보정 룰은 toggle 공통과 얽혀 있으니 이동 범위 신중히. 이동 후 카드/칼럼/캐러셀 3뷰 시각 회귀 확인.

### ⚠️ Phase 3 — 고위험 (별도 설계 필요)

#### 3-1. `nodeView()` ~900줄 분해
- **현황**: DOM 구조 + 체크박스 상호작용 + 버튼/팝업 + 드래그핸들 + 멀티셀렉트 decoration + 페이지링크가 한 클로저.
- **선결 조건**: ① Node 업그레이드로 vitest 복구 ② Phase 2-3(버튼 팩토리) 선행 ③ §16 전체 체크리스트를 회귀 스위트로.
- **참고**: CRITICAL_LESSONS — "Extension에서 직접 DOM 조작 지양, React useEffect 사용" 원칙과의 정합성 검토.
- **결론**: 효용 크나 회귀 위험 최고. 안전망 갖춘 뒤 착수.

---

## 3. 의도적 설계 — 건드리지 말 것 (debt 아님)

| 항목 | 위치 | 이유 |
|------|------|------|
| mass-softDelete 가드 | `DailyPageV2.jsx` L212–225, `dailyBlockOps.js` | 2026-05-13 전량삭제 사고 방지. 명시적 안전장치 |
| 섹션마스터 자동삭제 주석처리 | `DailyPageV2.jsx` L250–260 | race condition 위험으로 의도적 비활성. 전용 UI 생기면 재검토 |
| v1/v2 blockId 병행 | `blockId.js`(ToggleExtension에서 `genBlockId` 9회) / `blockIdV2.js`(신규 5개 모듈) | 마이그레이션 브리지. v1 완전 제거 후 일괄 통합 |
| `PATCH_FIELDS` 가 `FIELD_MAP_TO_DB`의 부분집합 | `docToBlocks.js` L177 / `dailyBlockMapper.js` L31 | 중복이 아니라 "변경 가능 필드만" 큐레이션. 단, 스키마 컬럼 추가 시 두 곳+row factory 동기 필요(완화책: 아래) |

### 참고: 필드 목록 결합도 (선택적, 저위험)
`dailyBlockMapper`(26필드) / `docToBlocks.PATCH_FIELDS`(가변 17필드) / `createDailyPageV2`·`carryOverPipelineV2` row factory 가 같은 필드군을 각자 나열.
스키마 컬럼 추가 시 누락 위험. 단일 `DAILY_BLOCK_SCHEMA` 상수로 모으는 것을 검토하되, 의미(가변/불변 구분)는 유지할 것. 파이프라인 영역이라 **테스트 안전망 복구 후** 권장.

---

## 4. 착수 순서 제안

1. (안전망) Node 20+/22 업그레이드 → `vitest` 복구 — 이후 모든 파이프라인 작업의 전제
2. Phase 1-1 이벤트 상수화 → 1-2 Pin 제거
3. Phase 2-1 handleUpdate 분해 → 2-2 캐러셀 훅 → 2-3 버튼 팩토리 → 2-4 CSS 분리
4. Phase 3 nodeView 분해 (안전망·팩토리 선행 후)

각 단계: `vite build` 통과 + 해당 기능 수동 테스트 + (가능 시) §16 체크리스트.
