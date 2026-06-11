# 데일리 이월·권한 분리 아키텍처 기획서

> 상태: 확정 (2026-06-09) · 노선: **A안 — 보드-권한 서버측 이월** · 형태: **Edge Function (JS 로직 재사용)**
> 적용 대상: 데일리 업무일지(daily) 페이지의 **생성 · 이월(carry-over) · 가시성(visibility)**
> 이 문서는 *이번 한 번의 버그 수정*이 아니라, 데일리/이월/권한을 만지는 **모든 향후 작업이 참조할 원칙과 워크플로우**를 정의한다. 섹션 모델이 또 바뀌어도(예: 섹션 재분리) §2 원칙은 유지된다.

---

## ▶ 진행 상태 (Progress) — 끊겨도 여기부터 이어서

| Phase | 내용 | 상태 | 비고 |
|---|---|---|---|
| 0 | 가시성 상속 코드 강제 (P1) | ✅ 코드완료 | createDailyPageV2·DailyPageV2:368 빈자식 상속 + 이월 visibility=대상섹션 + 매핑실패 skip. 빌드 OK. 런타임 검증만 남음 |
| 0.5 | 기존 데이터 백필 (Q3) | ✅ 완료 | LIVE 2,744 'all'→'master' 백필. remaining=0. 백업=`q3_visibility_backup_20260609`(롤백 가능) |
| 0.7 | RLS 보드 멤버십 정렬 (Q4/P6) | ✅ 완료 (LIVE 적용 + 실기기 검증 통과 + 릴리즈) | LIVE 발견: pages_*_worklog 가 daily 를 로그인 전원 개방 → pages additive 무의미. 변경은 **daily_blocks UPDATE 1개**(협업: `OR visibility='all' AND is_board_member_of_page`). 멤버 등록(partner+rlawldus0621=member). 회귀표 통과(`PHASE07-regression.md`). 헬퍼 `is_board_member_of_page`. 롤백=`phase07-step2-rls.sql` 하단. **2026-06-11 검증: partner 'all' 편집/이월 정상·master 블록 안 보임 확인. main `ee0fd1a` 배포 완료** |
| 1 | Edge `ensure-daily-page` (A안) | 🔄 코드완료 (배포/검증 대기) | 브랜치 `feature/edge-ensure-daily-page`. 함수+클라 헬퍼+4개 호출지점 전환 완료, `deno check`/`npm run build` 통과. 남은 것=배포(사용자 토큰)+실기기 검증. 런북=`PHASE1-deploy-verify.md` |
| 2 | 클라 이월 경로 제거·정리 | ⬜todo | Edge 일원화 |

**▶▶ 다음 진입점 = Phase 1 배포·검증 (PHASE1-deploy-verify.md) ◀◀**
- 코드는 끝남. `SUPABASE_ACCESS_TOKEN` 으로 `supabase functions deploy ensure-daily-page --project-ref sqisntxippjzcekyhqyo` → `.env` `VITE_USE_EDGE_DAILY=true` → 검증 시나리오(런북 §3). service_role 시크릿은 런타임 자동 주입이라 불필요.

---

### (이전 진입점 기록) Phase 1 착수 전
- 해결할 증상(2026-06-11 실측): **partner(비마스터)가 daily 생성 → 섹션은 넘어오나 그 안의 master 콘텐츠는 이월 안 됨.** 원인: 이월이 partner 권한(RLS)으로 실행 → `daily_blocks` SELECT(`visibility='all' OR is_master()`)가 master 블록을 가려 *읽지도 못함* → 복사 누락. (P1 때문에 SELECT 를 열 수 없음 → 서버 권한이 정답.)
- 할 일: ① Supabase CLI 1회 셋업 → ② Edge Function `ensure-daily-page` 작성(service_role 로 prev 전부 읽어 master 블록까지 `visibility='master'` 그대로 carry, JS 이월 로직 재사용) → ③ 클라 `createDailyPageV2` 이월 경로를 함수 호출로 전환 → ④ 검증.
- 상세 설계: 아래 §3.2 / §5 Phase 1 참조.

