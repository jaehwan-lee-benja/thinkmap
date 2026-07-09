# 사이트 구조 분할 계획 (SITE-SPLIT-PLAN)

> 상태: **Phase 0 완료 (2026-07-06) — feat/site-split-phase0 브랜치(미푸시).** §10 핵심 결정 확정(모노레포 + 단일레포 서브폴더 배포).
> 0-A(base 파라미터화) + 0-B(packages/core 추출 Stage 1~6: base헬퍼·supabaseClient·useAuth·공용UI·공용훅·공용유틸) 이관 완료.
> 검증: build 그린 + 170 테스트 통과 + 실앱(데일리·토글·EmojiPicker·캘린더) 클린 + deno Edge 결합 해석.
> **Phase 1 완료·배포 (2026-07-07)** — 급여 위성(apps/payroll) 라이브 github.io/thinkmap/payroll/.
> **Phase 2 완료·배포 (2026-07-09)** — 재고 위성(apps/inventory) 라이브 github.io/thinkmap/inventory/. ※roster+members→Inventory 피벗(§8).
> **Phase 3 완료·배포 (2026-07-09)** — 마케팅 캔버스 위성(apps/canvas) 라이브 github.io/thinkmap/canvas/, 옵션 B 전면 독립. daily_blocks=직접읽기 유지. 마스터 게이트 셸단.
> **Phase 4 완료 (2026-07-09, 미배포)** — 자리후 위성(apps/seat, feat/site-split-phase4). 완전 독립·page독립·워크스페이스 RLS. 프론트 분할 트랙 사실상 완료(roster는 의도적 보류).
> **DB 트랙**: payroll 워크스페이스 정책 마이그 guardian 검수 통과, 프로덕션 적용 유저 승인 대기. · 작성 2026-07-04 · 작성자 jaehwan-lee-benja
> 관계: [ARCHITECTURE.md](./ARCHITECTURE.md)의 두 plane 구조와, [ACCESS-TIERS-SPEC.md](./ACCESS-TIERS-SPEC.md)의
> 워크스페이스(테넌트) 모델을 **프론트 배포 단위로 확장**한 문서. 각 도메인 명세(PAYROLL-SPEC,
> MEMBER-SPEC, SEAT-SPEC, MARKETING-CANVAS-*)의 상위 배포 컨텍스트.
>
> **이 문서는 설계 합의서다.** 코드·스키마는 아직 바꾸지 않았다. 이 문서가 확정되면
> 여러 PC/세션이 이 기준 하나를 보고 위성을 만든다. 실제 착수는 §8 로드맵의 Phase 순서를 따른다.

---

## 0. TL;DR — 외울 것 딱 4개

```
① 형태 : 모선(Hub) 1개 + 위성(Satellite) N개.  균등 N분할 ❌
② 코어 : 모노레포 + packages/core (인증·supabaseClient·테넌트 컨텍스트) 단일 소스. 복붙 ❌
③ 연결 : (a) Supabase 1개  (b) 같은 origin = SSO 자동  (c) URL 링크. 이 3개가 전부.
④ 백본 : 위성은 처음부터 workspace 범위로 만든다. is_master() → 워크스페이스 마스터.
```

- **모선은 절대 쪼개지 않는다.** 무거운 TipTap 에디터+셸+인증이 한 곳에만 살아서 복제 비용 0.
- **위성 = 미래에 팔 수 있는 제품 단위(SKU).** 급여만, 자리배치만 떼어 다른 조직에 제공 가능.
- **"여기서 쓸지 vs 복붙 새 사이트"는 지금 안 정한다.** 위성 모델이 두 문을 다 열어둔다(§6).

---

## 1. 배경 — 왜 나누려는가

기능이 늘면서(직원 공유 페이지·업무일지·마케팅 엔진·급여·자리 관리·재고 등) 하나의 SPA가
비대해졌다. 목표는:

