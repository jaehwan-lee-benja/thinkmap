# ThinkMap 파일 구조 검수 & 개선안 (초안)

> 작성: 2026-06-23 · 읽기 전용 분석 결과. 이 문서는 **제안**이며, 실제 파일 이동/삭제/리네임은 포함하지 않는다.
> 범위: `main` 브랜치 작업 트리 스냅샷. (`wip/paused-session-2026-06-13`은 미검토)

## 1. 현재 구성 요약

### 1.1 전체 분포
| 영역 | 규모 | 비고 |
|---|---|---|
| 루트 `.sql` | **119개 (git 추적)** | create 13 / migrate 59 / diagnose 18 / fix 4 / verify 3 / recover 2 / add 6 / alter 3 / seed 2 / 기타 9 |
| 루트 `.md` 계획문서 | **21개** (PLAN-* 15 + REFACTORING/TEMPLATE/WORK_LOG/MOBILE 등) | `docs/`의 20개와 거의 맞먹는 양이 루트에 평면 배치 |
| 루트 `.js` 일회성 스크립트 | 2개 | `migrate-json-to-blocks.js`, `run-migration.js` |
| `src` 코드 | 약 **31,000 라인** (.js/.jsx) | |
| `src/components` | 24개 도메인 폴더 + `PaneProvider.jsx` | TipTapEditor가 25파일로 압도적 |
| `src/hooks` | **45개 파일이 평면 배치** | 그룹핑 없음 |
| `src/utils` | 22개 (+ `payroll/` 하위) | daily/block 계열이 다수 |
| `src/contexts` | 7개 (`.jsx` 5 + `.js` 2 혼재) | |
| `tests` | transform 단위 테스트 9 + fixtures 13 | 변환 로직만 커버 |
| `supabase/` | `config.toml` + functions 2개. **`migrations/` 디렉터리 없음** | 마이그레이션이 전부 루트에 흩어짐 |
| `dist/` | git 미추적(정상) | |

### 1.2 가장 큰 파일 (책임 비대 후보)
| 라인 | 파일 |
|---|---|
| 3,481 | `src/components/TipTapEditor/extensions/ToggleExtension.js` |
| 1,827 | `src/components/TipTapEditor/TipTapTestPage.jsx` |
| 1,042 | `src/components/TipTapEditor/DailyPageV2.jsx` |
| 964 | `src/components/TipTapEditor/extensions/FoldableTable.js` |
| 871 | `src/components/TipTapEditor/TipTapEditor.jsx` |
| 743 | `src/components/TipTapEditor/MindMapView.jsx` |
| 665 | `src/App.jsx` |
| 647 | `src/components/TipTapEditor/components/BlockContextMenu.jsx` |

---

## 2. 구조적 발견 (Findings)

### F1. 루트 오염 — 가장 큰 문제 ⚠️
루트에 **140여 개의 운영 잔여물**(SQL 119 + 계획 MD 21 + 스크립트 2)이 평면으로 쌓여 있다. 이 때문에 루트 `ls`에서 `package.json`, `index.html`, `vite.config.js` 같은 실제 프로젝트 앵커 파일이 묻힌다. 신규 합류자/에이전트가 "이 레포의 진입점이 무엇인가"를 파악하기 어렵다.

세부:
- **diagnose-*.sql 18개, recover-*.sql 2개, verify-*.sql 3개, Q3-*/phase07-* 등** → 특정 날짜·사건(예: `diagnose-daily-2026-05-13.sql`, `recover-daily-2026-05-13-v2.sql`) 디버깅용 **일회성**. 재실행할 일이 거의 없는 역사적 기록.
- **migrate-*.sql 59개 + create-*.sql 13개 + add/alter 9개**가 **실행 순서 정보 없이** 평면 나열. `supabase/migrations/`라는 표준 위치가 비어 있어, 신규 DB를 0부터 세우는 정본 순서를 코드만 보고 복원할 수 없다.
- **계획 MD 21개**(`REFACTORING_PLAN.md`, `TIPTAP_MIGRATION_PLAN.md`, `PLAN-*.md` 등)는 대부분 완료/이력성 문서인데 `docs/`의 살아있는 SPEC과 구분 없이 루트에 섞여 있다.

### F2. 확정 Dead Code: `ToggleView.jsx`
`src/components/TipTapEditor/extensions/ToggleView.jsx` — 전체 `src/` 내에서 **import도 문자열 참조도 0건**(확인함). 토글 NodeView는 `toggleNodeFactory.js`로 대체된 것으로 보인다. 안전하게 제거 후보.