**🔖 세션 재개 핸드오프 (2026-06-11, 릴리즈 후 갱신):**
- 완료: Phase 0(가시성 상속 코드 — partner 'all' 이월·양식 정상 실측 확인), Phase 0.5(LIVE 2,744 백필, remaining=0), **Phase 0.7(board-membership RLS — LIVE 적용 + 실기기 검증 통과 + 배포 완료)**.
- **릴리즈 상태:** main=`ee0fd1a` 푸시 → GitHub Actions 배포 성공. 라이브 https://jaehwan-lee-benja.github.io/thinkmap/ 갱신. 앱 코드 ↔ Supabase 정책 일치.
- Phase 0.7 적용 내역(LIVE): ① 멤버 등록 partner+rlawldus0621=member(보드 0fcc0fee), ② 헬퍼 `is_board_member_of_page` 생성, ③ `daily_blocks_update` 정책에 `OR (visibility='all' AND is_board_member_of_page(page_id))` 추가(USING·CHECK). pages/SELECT/INSERT/DELETE 무변경.
- Phase 0.7 산출 파일: `phase07-step1-enroll.sql`(멤버), `phase07-step2-rls.sql`(RLS+롤백), `PHASE07-regression.md`(회귀표·검증 시나리오), `verify-live-policies-1.sql`(BEFORE 덤프), `diagnose-board-membership-all.sql`(멤버십 진단).
- **재개 시 할 일: 곧장 Phase 1 착수** (위 "다음 진입점" 절차). 검증·릴리즈는 끝났으니 더 할 것 없음.
- 미실행/보류 SQL: 진단 보존본 `diagnose-carry-67-to-69.sql` 등.
- 백필 롤백표: `q3_visibility_backup_20260609`. Phase 0.7 롤백: `phase07-step2-rls.sql` 하단 STEP2-ROLLBACK.
**작업 브랜치:** `main`=`fix/daily-worklog-broken-2026-06-08`=`ee0fd1a` (동기). Phase 1 은 main 에서 새 브랜치로 시작 권장. 편집모드 WIP 별도: `feature/edit-mode-visual-indicator`.
**Phase 0 적용 코드(빌드 OK, 런타임 검증 대기):** `createDailyPageV2.js`(빈자식 상속), `carryOverPipelineV2.js`(매핑실패 skip + `buildSectionVisibilityMap`/이월 visibility 상속), `DailyPageV2.jsx:368`(빈자식 상속).

---

## 0. 한 줄 요약

데일리 페이지의 **연속성(이월)** 과 **권한(가시성)** 은 독립적인 레이어인데 현재 구현에서 얽혀 있다. 이월을 *페이지를 만든 사용자의 권한* 안에서 실행하기 때문에, 비마스터가 만든 공유 페이지에는 마스터 콘텐츠가 이월되지 못한다. 해법은 **이월을 "행위자"가 아니라 "보드"의 권한으로 실행되는 서버측 보드-레벨 연산으로 분리**하고, **가시성은 콘텐츠 고유 속성이 아니라 섹션(구조)에서 파생되는 투영**으로 강제하는 것이다.

---

## 1. 배경 — 2026-06-08~09 진단

### 1.1 관찰 사실 (진단 SQL 결과)

- 비마스터(`sarurufarm.partner`)가 6/8 데일리를 생성 → 양식 깨짐. 섹션 23개 중 **18개가 `visibility='master'`**, 그 아래 빈 자식 토글이 `'all'` 로 노출되어 **헤더 없는 고아 18개**.
- 같은 페이지에 직전 페이지에서 끌려온 **'all'-under-master 콘텐츠 173개**가 *cross-page* `section_id`(직전 날짜 섹션을 가리킴)로 고아화. → 진단: `diagnose-daily-2026-06-08.sql`, `diagnose-STEP1b-breakdown.sql`, `diagnose-STEP1c-carried.sql`.
- 6/8 삭제 후 비마스터가 새 6/9 생성 → 마스터로 열어보니 **마스터 섹션 콘텐츠 0개**. 6/7엔 이월 후보 **204개**가 있었으나 전혀 이월되지 않음. → 진단: `diagnose-carry-67-to-69.sql`.
- 마스터가 master 섹션에 직접 쓴 콘텐츠가 `visibility='all'` 로 저장되어 있음(전 페이지 합 **약 2,744 블록**).

