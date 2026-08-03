# 리팩토링 안전망 실태 — thinkmap (2026-08-04)

> 조사 대상 질문: **"리팩토링을 안전하게 하려면 무엇이 필요한가"** — 지금 있는 그물이
> 회귀를 실제로 잡아주는지를 **실행 증거**로 잰다. 읽기 전용 조사, 산출은 이 문서 하나.
> `docs/REFACTOR-AUDIT-20260804.md`(무엇이 죽었나·무엇이 갈라졌나)와 짝 — 이 문서는
> **"그걸 지금 지워도/합쳐도 안전한가"** 쪽만 다룬다.

## 0. 판정 요약

| # | 항목 | 판정 | 근거(요약) |
|---|---|---|---|
| 1 | 단위 테스트 | **있음(실효)** | `npm run test:run` 실행 → 9 파일 · 170 passed / 38 skipped(208) · 451ms. 실제로 돈다. |
| 2 | 커버리지 범위 | **있음(형식뿐 — 매우 좁음)** | 테스트 대상은 전부 순수 변환 함수(`src/utils/*`) + payroll 계산 1파일. 컴포넌트·훅·컨텍스트·앱 전체·위성 6/7 = **0건**. |
| 3 | 타입 안전망(TS) | **없음** | `.ts/.tsx` 11개, 전부 `supabase/functions/`(Edge Function)뿐. `src/`·`apps/`·`packages/core`는 **100% 순수 JS**, `tsconfig.json` 없음. |
| 4 | 타입 안전망(JSDoc) | **있음(형식뿐)** | `@param`/`@returns` 등 49개 파일에 존재하나 이를 검사하는 `checkJs`/`tsc` 실행 지점이 없다(`jsconfig.json` 부재) — **주석일 뿐 강제되지 않는다**. |
| 5 | 린트(ESLint) | **없음** | `eslint.config.js` 는 있으나 **`eslint` 패키지 자체가 미설치**(`node_modules`·`package-lock.json` 0건, `package.json` devDependencies에도 없음). `npm run lint` 스크립트도 없음. **설정 파일은 죽은 파일이다.** |
| 6 | CI 검증 범위 | **있음(형식뿐 — 빌드만)** | `.github/workflows/deploy.yml`: install → **build만** → deploy. `npm test`·lint 스텝 **0건**. push 즉시 배포. |
| 7 | 커밋 훅(husky 등) | **없음** | `.husky/` 없음, `.git/hooks/`는 샘플뿐, `package.json`에 lint-staged/husky 언급 0건. |
| 8 | 위성별 편차 | **7/7 위성 전부 그물 없음** | 각 `apps/*/package.json`은 `dev`/`build`/`preview`/`deploy`만 있고 `test` 스크립트가 **없음**(1개 예외 없이 전 위성). `packages/core`도 자체 테스트 0건. |