### F3. 오해를 부르는 네이밍: `TipTapTestPage.jsx`
이름은 "Test Page"인데 실제로는 **메인 에디터 페이지**로 사용된다 (`App.jsx`, `GoalCaptureDrawer.jsx`, `pageTypes.js`, `ensureDailyPage.js` 등에서 import). 1,827라인의 핵심 컴포넌트가 "테스트"로 명명돼 있어, 정리 대상으로 오인되거나 신규자가 진짜 페이지를 못 찾는다.

### F4. 버전 접미사(V2) 드리프트
`DailyPageV2`, `blockIdV2`, `carryOverPipelineV2`, `createDailyPageV2`, `worklogTemplateV2`, `useUserDailyBlocks`(V2 계열) 등 `V2` 꼬리가 코드 전반에 굳었다. V1이 이미 제거됐다면 `V2`는 의미 없는 잡음이고, 남아 있다면 어느 쪽이 정본인지 파일명만으로 모호하다. (※ 리네임은 import 광범위 수정이라 난이도 높음 — 우선순위 낮게 잡되 방향만 기록)

### F5. hooks 45개 평면 배치
`src/hooks/`에 45개가 한 폴더에. 도메인 군집(canvas 6 / roster 5 / schedule 5 / daily-block 3 / worklog 2 …)이 뚜렷한데도 평면이라, 특정 도메인 훅을 찾을 때 전체를 스캔해야 한다.

### F6. contexts 확장자 혼재
`src/contexts/`에 `.jsx`(AuthContext, BackupContext, PageContext, ProjectContext, SharingContext, UIContext) 5~6개와 `.js`(`FavoritesContext.js`) 혼재. JSX를 반환하는 Provider면 `.jsx`로 통일하는 게 린트/툴링 일관성에 유리.

### F7. 거대 파일 (책임 비대)
`ToggleExtension.js`(3,481), `TipTapTestPage.jsx`(1,827), `DailyPageV2.jsx`(1,042)는 단일 파일로 너무 많은 책임을 진다. 토글 SPEC이 별도 관리될 만큼 복잡한 영역이라 수정 리스크가 집중된다. (다만 토글은 SPEC·가드 에이전트로 보호되고 있어 무리한 분할은 오히려 위험 — F7은 "인지하고 점진 분리" 수준)

### F8. 테스트 커버리지 편중
`tests/transform/`의 9개 spec은 변환/파이프라인 순수 로직(blockId, carryOver, dailyBlock*, payroll, round-trip 등)을 잘 커버한다 — 좋은 자산. 다만 컴포넌트/훅 레벨 테스트는 없다. (순수 함수 위주 전략이면 합리적이므로 "공백 인지" 수준)

---

## 3. 개선안 (우선순위순)

표기: 영향도(High/Med/Low) · 난이도(Low/Med/High). **모두 제안일 뿐, 본 검수에서는 미실행.**

### P1 — 루트 SQL 정리 · 영향 High · 난이도 Low ⭐
**현재**
```
/ (루트)
  create-*.sql ×13   migrate-*.sql ×59   add/alter ×9
  diagnose-*.sql ×18  recover-*.sql ×2   verify-*.sql ×3
  Q3-*/phase07-*/fix-*/seed-* …
```
**제안**
```
supabase/migrations/      ← 스키마를 만드는 정본(create/migrate/add/alter)을
                            타임스탬프 또는 적용 순서 접두사로 이동·정렬
db/diagnostics/           ← diagnose-*, verify-* (일회성 조사용, 이력 보존)
db/recovery/              ← recover-*, 특정 날짜 cleanup (사건 기록)
db/seed/                  ← seed-*
```
**근거**: Supabase 표준 위치(`supabase/migrations/`)를 채우면 신규 DB 부트스트랩 순서가 코드로 복원된다. 일회성 조사 SQL은 지우지 말고 `db/diagnostics`로 격리해 루트를 비운다. *(이동은 순서·idempotency 검증이 필요하니, 1차로는 "분류 매핑 표"만 만들고 단계 이동 권장)*

### P2 — Dead code 제거: `ToggleView.jsx` · 영향 Med · 난이도 Low ⭐
**현재** `extensions/ToggleView.jsx` (참조 0) · **제안** 삭제(또는 `archive/`로 이동 후 다음 정리 때 제거).
**근거**: 토글 영역은 가드 에이전트가 검수하는 민감 구역 — 죽은 파일이 "현역 NodeView"로 오인되면 잘못된 수정 위험. 제거 전 `toggle-guardian`로 한 번 교차 확인 권장.