### 1.2 두 겹의 얽힘 (진짜 뿌리)

**얽힘 ① 이월 ⟂ 권한.** 이월은 "보드의 연속성"인데 *페이지를 만든 사람의 RLS 권한* 안에서 실행된다.
- `daily_blocks` SELECT 정책 `USING(visibility='all' OR is_master())` 가 비마스터에게 master 섹션 행을 가린다.
- `createDailyPageV2 → carryOverEager` 가 클라이언트(생성자)의 권한으로 `prevRows`/`currentRows` 를 읽으므로, 비마스터는 master 섹션을 *읽지도 못해* (a) 매핑 실패 → cross-page 고아, (b) master-only 콘텐츠는 아예 이월 불가.
- 연속성이 **행위자의 권한에 인질**로 잡혀 있다.

**얽힘 ② 가시성 ⟂ 구조.** `visibility` 가 `daily_blocks` 행마다 비정규화되어 섹션(구조)의 visibility 와 **갈라질 수 있다**.
- master 섹션 안에 'all' 블록이 생기고(2,744개), 비마스터 화면에서 고아로 보인다.
- 콘텐츠의 가시성은 *블록 고유 속성*이 아니라 *소속 섹션에서 파생*되어야 하는데, 그 원칙이 어디에서도 강제되지 않는다.

공통 뿌리: **권한/가시성이 "파생되는 투영"이 아니라, 다른 레이어가 우회해야 하는 1급 데이터로 아래로 밀려 내려와 있다.**

---

## 2. 핵심 원칙 (★ 향후 모든 변경이 참조 ★)

> 이 4가지는 섹션 모델·UI·스키마가 바뀌어도 유지되는 불변 원칙이다. 데일리/이월/권한 관련 코드를 만들거나 고칠 때 **반드시 이 원칙에 비추어 검토**한다(§8 워크플로우).

- **P1. 가시성은 구조에서 파생된다.** 콘텐츠(블록)의 effective visibility = 그 콘텐츠가 속한 섹션의 visibility. 블록에 visibility 컬럼을 비정규화하더라도 그것은 *섹션의 거울*일 뿐 독립 진실이 아니며, 모든 쓰기 경로에서 섹션과 동기화되어야 한다.
- **P2. 연속성(이월)은 보드의 연산이다.** 이월은 보드의 시간선에 속하며, **누가 트리거했는지와 무관하게 동일한 완전한 결과**를 내야 한다. 행위자의 권한으로 실행되어선 안 된다.
- **P3. 권한(RLS)은 투영이지 1급 데이터가 아니다.** "사용자 X가 블록 Y를 보는가"는 (보드 멤버십 + 섹션 가시성)에서 *읽기 시점에 파생*된다. 다른 레이어(이월·구조)가 RLS를 우회하거나 RLS에 맞춰 동작을 바꾸도록 만들지 않는다.
- **P4. 페이지 생성은 보드 이벤트다.** 데일리 페이지의 "생성+양식 시드+이월"은 사용자 행동이 아니라 보드 이벤트다. 사용자는 *요청*할 뿐, 시스템이 *보드 권한으로* 완전하게 만든다.
- **P5. 권한 경계는 안정적으로, 업무 로직은 유연하게 — 둘을 분리한다.** "이월이 서버 권한으로 돈다"는 *경계*는 흔들리면 안 되는 구조다. 그러나 이월 *규칙*(후보 선정·완료유지·dedup 등)은 실제로 자주 진화한다(코드 v2 이력 참조). 진화하는 로직을 가장 경직된 층(SQL)에 박지 않는다 — 로직은 유연한 JS에 두고, 경계만 서버로 올린다. (이것이 Edge 채택 이유이자 PL/pgSQL 배제 이유.)
- **P6. 보드 데일리는 보드 소유다.** 한 보드의 하루치 페이지는 전 멤버가 공유하는 **보드의 것**이다. 읽기/편집 권한은 `pages.user_id`(만든 사람)가 아니라 **보드 멤버십 + 역할**(`worklog_board_members`)에서 파생된다. `user_id`는 `created_by` 감사용 메타데이터로 강등한다. (현재 RLS는 "만든 사람" 기준이라 보드 멤버십을 안 쓰는 갭이 있음 — §5 Phase에서 정렬.)