1. **유지보수 분리** — 급여는 이 PC에서, 자리 관리는 저 PC에서 독립적으로 작업/배포.
2. **연결은 아주 심플하게** — 사이트끼리는 얇은 마디(URL + 공유 DB)로만 이어진다.
3. **통합 관리 유지** — 데이터는 Supabase 하나에 모여 있어 하이퍼하게 연결된다.
4. **(나중) 외부 유저 수용** — 사내 도구를 넘어 다른 조직도 쓰는 관점. 좀 나중 일이지만 지금 설계에 반영.

---

## 2. 현재 구조 진단 (분할의 출발점)

| 항목 | 현황 | 분할 관점 함의 |
|---|---|---|
| 라우팅 | 라우터 없음. `App.jsx`의 `page_type` 스위치가 전부 | "페이지"는 URL이 아니라 `pages` 테이블 row. 위성엔 진짜 URL 라우팅이 새로 필요 |
| 기능 구분 | `pages.page_type` 컬럼 하나로 구분 | 위성도 같은 `pages`/도메인 테이블을 공유 DB에서 읽음 |
| DB/RLS | 전부 `auth.jwt()` / `is_master()` 기반, **origin 무관** | ✅ 여러 프론트가 DB 하나 공유해도 안전 |
| 클라이언트 | env 기반(`VITE_SUPABASE_URL/ANON_KEY`), 하드코딩 URL 없음 | ✅ 위성은 env 두 개만 복사하면 같은 DB |
| base path | `/thinkmap/`가 **5곳**에 하드코딩 (vite/manifest/sw/OAuth/알림) | ⚠️ 위성마다 base가 달라짐 → 선행 과제(§7) |
| 배포 | gh-pages 단일 브랜치, push→CI 빌드 | 위성은 각자 gh-pages(각자 레포/폴더) |
| 번들 | 1.67MB 단일 청크(대부분 TipTap), lazy 거의 없음 | 에디터 불필요한 위성은 가벼워짐 = 분할의 실이익 |

**진짜 비용은 기능 코드가 아니라 공유 코어**다: TipTap 에디터+토글 확장, 셸(App/PaneProvider/Sidebar),
7개 Context, 인증(`useAuth`+`is_master()`), `supabaseClient`. 이걸 N번 복제하지 않는 게 설계의 핵심.

---

## 3. 도메인 분리 난이도 (분석 결과)

| 도메인 | 에디터 필요 | 결합도 | 판정 |
|---|---|---|---|
| **급여 (Payroll)** | ❌ | 거의 없음 | 🟢 즉시 분리 — **가장 깨끗, 파일럿 1순위** |
| **자리후 (Seat, 주방 실시간)** | ❌ | 없음(완전 독립 서브트리) | 🟢 즉시 분리 |
| **재고 (Inventory)** | ❌ | 없음 | 🟢 즉시 분리 |
| **자리/인사 (Roster + Members)** | ❌ | 둘이 한 쌍 | 🟡 쌍으로 분리 |
| **마케팅 엔진 (Canvas)** | ❌ | `daily_blocks` **읽기** 의존 | 🟡 데이터 의존만 정리하면 분리 |
| **캘린더 + 스케줄** | ❌ | 서로 한 몸 | 🟡 쌍으로 분리 |
| **업무일지 (Worklog/Daily)** | ✅ **TipTap 에디터에 물리적으로 박힘** | 최고 | 🔴 **분리 불가 = 이게 모선 본체** |

> 업무일지는 폴더가 따로 없다. `TipTapEditor/` 안(DailyPageV2 등)에 있고 공유 에디터 페이지
> `TipTapTestPage.jsx`가 `isDailyPage()`로 직접 분기한다. 즉 **직원 공유 페이지 = 업무일지 =
> 블록 에디터**는 한 덩어리이며 이게 모선이다. 떼려 하지 말 것.

---

## 4. 추천 구조 — 모선(Hub) + 위성(Satellite)