**측정법 병기**: 1·6은 실제 명령 실행(`npm run test:run`, `cat .github/workflows/deploy.yml`)으로 확인. 3·5는 파일 존재 여부와 `node_modules`/`package-lock.json` 교차 확인(소스만 보고 판정하지 않음 — 브리프 함정 #3·#4 계열). 8은 `apps/*/package.json` 전수 grep.

---

## 1. 테스트가 실제로 돈다는 증거

```
$ npm run test:run
 RUN  v4.1.5 /Users/benja/claude-project/thinkmap
 Test Files  9 passed (9)
      Tests  170 passed | 38 skipped (208)
   Duration  451ms
```

9개 파일 전부 `tests/transform/` 아래 있고, `vitest.config.js`가 `include: ['tests/**/*.{test,spec}.{js,jsx,ts,tsx}']`로 **이 디렉토리만** 스캔한다(다른 곳에 `.spec.js`를 둬도 안 잡힌다).

`environment: 'node'`, `globals: false` — **DOM 환경이 없다.** `@testing-library/react`·`jsdom`·`happy-dom` 전부 미설치 확인:
```
node_modules/@testing-library  → 없음
node_modules/jsdom             → 없음
node_modules/happy-dom         → 없음
```
⇒ **지금 구조로는 컴포넌트 렌더 테스트를 vitest run 해도 애초에 실행이 안 된다**(파일을 써도 DOM API가 없어 즉시 에러). 이건 "테스트가 없다"보다 한 단계 더 나쁘다 — **테스트를 추가하려면 먼저 인프라(jsdom/happy-dom + testing-library)부터 깔아야 한다.**

## 2. 커버리지의 모양

### 2-a. 테스트되는 것 (9개 spec 파일 → import 대상)

| 파일 | 성격 |
|---|---|
| `blockIdV2.spec.js` | `src/utils/blockIdV2.js` — 순수 ID 생성/판별 함수 |
| `blocksToDoc`/`docToBlocks`/`docToBlocksVisibility`/`round-trip`.spec.js | `src/utils/blocksToDoc.js`, `docToBlocks.js` — 변환 레이어(WORKLOG-SPEC §3.7.3 R1~R7) |
| `carryOverPipelineV2.spec.js` | `src/utils/carryOverPipelineV2.js` — pure 부분만 |
| `dailyBlockMapper.spec.js` | `src/utils/dailyBlockMapper.js` — DB row 변환 |
| `dailyBlockMerge.spec.js` | `src/utils/dailyBlockMerge.js` |
| `dailyBlockOps.spec.js` | `src/utils/dailyBlockOps.js` — mock Supabase 클라이언트로 호출 패턴만 검증(실제 DB 없음) |
| `worklogTemplateV2.spec.js` | `src/utils/worklogTemplateV2.js` |
| `payroll.spec.js` | `apps/payroll/src/utils/payroll/attendanceParser.js` + 급여 계산 함수 — **7위성 중 유일하게 테스트가 닿는 위성** |

`src/utils/`는 19개 파일 중 **8개**가 테스트됨(≈42%). `siteNodesSeed.js`·`quickTodoOps.js`·`dailyBlockSnapshot.js`·`pageTypes.js`·`toggleNodeFactory.js`·`createDailyPageV2.js`·`sectionUtils.js`·`blockId.js`·`ensureDailyPage.js`·`worklogConstants.js`·`backofficePage.js`(11개)는 **미측정(테스트 0)**.

### 2-b. 테스트되지 않는 것 (전수 0건 확인)

| 영역 | 규모 | 테스트 참조 |
|---|---|---|
| `src/components/**/*.jsx` | 57개 | **0건**(테스트 파일에서 이 경로를 import하는 곳 0) |
| `src/hooks/`, `src/contexts/`(AuthContext 포함) | — | **0건** |
| `packages/core/src/**`(17개 js, useAuth·Modal 포함) | 17개 | **0건** |
| `apps/{canvas,crmboard,inventory,members,membership,seat}` | 6/7 위성 | **0건**(payroll만 예외) |
| `supabase/functions/*.ts`(Edge Function 11개) | 11개 | **0건**(`*.test.*`/`*.spec.*` find 결과 공집합) |
| `vite.config.js` 8벌(모선+위성7) | 8개 | 테스트 대상 아님(구조상 단위테스트 불가 종류) |

### 2-c. ★리팩토링 1~4순위 대상 vs 테스트 유무 (REFACTOR-AUDIT §10 순위표 대조)

| 순위 | 리팩토링 대상 | 테스트 존재? | 비고 |
|---|---|---|---|
| 1 | 배포 스크립트(`gh-pages -d dist` 등, 8벌) | **없음** | 셸/CI 실행형이라 현 vitest 구조로 단위테스트 불가 |
| 2 | 에러·로딩 UI(`App.jsx`의 `authLoading` 블록, 7/7 바이트 동일) | **없음** | 컴포넌트 테스트 인프라 자체가 없음(§1) |
| 3 | 공통 컴포넌트(Modal — core 1개 + 위성 3곳 자체구현) | **없음** | `Modal.jsx`(core) 포함 전부 0. `Modal.jsx`를 고쳐도 회귀를 잡아줄 게 없다 |
| 4 | 빌드 설정(`vite.config.js` 7벌) | **없음** | 설정 파일, 테스트 대상 범주 밖(구조 자체를 팩토리화해도 "돌아가는지"는 실제 빌드로만 확인 가능) |
| — | 인증 게이트(`useAuth.js`, `AuthContext.jsx`, `signInWithOAuth` 호출부) | **없음** | 오늘 로그인 튕김 조사(§3, AUDIT 문서)에서 원인 규명이 **전부 수동 실측**이었던 이유가 이거다 — 회귀 테스트가 있었으면 자동으로 잡혔을 부류 |

**⇒ 1~4순위 전부, 그리고 인증 게이트까지 — 안전망이 정확히 0이다.** 즉 "지금 그물로 리팩토링해도 되는가"라는 질문에 대해, **정확히 이 5개 영역이 그물 밖**이다.

---

## 3. 이 그물로 안전하게 할 수 있는 리팩토링 / 할 수 없는 리팩토링

### ✅ 안전하게 할 수 있는 것 (실효 그물 안)
- **`src/utils/blockIdV2.js`·`blocksToDoc.js`·`docToBlocks.js`·`carryOverPipelineV2.js`·`dailyBlockMapper.js`·`dailyBlockMerge.js`·`dailyBlockOps.js`·`worklogTemplateV2.js` 리팩토링** — 시그니처를 유지하며 내부 구현을 바꾸는 것은 `npm run test:run`이 170개 테스트로 즉시 회귀를 잡는다.
- **`apps/payroll/src/utils/payroll/attendanceParser.js` 및 급여 계산 함수 리팩토링** — 동일하게 실효 그물 있음.
- 위 8개 파일을 **다른 곳으로 옮기거나 이름을 바꿔도**, import 경로만 spec에서 같이 갱신하면 회귀 검증 가능(단, 승인 게이트 하의 별건).

### ⚠️ 그물이 형식뿐이라 "돌지만 안전을 보장 못 하는" 것
- **JSDoc이 있는 파일의 타입 리팩토링** — 주석은 사람이 읽을 뿐 `tsc --checkJs` 등으로 강제되지 않는다. 타입이 어긋나도 아무것도 안 걸린다.
- **CI를 통과했다는 사실 자체** — CI는 `npm run build`만 돈다. **빌드가 성공했다는 것은 "문법이 깨지지 않았다"만 보장하지, "동작이 바뀌지 않았다"는 보장하지 않는다.** 오늘 배포 스크립트 조사에서 실물로 확인된 함정(`gh-pages -d dist`가 `package.json`엔 있지만 실제론 수동 push로 우회 중, AUDIT §2)과 같은 종류 — **"스크립트가 있다" ≠ "그물이 있다"**를 CI 전체에 대해서도 적용해야 한다.

### ❌ 지금 그물로는 안전을 보장할 수 없는 것 (사실상 전부 수동 검증 필요)
- **배포 스크립트 통합**(1순위) — 테스트 불가 영역. 실제 배포 후 7위성 HTTP 200 + 페이지 로드를 **사람이/브라우저 자동화로** 확인해야 함.
- **에러·로딩 UI·AuthGate 훅화**(2순위 + 인증게이트) — 컴포넌트 테스트 인프라 부재. 리팩토링 후 **로그인 흐름을 모선+위성 최소 2곳에서 실제로 로그인해봐야** 회귀(오늘 조사 중이던 "로그인 튕김"류)를 잡을 수 있다. **이 영역이 가장 위험하다** — 이미 사고 이력이 있고(AUDIT §10 순위1 배포, 순위2 에러UI 둘 다 "이미 갈라지기 시작"), 자동 회귀망이 전무하다.
- **Modal 통합**(3순위) — core `Modal.jsx`를 고쳐도 그걸 새로 쓰게 될 위성 3곳(canvas·membership·seat 자체구현)에서 포커스트랩·접근성이 깨져도 자동으로 안 걸림. 육안 확인 필수.
- **vite.config 팩토리화**(4순위) — 팩토리로 바꾼 뒤 **7위성 전부 실제로 빌드+로컬 프리뷰**해서 base 경로·포트·legacy 플러그인(membership) 등 고유분이 보존됐는지 확인해야 함. 단위테스트로 안 잡힘.
- **패키지 삭제류**(AUDIT §4-a 미참조 파일 7건, §4-d 죽은 CSS 103건) — 정적 분석(import 그래프)으로 "안 쓰인다"는 확인했지만, 그 분석 자체가 런타임 주입(서드파티 27건 실물)에 27건이나 틀렸던 전례가 있다(AUDIT §4-d). 삭제 후 **화면을 실제로 띄워 확인**하는 것이 유일한 검증.

---

## 4. 최소 보강 제안 (효과 큰 순서)

리팩토링 1~4순위를 착수하기 *전에* 그물부터 깔면, 지금 "사람이 눈으로 확인" 의존인 구간을 자동화로 옮길 수 있다. 비용 대비 효과 순:

1. **CI에 `npm run test:run` 스텝 추가** — 이미 존재하는 170개 테스트를 push마다 강제로 돌리기만 하면 됨. 코드 0줄 추가, `deploy.yml`에 스텝 1개. ★지금은 로컬에서 안 돌리면 아무도 모른다(누가 로컬에서 돌리기 전엔 깨진 채로도 배포된다) — **가장 싼데 지금 0인 구멍**.
2. **컴포넌트 테스트 인프라 설치**(`jsdom` 또는 `happy-dom` + `@testing-library/react`, vitest `environment` 분기) — 이게 있어야 2·3순위(에러UI·Modal) 리팩토링에 자동 회귀망을 걸 수 있다. 설치 자체는 가볍고, 이후 스모크 테스트("AuthGate가 로그인 안 된 상태에서 로그인 화면을 렌더한다" 수준)만 있어도 §3의 "❌" 항목 중 가장 위험한 인증 게이트 쪽을 부분적으로 "⚠️"로 끌어올릴 수 있다.
3. **ESLint 설치 + `npm run lint` 스크립트 + CI 연결** — 설정 파일은 이미 있으니(`eslint.config.js`) `npm i -D eslint @eslint/js globals eslint-plugin-react-hooks eslint-plugin-react-refresh` + `package.json`에 `"lint": "eslint ."` 한 줄이면 됨. `no-unused-vars` 규칙이 이미 정의돼 있어 **죽은 코드 재발 방지**(AUDIT §4에서 찾은 것과 같은 종류)에 바로 값이 있다.
4. **위성별 `test` 스크립트 추가**(최소 `payroll`처럼 루트 vitest가 위성 유틸을 import하는 패턴을 나머지 6위성에도) — 배포 스크립트·빌드 설정 통합(1·4순위) 작업 시 "이 위성만 조용히 깨졌다"를 잡을 최소 장치.
5. **배포 후 스모크 체크**(자동화는 아니지만 최소 절차화) — 1순위(배포 통합) 자체가 테스트 불가 영역이므로, 최소한 "7위성 HTTP 200 + 콘솔 에러 0"을 배포 스크립트 마지막 스텝으로 강제하는 것을 권고(claude-in-chrome 스크린샷 QA는 이미 `deploy_visual_qa_gate` 관례로 존재 — 이걸 **자동 게이트로 승격**하는 것도 후보).

**결론**: 지금 그물은 "순수 함수 변환 레이어"에만 실효가 있고, 정확히 오늘 리팩토링하려는 4대 영역(배포·에러UI/인증게이트·모달·빌드설정)은 **전부 그물 밖**이다. 1~4순위 리팩토링을 진행하려면, 최소한 위 1번(CI에 기존 테스트 연결)과 5번(배포 후 스모크 확인 절차화)은 **착수 전 선행**을 권고 — 둘 다 새 코드 작성 없이 즉시 가능한 저비용 항목이다.