---

## 3. 목표 아키텍처 (A안)

### 3.1 레이어 분리

| 레이어 | 책임 | 진실의 출처 | 현재 상태 |
|---|---|---|---|
| 구조(섹션/양식) | 섹션 존재·순서·visibility | `worklog_sections` (board-scope) | 분리됨 ✅ |
| 콘텐츠(블록) | 일감/메모, 작성자, open/done | `daily_blocks`. visibility는 섹션 상속(P1) | ⚠️ 상속 미강제 |
| 연속성(이월) | 미완료가 다음 날로 흐름 | **보드 권한 서버 연산**(P2) | ❌ 클라 권한 종속 |
| 권한(RLS) | 사용자별 가시 범위 | (멤버십 + 섹션 visibility) 파생(P3) | 부분 — 블록 visibility 직접 의존 |

### 3.2 페이지 생성 = 보드 권한 서버 연산 (P4)

신규 데일리 진입 시 클라이언트는 **보드-권한 함수**를 호출하고, 함수가 보드 권한(service_role)으로 다음을 *멱등·원자적*으로 수행한다:

```
ensureDailyPage(boardId, date, requestingUserId):
  1. 페이지 row 멱등 생성 (이미 있으면 그 id)
  2. 보드 worklog_sections 템플릿으로 섹션 row 시드 (전 섹션, visibility=섹션 정의)
  3. 직전 데일리에서 이월 (전체 가시성):
       - 후보 선정·트리·dedup·섹션 매핑(sectionMasterId 기준)
       - 각 이월 블록 visibility = 대상 섹션 visibility (P1)
  4. 페이지 id 반환
→ 클라이언트는 이후 일반 RLS로 페이지를 읽는다(자기 가시 범위만). (P3)
```

**구현 형태: Supabase Edge Function (Deno) + 기존 JS 이월 파이프라인 재사용.**
- `carryOverPipelineV2.js`, `worklogTemplateV2.js`, `dailyBlockMapper.js`, `blockIdV2.js` 는 순수 ESM이라 Deno 에서 재사용 가능 → **검증된 로직을 PL/pgSQL로 재구현하지 않는다**(분기·버그 위험 회피).
- IO(`@supabase/supabase-js`)는 service_role 키로 생성한 클라이언트를 주입 → RLS 우회(보드 권한). 키는 Edge Function 시크릿에만 둔다(클라이언트 노출 금지).

### 3.3 왜 PL/pgSQL이 아닌 Edge Function인가 (확정)
- **로직 재사용·검증 보존**: 이월 로직(미완료+완료유지 후보 선정, root 필터, 서브트리, thread dedup, 섹션 매핑)은 이미 JS로 검증·테스트되어 있다. Edge Function은 **동일 코드**를 권한만 바꿔 실행 → 포팅 위험 0.
- **유연성(P5)**: 이월 규칙은 진화하는 업무 로직이다. JS에 두면 계속 쉽게 진화 가능. PL/pgSQL 재구현은 (a) 두 구현이 갈라질 위험, (b) 진화하는 로직을 경직된 층에 박는 안티패턴.
- **분리(P5)**: Edge는 *경계(서버 권한)* 와 *로직(JS)* 을 분리한다. PL/pgSQL은 둘을 하나의 경직된 덩어리로 다시 묶는다 — 이 문서가 풀려는 "얽힘"을 한 군데 더 만드는 셈.
- **비용**: 유일한 비용은 운영 표면 +1(Supabase CLI·함수 배포·service_role 시크릿 1회 셋업). 이는 일회성이며, 경직(PL/pgSQL)의 *지속적* 진화 세금보다 싸다.

---

## 4. 데이터 모델 / 불변식

- `worklog_sections(visibility)` = 섹션 가시성의 **유일한 진실**.
- `daily_blocks(visibility)` = (P1) 섹션 visibility의 거울. **불변식: 모든 살아있는 블록은 자기 `section_id`가 가리키는 섹션 행의 visibility와 같아야 한다.**
  - 검증 쿼리(상시 0이어야 정상): master 섹션 아래 `visibility='all'` 인 비-section 블록 수 = 0. (`diagnose-STEP1b-breakdown.sql` 의 §4 활용)