```
        ┌─────────────────────────────────────────────┐
        │  모선(Hub) — apps/hub  (현 thinkmap 본체)     │
        │  직원 공유 페이지 · 업무일지 · 캘린더 · 목표    │
        │  = TipTap 에디터 + 셸 + 인증 코어가 사는 곳    │
        └───────┬───────────┬───────────┬─────────────┘
                │  링크(URL)  │           │
   ┌────────────▼──┐  ┌──────▼──────┐  ┌─▼──────────────┐
   │ 급여           │  │ 자리/인사     │  │ 마케팅 엔진      │
   │ apps/payroll   │  │ apps/roster  │  │ apps/canvas     │
   │ (에디터 불필요) │  │ (roster+     │  │ (daily_blocks   │
   │                │  │  members)    │  │  읽기 의존 정리) │
   └────────┬───────┘  └──────┬──────┘  └────────┬────────┘
            │  packages/core (인증·client·테넌트 컨텍스트·Common UI)
            └─────────────────┴──────────────────┘
                              │
                   ┌──────────▼──────────┐
                   │  Supabase 1개 프로젝트 │  ← 통합 관리 지점
                   │  auth · app_users ·   │
                   │  workspaces · 도메인   │
                   └──────────────────────┘
```

- **모선**: 현 앱 본체. 무거운 코어가 여기 한 곳만 산다 → 복제 비용 0. 위성 런처(타일)를 호스팅.
- **위성**: 에디터가 필요 없는 관리자/업무 도구. `packages/core`만 얹어 가볍다. 각자 독립 빌드·배포.
- **core**: 위성이 공통으로 쓰는 얇은 층. **TipTap은 포함 안 함**(모선 전용).

### 4.1 레포 전략 — 모노레포 + core 패키지, 필요 시 분가

- 지금: **모노레포(npm workspaces)**. `apps/hub`, `apps/payroll`, `apps/roster`, `packages/core`.
- 이유: 외부 유저가 들어오면 **인증/테넌트 격리 코드가 복붙되면 보안 부채**(버그 수정이 N곳 누락 위험).
  core를 단일 소스로 두면 보안 민감면이 작고 원자적으로 고쳐진다.
- worktree-per-session 관행과 정합: 세션/PC마다 다른 `apps/*` 폴더(또는 worktree)에서 작업, 통합 세션이 머지.
- **졸업 경로**: 특정 위성이 진짜 독립 제품이 되면 그때 별도 레포로 분가하고 core는 published 패키지로
  계속 import. "지금 별도 레포"보다 "필요할 때 분가"가 더 싸고 되돌리기 쉽다.

> 대안(참고): 개별 레포 + 공유 core 패키지 = 물리적 분리 감각은 좋으나 core 배포 셋업 선비용.
> 개별 레포 + core 복붙 = 시작은 빠르나 인증 드리프트 리스크 → 외부 유저 관점에서 탈락.

---

## 5. 연결 마디 — "아주 심플한" 3중 연결

1. **데이터 (Supabase 1개)**
   - `auth.users` / `app_users` / `is_master()`(→ workspace 마스터) 자동 공통.
   - 위성은 자기 도메인 테이블만 건드림. 도메인 테이블끼리 서로 참조하지 않음 → 격리 안전.
   - 공유 스파인: `pages` / `blocks` / `projects` / `shares` / `linked_accounts` / `user_preferences`.

2. **세션 (SSO 자동)**
   - GitHub Pages는 전부 `jaehwan-lee-benja.github.io` **동일 origin** → localStorage 세션 자동 공유.
   - 한 번 로그인하면 모든 위성에서 로그인 유지. 별도 SSO 구현 불필요.
   - ⚠️ 나중에 커스텀 도메인/서브도메인으로 가면 이 공짜 SSO가 깨짐 → 그때 쿠키 도메인 공유 설계 필요.

3. **UI (URL 링크 + 런처)**
   - 모선에 위성 런처(타일 몇 개), 위성엔 "모선으로" 링크. 그냥 `<a href>`.
   - 모듈 페더레이션·공유 런타임 전혀 불필요.
   - 위성 목록은 정적 config(또는 `page_type_access` 유사 레지스트리 테이블)로 관리 → 역할별 노출.

---

## 6. 멀티테넌시 백본 — "여기서 쓸지 vs 복붙 새 사이트"를 지금 안 정해도 되는 이유