### P3 — 루트 계획 MD 아카이브 · 영향 Med · 난이도 Low ⭐
**현재** 루트에 `PLAN-*.md` 15 + `REFACTORING_PLAN.md`/`TIPTAP_MIGRATION_PLAN.md`/`WORK_LOG_PLAN.md`/`MOBILE_OPTIMIZATION_PLAN.md`/`TEMPLATE_SYSTEM_PLAN.md`/`CRITICAL_LESSONS.md`/`TEST_CHECKLIST.md`/`PHASE07-regression.md`/`PHASE1-deploy-verify.md` 등.
**제안**
```
docs/specs/        ← 살아있는 명세 (현 docs/*-SPEC.md 유지)
docs/plans/        ← 완료/진행 계획문서 (PLAN-*, *_PLAN.md)
docs/lessons/      ← CRITICAL_LESSONS.md 등 회고
```
루트에는 `README.md` / `CLAUDE.md`만 남긴다.
**근거**: "살아있는 규칙(SPEC)" vs "지나간 계획"이 섞이면 CLAUDE.md가 가리키는 정본 SPEC의 권위가 흐려진다. `docs/` 내부도 SPEC/PLAN/MARKETING이 평면이라 같은 분리가 필요(`docs/MARKETING-CANVAS-*`, `docs/PLAN-unified-*`).

### P4 — `TipTapTestPage.jsx` 리네임 · 영향 Med · 난이도 Med
**현재** `TipTapTestPage.jsx` (실제 메인 에디터) · **제안** `EditorPage.jsx`(또는 `PageEditor.jsx`)로 리네임 + import 갱신.
**근거**: 이름과 실제 역할의 불일치 해소. 다만 6+ 파일에서 import하므로 한 번에 일괄 수정 필요(난이도 Med). git mv + 참조 치환을 한 커밋으로.

### P5 — hooks 도메인 그룹핑 · 영향 Med · 난이도 Med
**현재** `src/hooks/*` 45개 평면 · **제안**
```
src/hooks/
  canvas/    (useCanvas* 6)
  roster/    (useRoster* 5)
  schedule/  (useSchedule* 5, useCalendar* 2)
  daily/     (useDailyBlocks, useUserDailyBlocks, useLeftoverTodos …)
  worklog/   (useWorklog* 2)
  core/      (useAuth, useIsMobile, useClickOutside, useKeyboardHeight … 공용)
```
**근거**: 도메인 경계가 이미 파일명에 인코딩돼 있어 그룹핑 비용 대비 탐색성 이득이 크다. 단 import 경로가 다수 바뀌므로 한 도메인씩 점진 이동 권장.

### P6 — contexts 확장자 통일 · 영향 Low · 난이도 Low
`FavoritesContext.js` → `.jsx`로 통일(JSX 반환 시). 일관성/툴링 정합.

### P7 — 거대 파일 점진 분리 · 영향 Low(현 안정) · 난이도 High
`ToggleExtension.js`(3.5k)·`TipTapTestPage.jsx`(1.8k)는 **지금 당장은 건드리지 말 것**. SPEC·가드로 보호되는 민감 구역이라 분할 리스크가 정리 이득보다 크다. 다음에 해당 영역을 크게 만질 일이 생길 때 "커맨드/뷰/시리얼라이저" 경계로 자연스럽게 분리하는 것을 권장. 지금은 *인지만*.

---

## 4. 권장 실행 순서 (실용 우선)

1. **P2(ToggleView 삭제)** — 가장 싸고 명확. `toggle-guardian` 교차확인 후 제거.
2. **P3(계획 MD → docs/plans)** — 코드 무영향, 루트 즉시 정돈.
3. **P1(SQL 분류)** — 먼저 "분류 매핑 표"만 작성 → 합의 후 `git mv` 단계 이동.
4. **P6(contexts 확장자)** — 묶어서 처리.
5. **P4 / P5(리네임·hooks 그룹핑)** — import 광범위 수정이라 별도 PR로 신중히.
6. **P7** — 보류(인지만).

## 5. 잘 되어 있는 점 (유지)
- `src/components`의 **도메인별 폴더 분리**(Schedule/Roster/Canvas/Dashboard/Members …)는 일관적이고 깔끔.
- `docs/`의 **SPEC 체계 + CLAUDE.md의 "수정 전 필독" 게이트**는 강력한 자산 — 이 구조를 SQL/PLAN 정리에도 확장하면 됨.
- `tests/transform` + `fixtures`로 **순수 변환 로직을 픽스처 기반 테스트**한 점은 모범적.
- `supabase/functions`, `scripts/` 분리, `.gitignore`(.env/dist/node_modules)는 적절.

---
*본 문서는 검수·제안만 담는다. 어떤 코드/파일도 이동·삭제·리네임하지 않았다.*