- `daily_blocks(section_id)` = 같은 페이지 내 섹션 행 self-ref. **불변식: 살아있는 비-section 블록의 `section_id`는 *같은 페이지*의 섹션 행 `block_id`와 일치해야 한다**(cross-page 금지). (`diagnose-other-broken-dailies.sql`)
- 이월 시 `visibility`는 `src.visibility`가 아니라 **대상 섹션의 visibility**에서 가져온다(P1).

---

## 5. 단계별 롤아웃

### Phase 0 — 가시성 상속 강제 (즉시, 인프라 0, 저위험)
노선과 무관하게 옳다. 새 페이지의 일관성을 확보하고 고아의 근원을 제거.
- [x] `createDailyPageV2.js` 빈 자식 토글이 섹션 visibility 상속. (적용됨)
- [x] `carryOverPipelineV2.js` 매핑 실패 root는 건너뜀(cross-page 고아 방지). (적용됨, 안전망)
- [x] **`DailyPageV2.jsx:368`** 리프레시 경로의 빈 자식 토글도 섹션 visibility 상속(`s.visibility || 'all'`).
- [x] **이월 visibility = 대상 섹션 visibility.** `buildSectionVisibilityMap(currentRows)` 신설, `toCarryOverSubtree`에 `sectionVisibilityByNewId` 옵셔널 인자 추가, eager/lazy 양쪽에서 전달. (매핑 없으면 원본 보존 fallback)
- 효과: 이후 생성되는 페이지는 고아가 없다. 비마스터 페이지에 마스터 콘텐츠가 "없는" 것은 *버그가 아니라 정의된 동작*이 된다(Phase 1에서 해소).

### Phase 0.5 — 기존 데이터 정합 (Q3, 1회, 백업+dry-run)
- [ ] master 섹션 아래 비-section 블록 중 `visibility='all'` → `'master'` 1회 백필(전 페이지). 백업 테이블 기록 → dry-run 으로 범위 확인 → UPDATE → 검증(§4 불변식=0). 멱등·무손실.
- 효과: 공유 페이지에서 비마스터에게 보이던 'all'-under-master 고아 제거. P1 불변식이 기존 데이터에도 성립.

### Phase 0.7 — 권한을 보드 소유로 정렬 (Q4/P6, RLS, 신중)
- [ ] `pages` RLS(SELECT/UPDATE/DELETE)에 *additive* 조건 추가: `page_type='daily'` 면 `EXISTS (worklog_board_members WHERE board_id=pages.parent_id AND user_id=auth.uid())` → 보드 멤버는 누가 만들었든 보드 데일리 접근. 편집·삭제는 보드 `role='master'` 게이트.
- [ ] `daily_blocks` RLS도 보드 멤버십과 정렬(현재 SELECT가 `visibility='all'`을 전원 노출 — 보드 격리 부재. additive 추가 후 cross-board 노출 축소는 별도 신중 검토).
- [ ] 기존 링크계정/공유 경로는 그대로 두어(OR 조건) 현행 접근 비파괴.
- ⚠️ 보안 영역 — 변경 전후로 "각 역할이 무엇을 보는가" 회귀 표를 만들어 확인.

### Phase 1 — 보드-권한 서버 이월 (A안 핵심, 형태=Edge 확정)
- [ ] **셋업(1회)**: Supabase CLI 설치·`login`·`link`·service_role 시크릿 등록. (`supabase/functions/` 디렉터리 도입)
- [ ] Edge Function `ensure-daily-page` 작성: §3.2 로직, 기존 JS 파이프라인 재사용, service_role 주입.
- [ ] **이월은 멱등 단일 연산으로 통합**(eager/lazy 구분 폐기, Q2 결정): 같은 함수가 생성 시 + 열람/리프레시 시 재호출돼도 `filterNewThreads` dedup으로 중복 0.
- [ ] 클라이언트 신규 데일리 진입점(`App.jsx`, `TipTapTestPage.jsx`, `quickTodoOps.js`)이 직접 `createDailyPageV2` 대신 Edge Function 호출.
- [ ] 멱등성: 동시/중복 호출에도 페이지·섹션·이월 row가 1회만(현 `inFlight` + DB unique 인덱스와 동일 보장).
- 효과: 누가 만들든 생성 즉시 완전한 페이지. 권한과 이월이 코드 레벨에서 분리됨(P2, P4, P5).