멀티테넌시는 **레포 구조가 아니라 데이터/인증 문제**다. 그리고 골격은 이미 있다:
[ACCESS-TIERS-SPEC.md](./ACCESS-TIERS-SPEC.md)의 `workspaces` / `can_in_workspace()` / `current_workspace()`
(현재 Phase A, 실제 전환은 Phase C).

**진짜 백본 작업 = `is_master()`(사내 "사장님" 단일 개념) → 워크스페이스 단위 마스터로 전환.**
이걸 해두면 "다른 유저/회사"는 그냥 새 워크스페이스 발급이 된다.

성숙한 기능을 어떻게 제공할지의 판단 규칙(지금 결정 X, 아래 기준만 확정):

| 성숙한 기능이... | 선택 | 방법 |
|---|---|---|
| ThinkMap 워크스페이스/데이터에 **묶여있다** | 같은 제품 안에서 제공 | 그 위성을 workspace 범위로 오픈. 다른 유저 = 워크스페이스 발급 |
| **범용·독립적**이다 (ThinkMap 없이도 성립) | 별도 제품으로 졸업 | 그 위성을 자기 레포/배포로 분가. core는 그대로 재사용 |

위성 모델의 최대 미덕이 **두 문을 다 열어두는 것**이다. 그래서 "복붙 새 사이트"는 무서운 fork가 아니라
core 위에 얹는 얇은 앱 하나가 된다.

---

## 7. 선행 과제 (분할 전 반드시)

1. **`/thinkmap/` 하드코딩 파라미터화** — 5곳(vite base, manifest start_url/scope, sw 등록,
   `useAuth.js` OAuth redirect, 알림 아이콘)을 `import.meta.env.BASE_URL` 기반으로 통일.
   안 하면 위성에서 SW/OAuth/PWA가 깨진다.
2. **Supabase Auth Redirect URL 허용목록**에 각 위성 origin/경로 추가.
3. **`packages/core` 경계 확정** — 무엇이 core이고 무엇이 앱 전용인지 목록화(§9).
4. **워크스페이스 컨텍스트** — core에 `current_workspace()` 기반 테넌트 컨텍스트 자리 마련
   (Phase C 전환의 프론트 훅). 위성은 처음부터 이걸 통해 데이터를 범위 조회.
5. **Edge Function 커플링 주의** — `supabase/functions/ensure-daily-page`가 `src/utils/*`를
   상대경로로 import. daily/worklog는 모선에 남으므로 이 함수도 모선과 함께 둔다.

---

## 8. 단계별 로드맵

- **Phase 0 — ✅ 완료(2026-07-06).** 문서 확정 + `/thinkmap/` 파라미터화(0-A) + `packages/core` 추출(0-B Stage 1~6).
  core 현 인벤토리: `basePath(BASE_URL/withBase)` · `supabaseClient` · `useAuth` · 공용 UI(Modal군/DeleteToast/EmojiPicker) ·
  공용 훅(useIsMobile/useClickOutside/useConfirmAction/useUserPreferences) · 공용 유틸(dateUtils/uuid/supabaseError).
  hub 는 저위험 순서로 루트 유지(apps/hub 승격은 Phase 1 시 판단). TipTap·셸·문서 Context 는 hub 전용 유지(§9 준수).
- **Phase 1 — ✅ 급여 파일럿 완료(2026-07-07, feat/site-split-phase1).** apps/payroll 위성 신설.
  검증된 뼈대(이후 위성이 복제할 템플릿): 워크스페이스 앱 구조 · 독립 빌드 · 자기 base(`/thinkmap/payroll/`) ·
  `envDir=../../` 로 공유 Supabase · 동일 origin SSO · 모선 런처 링크(`?page=`) + "← 모선" 백링크 ·
  @thinkmap/core 재사용(useAuth/supabase) · 마스터 게이트 · 급여 도메인 코드 hub→위성 이동.
  실이익 실측: 위성 번들 387KB(모선 1.65MB의 ~1/4, TipTap 부재). 워크스페이스 범위 조회는 Phase C(병행 트랙)와 함께.