### Phase 2 — 정리 / 검증
- [ ] 클라이언트 `carryOverEager`/`carryOverLazy` 를 Edge 전용 호출로 일원화 — 클라 권한 이월 경로 제거(중복·부분이월 방지). 순수 함수(파이프라인 모듈)는 Edge가 재사용하므로 유지.
- [ ] "리프레시 카로버" 버튼 = 동일 Edge 연산 재호출하는 얇은 트리거로 단순화.
- [ ] (선택) 기존 'all'-under-master 2,744 블록 정합화 SQL — *사용자 판단*(이번엔 복구 안 함). 정합화 규칙은 §4 불변식.
- [ ] 회귀: 마스터/비마스터 각 시점으로 생성·열람·이월 정상 확인.

---

## 6. 코드 / 구성요소 변경 지점

- `supabase/functions/ensure-daily-page/` (신규 Edge Function) — 보드-권한 진입점.
- `src/utils/createDailyPageV2.js` — Phase 0 적용됨. Phase 1에서 호출 경로가 Edge로 이동(로직은 Edge가 재사용).
- `src/utils/carryOverPipelineV2.js` — Phase 0(매핑실패 skip) 적용됨. Phase 0 추가: visibility 상속. Phase 2: 클라 eager 격리.
- `src/utils/worklogTemplateV2.js` — 변경 없음(섹션 visibility 이미 상속). Edge에서 재사용.
- `src/components/TipTapEditor/DailyPageV2.jsx` — `:368` 빈자식 visibility 상속(Phase 0). 신규 진입점 Edge 호출(Phase 1). `prevPageId` 미배선이던 lazy 경로 정리(Phase 2).
- RLS — 변경 없음(P3: 블록 visibility가 섹션과 동기화되면 현행 `visibility='all' OR is_master()` 로 충분).

---

## 7. 향후 변경 시 점검 워크플로우 (★ 가드레일 ★)

데일리의 **생성 · 이월 · 가시성 · 섹션** 관련 코드를 만질 때 PR/커밋 전 다음을 점검한다:

1. **(P1) 가시성 상속**: 블록을 새로 만들거나 복사하는가? 그렇다면 그 블록의 visibility를 *섹션에서* 가져오는가? `'all'` 하드코딩이 어딘가에 있지 않은가?
2. **(P2) 이월의 권한**: 이월/복사 로직이 *특정 사용자의 RLS 권한* 안에서 도는가? 그렇다면 비마스터/뷰어 시점에서 데이터가 누락·고아화되지 않는가? 보드 권한으로 실행돼야 하는 것 아닌가?
3. **(P3) RLS 우회 금지**: 이 코드가 RLS를 우회하거나, RLS 때문에 동작을 분기하는가? 그렇다면 가시성을 구조에서 파생하도록 되돌릴 수 있는가?
4. **(P4) 보드 이벤트**: 페이지/섹션 생성이 "누가 먼저 열었나"에 따라 결과가 달라지는가? 그렇다면 보드-권한 경로로 통일.
5. **불변식 회귀**: §4의 두 불변식(블록 visibility=섹션, section_id=같은 페이지) 검증 쿼리가 여전히 0인가?
6. **섹션 모델이 또 바뀌면**: 섹션이 재분리/재구조화되어도 위 원칙(P1~P4)은 유지. 섹션의 "단위"가 바뀌면 `buildSectionIdMap`(매핑 기준)과 §4 불변식 쿼리만 갱신한다.

---

## 8. 미해결 질문 (의사결정 대기)

- ~~**Q1. Edge Function 도입?**~~ → **확정(2026-06-09): Edge.** 근거 §3.3/P5. 운영 표면 +1(1회 셋업) 수용.
- ~~**Q2. `carryOverLazy` 운명.**~~ → **확정(2026-06-09): eager/lazy 구분 폐기, 멱등 단일 Edge 연산으로 통합.** 생성·열람·리프레시가 같은 연산 재호출.
- ~~**Q3. 기존 2,744 'all'-under-master 정합화 시점.**~~ → **확정(2026-06-09): 한다.** 보드는 공유 구조 → 비마스터가 공유 페이지에서 master 콘텐츠를 고아로 봄(daily_blocks SELECT가 'all'을 전원 노출). 1회 백필(백업+dry-run+검증)로 P1 정합. §5 Phase에 task.
- ~~**Q4. "owner" 의미.**~~ → **확정(2026-06-09): 보드 소유(P6).** pages·daily_blocks RLS에 보드 멤버십 조건을 *additive*로 추가(기존 링크/공유 접근 보존). user_id=created_by 강등. §5 Phase에 task.

---

## 9. 위험 / 안전망

- service_role 키 노출 절대 금지(Edge 시크릿 한정). 클라 번들·로그에 유입 차단.
- Edge 이월의 멱등성 깨지면 중복 row → DB unique 인덱스(`uniq_daily_page_per_date`)와 thread dedup으로 이중 방어.
- 마이그레이션 없는 코드 변경부터(Phase 0) → 데이터 정합화(선택)는 항상 dry-run + 백업 후.
- 롤백: Phase 1 도입 후 문제 시 클라이언트가 Edge 대신 기존 `createDailyPageV2`(Phase 0 반영본)로 폴백 가능하도록 호출 지점을 한 곳으로 모은다.

---

## 10. 결정 / 변경 이력

- 2026-06-09: 초안. 노선 **A안(보드-권한 서버 이월)** 확정. Phase 0 일부(빈자식 visibility 상속, 매핑실패 skip) 선반영. 6/8 데이터는 복구하지 않고 삭제(작성자 혼재로 자동복구 부적절). 진단 SQL 4종 보존(`diagnose-daily-2026-06-08`, `-STEP1b`, `-STEP1c`, `-carry-67-to-69`).
- 2026-06-09: **형태 확정 = Edge Function**(PL/pgSQL 배제 — 진화하는 이월 로직을 경직된 SQL에 박지 않음, P5). **Q1·Q2 확정**(Edge 도입 / eager·lazy 통합). 결정 근거: 권한 경계는 안정·로직은 유연(P5), 운영 표면 +1은 일회성 비용으로 수용.
- 2026-06-09: **Q3·Q4 확정.** Q3=기존 'all'-under-master 2,744블록 1회 백필(Phase 0.5). Q4=보드 데일리는 보드 소유(**P6 신설**), RLS를 보드 멤버십 기반으로 additive 정렬(Phase 0.7). 사용자 확인: "업무일지 보드는 마스터+비마스터가 같이 쓰는 공유 구조".
- 2026-06-10: **Phase 0 코드 완료**(createDailyPageV2·DailyPageV2:368 빈자식 visibility 상속, `buildSectionVisibilityMap`+이월 visibility=대상섹션, 매핑실패 skip; 빌드 OK). **Phase 0.5 백필 완료**(LIVE daily 2,744 'all'→'master', DEAD 1,856 제외, remaining=0, 백업표 `q3_visibility_backup_20260609`). **Phase 0.7 착수** — `diagnose-board-membership.sql` 작성, 실행 대기 상태로 세션 중단.
- 2026-06-11: **Phase 1 코드 완료** (브랜치 `feature/edge-ensure-daily-page`). Edge Function `supabase/functions/ensure-daily-page` — JWT 검증 후 **service_role 로 검증된 `createDailyPageV2` 파이프라인을 그대로 재사용**(P5, 재구현 0). 인가는 "유효 JWT(로그인)"까지만 — 멤버십 강제 게이트는 멤버 row 없는 다른 보드의 생성을 깨므로 보류(현행 pages-INSERT "로그인 전원"과 동일 권한선, 회귀 0). 이월된 master 콘텐츠는 visibility='master' 상속이라 비마스터 SELECT 에 안 잡힘(누출 0). 클라: 단일 진입점 `ensureDailyPage`(Edge↔로컬 폴백, 플래그 `VITE_USE_EDGE_DAILY`) 신설 + 4개 호출지점 전환. `deno check`/`npm run build` 통과. service_role 시크릿은 런타임 자동 주입이라 수동 셋업 불필요. **남은 것: 배포(사용자 PAT) + 실기기 검증** → 런북 `PHASE1-deploy-verify.md`.