- **Phase 2 — ✅ 재고(Inventory) 위성 완료(2026-07-07).** apps/inventory 신설(미배포).
  ⚠️ **원래 계획(roster+members)에서 피벗**: 코드 재조사 결과 자리/인사가 SPEC 전제와 달리 모선에 결합됨 —
  **roster(배치도)는 `TipTapTestPage`의 RosterCard 로 데일리 에디터에 박혀 있어 모선 잔류**(worklog 원칙),
  member 도메인(useMembers/membersPage/rosterPresets)은 모선 roster 와 공유 → MembersPage 만 떼도 공유 3모듈
  승격 + hub ~10곳 갱신 = 고비용·저이익. 반면 **Inventory 는 외부결합 0(완전 독립)** 이라 payroll 보다 깨끗한
  둘째 파일럿으로 채택. 셸 최소(마스터게이트·pageId 불필요), 번들 380KB.
  → roster/members 위성화는 보류(member 도메인을 공유 패키지로 뽑는 별도 설계 필요 시 재개).
- **Phase 3 — ✅ 마케팅 캔버스 (canvas) 완료(2026-07-09).** apps/canvas 신설. **옵션 B(전면 독립)** 채택:
  생성·목록·매핑 전부 위성(모선은 canvas 코드 완전 제거, frame/engine fetch·트리노출 안 함). frame⇄engine 페어 = 한 앱, 진입 `?page=`.
  `daily_blocks` 의존은 **공유 테이블 직접 읽기 유지**로 결정(useUserDailyBlocks 위성 이동; 자체 테이블+RLS라 뷰격리 불필요).
  마스터 게이트 = payroll 패턴대로 셸 단(`if (!isMaster)`) 적용. base `/thinkmap/canvas/`.
- **Phase 4 — ✅ 자리후(seat) 위성 완료(2026-07-09, 미배포).** apps/seat 신설. 완전 독립 서브트리(587줄, TipTap 무의존,
  seat_orders/seat_station_status = 워크스페이스 스코프·page 독립·Realtime). 셸=로그인만(마스터 전용 아님, 테넌시는 RLS).
  모선: App.jsx seat 분기 삭제 + pageTypes INDEPENDENT에서 SEAT 제거(seat 페이지 fetch 안 함) + 사이드바 런처 링크.
- **모선**: pages/worklog/calendar/goals/dashboard/editor **+ roster(배치도, 에디터 결합)** 유지. **업무일지 분리 시도 금지.**
- **병행 트랙 (DB)**: `is_master()` → 워크스페이스 전환(ACCESS-TIERS Phase C). ✅ payroll 파일럿 정책
  `payroll_sheets_ws_owner_v2`(can_in_workspace owner 병행) 작성·guardian 검수 통과 — 프로덕션 적용은 유저 승인 대기.
  위성은 처음부터 테넌트-aware하게 태어난다.

---

## 9. `packages/core` 경계 (초안 — Phase 0에서 확정)

**core에 들어감 (위성 공통):**
- `supabaseClient` (env 기반)
- `useAuth` + 인증 게이트 + `is_master()`/워크스페이스 컨텍스트 헬퍼
- Common UI: `Modal`, `Toast`, `DeleteToast`, `EmojiPicker`
- 공유 훅: `useIsMobile`, `useClickOutside`, `useConfirmAction`, `useUserPreferences` 등
- 공유 유틸: `dateUtils`, `uuid`, `supabaseError`, base-path 헬퍼

**core에 안 들어감 (모선 전용):**
- TipTap 에디터 코어 + 토글 확장 + 관련 유틸 (1.67MB의 주범)
- 셸: `App` / `PaneProvider` / `Sidebar` / `TabBar` / `GlobalTopBar`
- Page/Project/Sharing/Backup Context (문서 plane 전용)

**앱 전용 (각 위성 폴더):**
- 도메인 컴포넌트 + 도메인 훅 (예: `usePayrollSheet` + `PayrollPage` → apps/payroll)

---

## 10. 미해결·결정 대기 항목

- [x] **레포 전략 최종: 모노레포** (npm workspaces, `packages/core` + `apps/*` 위성) — 확정 2026-07-05.
  근거: 인증/테넌트 코드 단일 소스(드리프트 원천 차단)·원자적 커밋(정합성 창 없음)·되돌리기 저비용. §4.1.
  ↳ **실행 결정(저위험 순서)**: hub 는 당장 **루트 그대로** 두고 `packages/core` 만 먼저 추출한다.
    `src/` 전체를 `apps/hub/` 로 옮기는 대이동은 Edge Function 상대 import·`gh-pages -d dist` 배포·빌드 툴링을
    동시에 흔드는 최고위험 단계라 보류. `apps/hub` 승격은 위성(급여) 착수 시 필요하면 그때(졸업 원칙). 위성은 처음부터 `apps/*`.
- [x] **배포 토폴로지: 단일 레포 gh-pages 하위폴더** — 확정 2026-07-05, Phase 1 실증 2026-07-07.
  repo `thinkmap` 하나. 모선=gh-pages 루트→`github.io/thinkmap/`, 위성=gh-pages 하위폴더→`github.io/thinkmap/payroll/`
  (base `/thinkmap/payroll/`, `gh-pages -d dist -e payroll --add` 로 모선 안 건드리고 하위폴더만 갱신).
  동일 origin(github.io) = SSO를 **구조로** 보장. 새 repo 불필요. 커스텀 도메인 분기 전까지 무료 SSO 유지.
  ※ 위성별 별도 repo(`github.io/thinkmap-payroll/`)는 "졸업" 시 선택지(§4.1), 지금은 단일 repo 하위폴더.
  ⚠️ **배포 방법 = 위성별 `-e <sub> --add`. "단일 dist 조립 후 `gh-pages -d dist`"는 쓰지 마라.** (Phase 2·3·4 실증. 상세=기억 ghpages_satellite_deploy_gotcha)
    조립-방식은 gh-pages 최종 커밋에서 하위폴더를 통째로 누락시킨다. ★★**핵심: `--add` 배포들 사이에 `node_modules/.cache/gh-pages`를 비우지 마라** — 비우면 fresh clone이라 직전 push 하위폴더가 드롭됨(Phase 4 실증). 캐시 유지=로컬 작업본에 누적. 절차:
    ① 모선 clean 빌드: `rm -rf dist && npm run build` (dist에 위성 폴더 cp 금지)
    ② **캐시 1회만** clear: `rm -rf node_modules/.cache/gh-pages`
    ③ 모선 루트: `gh-pages -d dist --dotfiles` (루트 wipe+publish — `-d dist --add`도 하위폴더 보존 못 하니 뒤에서 전 위성 재add)
    ④ 위성들 **캐시 clear 없이** 순차: `gh-pages -d apps/payroll/dist -e payroll --add --dotfiles` → inventory → canvas → seat (캐시 누적=합집합)
    ⑤ 매 단계 후 `git fetch origin gh-pages --force && git ls-tree origin/gh-pages --name-only` 로 하위폴더 실재 확인.
    GitHub Pages 레거시 빌드는 배포당 "errored→built" 1~2사이클(수분) 지연 + 여러 push 시 빌드 큐가 쌓여 중간 빌드가 먼저 서빙됨(일부만 200) → 최종 빌드 대기. 라이브 404는 CDN 탓 전에 브랜치 트리부터 확인.
- [x] **위성 런처 레지스트리: DB 테이블** — `site_nodes`(백오피스 라이브) 재사용으로 사실상 확정. 정적 config 아님.
- [ ] `current_workspace()` 프론트 컨텍스트 API 형태 (ACCESS-TIERS Phase C와 조율) — Phase 1 급여 착수 시 확정.
- [x] 마케팅 캔버스의 `daily_blocks` 의존: **공유 테이블 직접 읽기 유지**로 결정(2026-07-09, Phase 3). 뷰/API 격리는 과설계 — daily_blocks는 thinkmap 자체 테이블+RLS 스코프, useUserDailyBlocks(RegionPanel 전용) 위성 이동으로 해소.

---

> 다음 스텝: 이 문서 §10을 합의 → Phase 0(파라미터화 + core 추출) → Phase 1 급여 파일럿.
