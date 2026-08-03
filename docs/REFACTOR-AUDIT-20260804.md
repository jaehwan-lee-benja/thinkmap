# thinkmap 리팩토링 조사 — 중간보고 (2026-08-04)

> 유저 발주: *"위성사이트 구조화 · 로그인해서 다른 곳으로 절대 튕기는 현상 없이 · tm과 멀티스토어 분리 ·
> 과설계 · 디자인 통합 · 죽어있는 요소 클리어"* + 추가 지시 *"재사용 가능한 층위들은 통일되는지"*
>
> 조사 = 자율 / **삭제·구조변경·DDL = 승인 게이트**. 이 문서는 **발견**이고 **조치가 아니다.**

## 읽는 법 — 확신도 표기

| 표기 | 뜻 |
|---|---|
| **확정** | 실측했고 대조군·교차기전으로 검산했다 |
| **추정** | 한 기전으로만 쟀다. 반증 가능 |
| **미측정** | 안 쟀다. **"없음"과 다르다** |

★**미측정을 "없음"으로 읽지 마라.** 특히 로그인 튕김은 유저 관찰이 근거이므로,
재현 실패는 **"결함 없음"이 아니라 "내가 못 재현했다"**를 뜻한다.

---

## 0. 이 조사의 신뢰도에 대해 (먼저 밝힌다)

조사 당일 통합세션의 **측정 술어가 6번 틀렸다.** 전부 macOS/BSD 도구 차이와 따옴표·공백 변형 때문이다:

| # | 틀린 술어 | 낼 뻔한 결론 |
|---|---|---|
| 1 | 정책명 `"따옴표"` 있는 것만 grep | "정책 0건"(실제 7건) |
| 2 | `orientation:portrait`(공백 없음) | "세로 CSS 누락" |
| 3 | 번들에서 **함수명** 검색 | "기능 누락"(미니파이로 함수명 소실 — 문자열 리터럴만 남는다) |
| 4 | `base:\s*'...'`(홑따옴표만) | ★**"전 위성이 로그인 시 루트로 튕긴다"**(거짓 근본원인) |
| 5 | `grep "\bword\b"` | BSD grep 은 `\b` 미지원 → 전부 0 |
| 6 | `sed 's/…\?$//'` | BSD sed 는 `\?` 미지원 → ★**"core 전체가 죽은 코드"** |

⇒ ★**#4·#6 은 그대로 갔으면 위험했다** — 하나는 유저 최우선 결함에 대한 거짓 원인, 하나는 살아있는 공유 코드를 지우자는 권고였다.
⇒ 그래서 **모든 조사 워커에 이 표를 먼저 주입**했고, 이 문서의 모든 수치에 **측정법을 병기**한다.
⇒ 규율로 고정: ***소스 grep 결과는 배포 산출물·카탈로그와 교차하기 전엔 판정으로 쓰지 않는다.***

---

## 1. 확정된 발견 — `site_nodes` 레지스트리가 실물과 어긋난다

정본 `docs/SITE-SPLIT-PLAN.md` 는 이 테이블을 **위성 진입의 단일 소스**로 삼는다. 그런데:

| 항목 | 레지스트리 | 실물 | 판정 |
|---|---|---|---|
| **URL** | 9행 중 **6행이 빈값**(payroll·members·canvas·dashboard·seat·inventory) | 7위성 전부 **HTTP 200** | 🟠 **백오피스 관리화면에서 링크가 안 나간다**(아래 ★정정) |
| `inventory` status | `dev` | 라이브 200 | 드리프트 |
| `dashboard` kind | `satellite` | `apps/dashboard` **없음**(모선 page_type) | 분류 오류 |
| `canvas` domain | `engine` | 디렉토리·URL 은 `canvas` | 이름 불일치 |

- **측정법**: `select … from site_nodes` / `ls apps/` / 위성 7개 HTTP 실측
- **조치 성격**: DDL 아님, **데이터 정정(UPDATE 5행)** ⇒ 위험 낮음. 단 승인 게이트.
  작성된 SQL = **`migrate-fix-site-nodes-registry.sql`**(★미적용). `GET DIAGNOSTICS` 로 영향행수 ≠1 이면 `RAISE EXCEPTION`(부분적용 방지).

### 🔻★**정정 — 내 심각도 표기가 과장이었다** (`s2-nodes` 가 잡음)
나는 이걸 *"🔴 런처가 이 값을 쓰면 링크가 안 나간다"* 로 적었다. **틀렸다.**
```
프로덕션 사이드바 런처 = src/config/satellites.jsx  ← URL 이 «하드코딩» (site_nodes 안 읽음)
site_nodes 를 읽는 곳   = siteNodesSeed.js · BackofficePage.jsx · useSiteNodes.js  ← 전부 백오피스
```
⇒ **영향 범위는 「백오피스 사이트 구조도 관리화면」**이지 직원이 매일 쓰는 사이드바가 아니다. **심각도 🔴 → 🟠 하향.**
▸ url 빈값의 실제 효과는 확정됐다(`BackofficePage.jsx:126-127,151-154` — `<a>` 대신 텍스트, 타일은 `href=undefined`+`preventDefault`).
▸ ★**내가 「읽는 쪽」을 확인하지 않고 「값이 비었다」에서 영향을 추론했다.** 오늘 12번의 술어 실패와 같은 형태 —
  ***데이터의 결함은 그 데이터를 「누가 읽는가」를 확인해야 심각도가 정해진다.***
▸ 부수: `satellites.jsx` 에 **payroll·membership 이 없다**(payroll 은 page-scoped 라 Sidebar 별도 블록, membership 은 §6-a 미등록 건).

---

## 2. 재사용 층위 통일 실태 (유저 신규 지시 축)

*(워커 `rf-layers` 산출 대기 — 아래는 통합세션 선실측분)*

| 층 | 판정 | 근거 | 확신도 |
|---|---|---|---|
| 인증/세션 | **ⓐ단일 소스** | `core/useAuth.js` 1개. 위성 자체 사본 **0**(`find apps/*/src -name 'useAuth*'` = 공집합) | 확정 |
| Supabase 클라이언트 | **ⓐ단일 소스** | 위성 내 `createClient` 호출 **0건** | 확정 |
| 디자인 토큰 | **ⓐ단일 소스** | `variables.css` 파일 1개·고유 해시 1 | 확정 |
| base 경로 | **ⓐ통일(패턴)** | 7/7 `base: process.env.APP_BASE \|\| '/thinkmap/<이름>/'` | 확정 |
| 공통 UI | ⓐ부분 | core 에 Modal·DeleteToast·EmojiPicker·ThemeToggle + 훅 6 · 유틸 7 | 추정 |
| **빌드 설정** | **ⓑ복붙 7벌** | `vite.config.js` **고유 해시 7/7 전부 다름**(10~46줄) | 확정 |
| **배포 스크립트** | **ⓒ문서와 불일치** | `package.json` = `gh-pages -d dist` 뿐 / 실제 = **수동 worktree 델타 push**(CLI 는 HTTP 400 실패) | 확정 |
| 라우팅 · 에러/로딩 UI | **미측정** | 워커 산출 대기 | — |

⇒ 유저 질문의 답(현재까지): **인증·DB·토큰·base 는 통일 ✓ / 빌드·배포 층은 미통일 ✗.**

---

## 3. 로그인 튕김 — ★**원인 확정: Supabase `site_url` 오설정** (코드가 아니었다)

**유저 증언**: *"게임 로그인 시점이나, 게임을 하다가 갑자기 **작전판 같은 곳으로 간 적**이 있었지."*

지휘부 Management API 실측:
```
thinkmap  (sqisntxippjzcekyhqyo)  site_url = http://localhost:5173/thinkmap/     ← 위성이 «로컬»로 튕긴다
multi-store(rstazttwlghsorpzsugy) site_url = https://…github.io/warroom-chat/    ← 게임 손님이 «내부 채팅앱»으로
```
**기전**: Supabase 는 `redirect_to` 가 **비었거나·허용목록 밖이거나·무효**면 **`site_url` 로 폴백**한다.

- ★**내 «위성 base 7/7 정상» 측정은 맞았다. 축이 코드가 아니라 «프로젝트 설정」이었다.**
  ⇒ ***파일↔라이브 2자 감사로는 원리적으로 안 보인다*** — 설정은 repo 밖에 있다.
  ⇒ 이건 crm 이 알려준 «크로스도메인 의존은 스캔의 사각」과 **같은 형태**이고, 이번엔 **자기 프로젝트 설정**이 사각이었다.
- **확신도**: 기전 확정(설정값 실측). 단 **폴백 발동 조건**(어느 호출이 `redirectTo` 를 빠뜨리는가)은 `rf-auth` 조사 중.
- ⚠**적용은 유저 승인 대기.** 준비된 조치:
  ```
  scripts/sb-auth.sh sqisntxippjzcekyhqyo set-site https://jaehwan-lee-benja.github.io/thinkmap/
  ```
  ★**검증은 쌍으로**: ⑴튕김 재현 안 됨 ∧ ⑵**모선+위성 2곳 이상에서 실제 로그인 1회 성공**
  (바꿔서 로그인이 아예 막히면 더 나쁘다). 허용목록의 죽은 로컬/사설 IP 정리는 **별건**.
- ★**주의**: `site_url` 만 바꿔도 **허용목록에 우리 redirectTo 값들이 없으면 폴백은 계속 걸린다.**
  조치 후 재측정에서 그게 갈린다.

### 3-a. ★**결론 정정 — thinkmap 축은 «코드·설정 모두 깨끗»하다** (조사 종결)

`rf-auth` 전수 + 내 설정 실측을 합치면 판정이 바뀐다:

| 확인 | 결과 |
|---|---|
| `signInWithOAuth` 호출부 | **repo 전체에 1곳**(`useAuth.js:113`). 모선+위성7 전부 이 함수 재사용, 자기 사본 0 |
| `redirectTo` 누락 경로 | **0건** — 항상 `currentOrigin + BASE_URL` 로 채워짐 |
| `APP_BASE` 주입처 | **없음**(CI·스크립트 0건) ⇒ 항상 하드코딩 기본값 = **결정적·예측가능** |
| `emailRedirectTo`·OTP·매직링크 | **0건** — 그 경로 자체가 없다 |
| 자동 mid-session 재인증 | **0건** — `onAuthStateChange` 는 이벤트를 `_event` 로 버리고 **어디로도 이동 안 시킴**. 토큰 갱신은 `/token?grant_type=refresh_token` 이라 **redirect 축과 무관** |
| ★**허용목록 커버리지** | `https://…github.io/thinkmap/**` **와일드카드 실재** ⇒ **8개 redirectTo 전부 커버** |

⇒ ★**`rf-auth` 의 유력 가설("crmboard·membership·payroll 3곳 미등록")은 반증됐다** — 와일드카드가 덮는다.
⇒ ⇒ ***thinkmap 에서는 폴백이 발동할 코드 경로도, 설정 구멍도 없다.***

**그럼 유저는 무엇을 겪었나 — 남은 후보 2개(둘 다 thinkmap 밖이거나 의도된 동작)**
1. ★**게임(multi-store) 축**: 그쪽 `site_url` 이 `…/warroom-chat/`(내부 채팅앱). **유저 증언의 "작전판 같은 곳"과 정확히 일치.**
   ⇒ **이게 진짜다.** `game` 소유라 내가 안 건드림 — **고객 접점이라 우선순위 최상**, 라우팅 요청함.
2. `membership` 의 **의도된 인가 게이트**: `MembershipApp.jsx:22-30` 이 `is_master`/`is_store` 둘 다 false 면 **`signOut()`**.
   버그 아님. 단 *"로그인했는데 바로 튕겨나갔다"* 로 **체감은 동일** ⇒ 혼동 가능. 문구 개선 후보.

⇒ **내 `site_url` 수정은 여전히 옳다**(죽은 localhost 가 폴백 착지점이었다). 다만 **그게 유저가 겪은 증상의 원인은 아니었다** — 이 구분을 덮지 않는다.

### 3-b. (이전 기록) 코드 축 조사 — 미재현

- 가장 유력한 기전을 지목해 실측: `packages/core/src/useAuth.js:111` `redirectUrl = currentOrigin + BASE_URL`
- 위성별 `base` **7/7 정상**, 배포 번들에도 `"/thinkmap/seat/"` 등 정상 박힘 ⇒ **이 경로에서는 재현 안 됨**
- **아직 안 돈 축**: 세션 만료 · 모선↔위성 이동 · **같은 origin 의 localStorage 세션 공유** · OAuth 콜백 착지 후 자체 라우팅 · 기기별 분기
- **확신도**: 미재현(= 미측정 축이 남아 있음)

> ★**유저에게 부탁**: **어느 화면에서 어디로 튕겼는지 1~2건**만 주면 모집단이 크게 좁아진다.
> 지금은 (진입경로 × 로그인상태 × 기기) 전수를 돌아야 해서 비싸다.

---

## 4. 죽은 요소 (`rf-dead` 산출 · 확정)

**측정법**: import 그래프 BFS(정적·동적 import·CSS `@import`·`@thinkmap/core` 별칭 해석), 진입점 8개.
286파일 중 279 도달, **미해결 경로 0건**(= 경로 해석 실패로 인한 오탐 없음). 대조군 2건 통과.

### 4-a. 미참조 파일 **7건 — 전부 모선 `src/`** (위성·core 는 **0건**)
| 파일 | 성격 | 확신도 |
|---|---|---|
| `src/components/Common/Toast.jsx` | App 은 core 의 `DeleteToast` 사용 중 | 확정 |
| `src/components/Navigation/Header.jsx` | `SidebarHeader.jsx` 와 별개 파일 | 확정 |
| `src/contexts/UIContext.jsx` | ★위 Header 와 **짝** — 유일 소비처가 Header 자신, 같은 커밋에서 함께 고립 | 확정 |
| `src/components/TipTapEditor/utils/migrateContent.js` | | 확정 |
| `src/hooks/useRosterWeekdayDefault.js` | 후속 `useRosterWeekdayPreset.js` 주석이 **의도적 대체**라 명시 | 확정 |
| `src/hooks/useSwipeGesture.js` | | 확정 |
| `src/utils/toggleNodeFactory.js` | `blockId.js:7` 주석이 **"v1 코드(레거시)"** 로 지칭 | 확정 |
▸ 7건 전부 `tests/` 참조 0건. **위험도 낮음**(전부 리팩토링 잔재). ★단 삭제는 승인 사항.
▸ ★**주목**: 죽은 코드가 **위성·공유 패키지엔 0건이고 모선에만 있다.** 위성 분리 작업이 오히려 위성 쪽을 깨끗하게 유지했다는 뜻.

### 4-b. 도달불가 라우트 — **확정 0건**
`PAGE_TYPES` 14종 전수. 위성 4종(inventory·seat·members·crmboard)은 hub JS 참조가 0이지만
`src/config/satellites.jsx` 런처로 도달 ⇒ **설계 의도**(`pageTypes.js:29,39` 주석 명시).
- ★`frame`·`engine` = hub 코드 미참조라 워커가 **미측정**으로 남겼다 → **내가 DB로 닫았다**:
  `pages` 실측 **각 1행·살아있음·최종수정 2026-05-10**(3개월 정체). ⇒ **죽은 enum 아님**(데이터 실재).
  canvas 위성 소관이며 **정체 상태**라는 게 정확한 서술이다.

### 4-d. 죽은 CSS — **103건**(워커 자기교정 2회 후 확정)

| | 수 |
|---|---|
| 스캔 `.css` 파일 | 48 · **미참조 파일 0** |
| 후보(최종 술어) | 130 |
| **─ 서드파티 런타임 주입(실제 live)** | **27** |
| **= 진짜 죽음 후보** | **103** |

★**워커가 자기 술어를 두 번 잡았고, 두 오류의 «방향이 반대»였다** — 이게 이번 조사에서 가장 값진 기록이다:
| 차수 | 실패 기전 | 방향 |
|---|---|---|
| pass1 | **경계문자 소비 버그** — `class="seat-cell seat-cell-no"` 에서 첫 매치가 공백까지 먹어 다음 토큰이 영영 매치 실패(BSD `\b` 부재 우회의 부작용) | **과소보고**(살아있는 걸 죽었다고) → DEAD 314 |
| pass4 | **퇴화 접두사** — 접두사 목록에 `r`·`h`·`m` 이 섞임(출처가 className 이 아니라 **React key** `` `r${id}` ``) → 거의 모든 클래스를 "합성됨=살아있음"으로 흡수 | **과다흡수**(죽은 걸 살았다고) → DEAD 89 |
| **pass6** | 접두사 ≥4자·하이픈 포함 필터 + **대조군 5건 전수 통과** | 확정 → **DEAD 130** |
⇒ ***같은 술어가 두 번 틀렸는데 방향이 반대였다.*** 대조군이 없었으면 **어느 쪽이든 조용히 통과**했다.

★**⒜∧⒝ 이중기전 규율이 실제로 값을 냈다**(두 사각이 정확히 반대):
- **⒜규칙순회 단독의 사각 = 팬텀**: `.hljs-*`(lowlight) · `.ProseMirror-*` · `.is-editor-empty` · `.lucide-star` 등 **27건**이 소스 grep 0회지만 **라이브러리가 런타임 주입**. 규칙만 봤으면 **전부 삭제 목록에 올랐다.**
- **⒝타깃증거 단독의 사각 = 템플릿 합성**: `` `seat-cell-${c.cell}` `` 류 **51건**. `seatSettings.js:8` 주석이 *"key 는 `.seat-cell-<key>` 와 1:1"* 로 **계약을 명시**해 뒀다.

**진짜 죽음 103건의 성격** — 대부분 **리팩터 잔해의 «덩어리»**다(이름이 갈라진 지점이 리팩터 경계):
- `Roster.css` 구 배치판 14 + 그 자식 `.st-*` 6(부모가 죽어 **동반 사망**)
- `Sidebar.css` 개별버튼→"더보기 메뉴" 전환 잔해 11 · `TipTapPage.css` 하위페이지 카드 5 등

**★삭제 전 확인이 필요한 것(워커가 위험도를 갈랐다)**:
- 🔴**높음**: `.fold-*` 6 · `.toggle-marker`/`.block-dragging` — **TOGGLE-BLOCK-SPEC 관할**이고 `.block-dragging` 은 **드래그 라이브러리 주입 가능성**이 남아 확신도 **추정**
- 🟠**중간**: `.mk-*`(membership 소유) · `.seat-*`(SEAT-SPEC 관할) · `.mobile-*`(MOBILE_OPTIMIZATION_PLAN 존재) · `.worklog-comment-*`(`create-worklog-comments-table.sql` 실재 = 계획 있음)
- ★**삭제하면 안 되는 것**: 서드파티 27 + **`.sr-only`**(접근성 유틸 — *"지우지 말고 쓰는 쪽이 맞다"*)

**미측정(정직 표기)**: 태그·속성·`:is()` 셀렉터 · 앱 간 클래스 누수

### 4-d-2. 🔻★**SPEC 대조 결과 — 내 「보류」 프레이밍이 «양방향으로» 틀렸다** (`s2-css`)

나는 위험도를 갈라 *"SQL·SPEC 이 있으니 계획 실재 ⇒ 보류"* 로 분류했다. **세 군데서 전부 틀렸다.**

| 내 분류 | 실제 | 기전 |
|---|---|---|
| `.worklog-comment-*` 3건 **보류**("SQL 있음=계획 있음") | ★**10개가 라이브**(`WorklogComments.jsx:122` 등 실사용). 진짜 죽은 건 **`.worklog-comment-list` 1개**(단수형 = 오타성 네이밍 드리프트, 라이브는 복수형 `worklog-comments`) | ***SQL 이 있는 이유는 「계획」이 아니라 「이미 만들어 돌고 있어서」였다.*** 살아있는 걸 죽었다고 분류할 뻔했다 |
| `.mk-signup-*` **보류**(SPEC 에 2단 가입폼 문서화) | **삭제안전** — SPEC 문구(`:65,116`)는 `73a560b`(07-25) 기록인데 실제 폼은 **하루 뒤** `8a223ca`(07-26 "UX 대개편")로 단일컬럼 `.mk-form` 으로 갈아엎힘 | ★**SPEC 시제 오독** — 그건 「계획」이 아니라 **갱신 안 된 낡은 서술**(§6-b 드리프트) |
| `.fold-*` 🔴**"TOGGLE-BLOCK-SPEC 관할"** | **삭제안전** — `TOGGLE-BLOCK-SPEC.md` 에 **"fold" 언급 0건**. 현행은 `FoldableTable.js` 가 **다른 이름**(`table-fold-bar`·`col-folded`)으로 재구현 | ★**귀속 오류** — 내가 관할을 잘못 지목했다 |

⇒ ***"문서에 있으니 계획이다"는 술어가 세 번 다 틀렸다.*** 문서는 **시제를 안 적는다** — 계획인지 과거 서술인지 구별하려면 **git 시계열 대조**가 필요하다.

**★`.block-dragging` — 추정 → 확정(삭제안전)**: 라이브러리(`tiptap-extension-global-drag-handle`)는 `node_modules` 에 있으나
**repo 어디서도 import 0건**(node_modules 제외 grep). `classList.add('block-dragging')` 도 0건. CSS 주석이 자백 —
*"이전에 시도한 pointer-events 접근은 폐기"*. ⇒ **주입 가능성 기각.**

**최종 수치**: **삭제안전 확정 50건**(🔴10 + mk 17 + seat-raised 4 + seat-grid 3 + mobile 5 + worklog-comment-list 1)
· **판정 정정 14건**(죽은 줄 알았는데 **템플릿 합성으로 살아있음**: `mk-role-customer`·`mk-role-ticket`·`seat-col-resizer(+2)` · worklog-comment 10종)

### 4-c. 죽은 export (과설계 조사에서 파생)
`ROSTER_COUNTED_STATUSES` · `resolveTheme`/`applyTheme` · `TODO_LIST_COLUMNS` — core `index.js` 가 수출하나
`src`/`apps` 소비 **0건**(내부 호출만). **미참조 «파일»이 아니라 «수출»** ⇒ 별 갈래로 기장.

## 4-e. ★**DB 축 — 「배포됐는데 프로덕션 데이터가 0」인 기능 8건** (통합세션 직접 실측)

코드 조사(워커)는 *"이 코드가 참조되는가"* 를 본다. **이건 다른 질문이다 — *"이 기능이 실제로 쓰이는가"*.**
`COUNT(*)` 로 실측(★`pg_stat_user_tables` 는 **못 쓴다** — `reltuples = -1` 은 "행 0"이 아니라 **통계 미수집**이다. 이 함정에 한 번 걸렸다가 `COUNT(*)` 로 교정했다).

| 테이블 | 행 | 생성 후 경과 | 해석 |
|---|---|---|---|
| `shares` | **0** | **202일** | 공유 기능이 202일간 **한 번도 안 쓰임**. `pages`·`projects` 정책이 이걸 참조해 **정책 복잡도를 계속 지불** 중 |
| `blocks` | **0** | 218일 | (`block_history` 는 3,091행) — §4-b 의 고아 스키마 건과 연결 |
| `payroll_sheets` | **0** | 64일 | ★**급여 위성이 라이브인데 시트가 0** |
| `goals` | **0** | 52일 | 목표 기능. 단 `pages` 에 `page_type='goal'` **2행 실재** ⇒ 페이지는 있고 목표 데이터는 없음 |
| `member_private` · `member_records` | **0** | 51일 | members 위성 라이브인데 인사 상세는 0 |
| `inventory_days` · `inventory_entries` | **0** | 40일 | ★단 `inventory_products` 는 **25행** ⇒ **품목은 등록했는데 실사(日)는 0회** |
| `workspace_groups` | **0** | 40일 | access-tiers Phase A 구조물. 조직 계층 미사용 |

★**이걸 "죽었다"로 읽지 마라 — 셋이 섞여 있다**:
1. **미도입**(만들었는데 운영이 아직 안 씀) — inventory·goals·members 가 유력. 40~52일.
2. **방치**(도입했다가 안 씀) — `shares` 가 유력(**202일**은 "아직"이라 하기 어렵다).
3. **설계상 0이 정상** — `workspace_groups` 는 단일 워크스페이스면 비는 게 맞다.
⇒ ***이 구분은 코드로 못 한다. 유저만 답할 수 있다.*** ⇒ **판정 보류, 질문으로 올린다.**

★**리팩토링 관점의 값**: `shares` 는 **0행인데 `pages`·`projects`의 SELECT/UPDATE 정책에 `EXISTS(shares …)` 서브쿼리로 상시 참여**한다.
즉 **안 쓰는 기능의 비용을 모든 페이지 조회가 지불**하고 있다. 제거 대상이라기보다 **"쓸 건지 결정할 대상"**이다.

## 4-f. 🔴**배포 층 — 「작동 안 하는 스크립트」가 아직 살아 있다** (`s2-deploy` + 통합세션 추가 실측)

상세 설계 = **`docs/DEPLOY-UNIFY-PROPOSAL.md`**. 여기엔 **위험만** 요약한다.

**3열 실태**(문서화된 것 / 실제 쓰는 것 / 작동 안 하는 것):
| | 상태 |
|---|---|
| 모선 CI(`deploy.yml`) | 문서=실제 일치, **작동함**. `keep_files: true`(41~45행)가 **유일 방벽** |
| 위성 7개 `"deploy": "gh-pages -d dist -e <이름> --add"` | ★**작동 안 함**(gh-pages CLI 가 HTTP 400) — **아무도 안 쓰는데 파일엔 남아 있다** |
| 실제 배포 | `HANDOFF §1` 의 **수동 worktree 델타 push**(위성마다 사람이 5단계 반복). 작동하나 **오케스트레이션 없음** |

### 🔴 통합세션 추가 발견 — **루트 스크립트가 더 위험하다**
```
루트 package.json:  "deploy": "gh-pages -d dist"     ← ★--add 가 없다
```
`gh-pages` 는 **기본이 「대상 브랜치 정리 후 배포」**다. ⇒ 루트에서 `npm run deploy` 를 치면
***`f289be2` 사고(위성 5개 wipe)를 한 줄로 재현한다.*** CI 에는 `keep_files: true` 방벽이 있지만
**이 수동 스크립트에는 없다.**
▸ 위성 7개의 고장난 스크립트는 *"안 도는 것"* 이라 상대적으로 무해하지만, **루트 것은 «돌면 파괴»** 라 성질이 다르다.
▸ ⇒ **가장 싸고 큰 조치 = 루트 `deploy` 스크립트에 가드를 넣거나 제거하는 것.** 코드 한 줄, 사고 반경 전체.

### 사고 재발 조건 4가지(`s2-deploy` 실측, 그대로 남아 있음)
⑴위성 배포 100% 수동(경로 오타) ⑵**고장난 스크립트가 파일에 잔존**(되살릴 위험) ⑶배포 후 검증이 **습관 의존**(강제 게이트 아님) ⑷CI·수동이 같은 브랜치 공유 — `keep_files` 한 줄이 유일 방벽

### ★워커 권고가 성숙하다 — 「완전 자동화」를 권하지 않았다
`f289be2` 자체가 ***"자동화가 손배포 영역을 침범해서"*** 난 사고라는 점을 짚고,
**1차 목표를 «검증은 전수 무인, push 는 위성 지정 + 사람 트리거」인 반자동**으로 제안했다.
⇒ 나도 동의한다. **이 층에서 완전 자동화는 사고 반경을 키운다.**

## 5. 과설계 — **확정 후보 0건** (`rf-dead` 산출)

**측정법**: `index.js` 실제 수출 심볼 **39개**(파일명 아님)로 소비처 계수 + `import * as` 0건 대조군 통과
+ `Factory|Manager|Provider|Strategy|Abstract|with[A-Z]` 네이밍 전역 스캔.

- 저소비 export(Modal 군·DeleteToast·EmojiPicker·ThemeToggle·useClickOutside·useUserPreferences·BASE_URL 등)는
  **전부 `SITE-SPLIT-PLAN.md:185-186,224-225` 에 "core 인벤토리"로 사전 문서화된 계획 이관분** ⇒ 제외.
- `useConfirmAction` = 옵션 4종 **전수 실사용**(과잉 파라미터 아님) ⇒ 제외.
- 네이밍 패턴 히트는 전부 복수 소비이거나 오탐(dnd-kit `strategy` prop 등).
- ★**판정 기준을 정확히 적용했다**: *현재 소비처 0 ∧ **장래 계획 0*** 일 때만 잉여. 계획이 문서에 실재하면 후보 아님.
- **미측정**: 컴포넌트 prop 이 옵션인데 호출부가 항상 같은 값인 패턴 — 전역 자동 탐지 불가.

## 6. 위성 구조 정합 (`rf-struct` 산출)

### 6-a. ★★**최대 드리프트 — `membership` 이 위성 레지스트리 양쪽에 미등록**
| | 실물 | 레지스트리 |
|---|---|---|
| gh-pages 배포 | ✓ **최근 3일 5회**(가장 활발) | `siteNodesSeed` **없음** · `satellites.jsx` **없음** |
⇒ **모선 사이드바에서 진입 링크 자체가 없다.** ★고객 대면 키오스크가 사내 런처에서 안 보인다.
▸ `MEMBERSHIP-KIOSK-SPEC.md:197,225` 가 이미 "[모선 조율] 미완"으로 적어놨다 ⇒ **새 발견이 아니라 방치된 미완**.
▸ **번호 충돌**: 그 SPEC 은 자칭 "SITE-SPLIT Phase 6" 인데 `SITE-SPLIT-PLAN.md` 의 실제 Phase 6 은 "todo core 승격"(무관) ⇒ 오귀속.

### 6-b. SPEC 텍스트 드리프트 (문서가 실물보다 뒤처짐)
| 항목 | SPEC | 실물 |
|---|---|---|
| `inventory` | §8 "**미배포**" | 배포됨(2026-07-25) |
| `seat` | §8 "완료(**미배포**)" | 배포됨, **2026-08-03 까지 매우 활발** |
| §11 위성 레지스트리화 | "선택적 개선(저긴급·미래)" | **이미 구현 완료**(`satellites.jsx`, 커밋 `5740b8d` 2026-07-24) |
| `payroll/vite.config.js:5` 주석 | "기본 `/thinkmap-payroll/`" | 코드·라이브 `**/thinkmap/payroll/**` |
▸ ★`members` 는 같은 오탈을 **문서가 이미 자체 정정**했다 ⇒ 같은 실패형이 `inventory`·`seat` 에 남은 것.

### 6-c. 부수 — dev 포트 충돌
`members`·`membership`·`crmboard` 세 위성이 전부 `port: 5178`. 동시 로컬 개발 시 충돌. **프로덕션 영향 없음.**

## 7. tm ↔ 멀티스토어 분리 (`rf-struct` 산출 + ★통합세션 정정)

**결론: 강분리 위반 0건.** 프로젝트 ref 는 `sqisntxippjzcekyhqyo`(tm)·`rstazttwlghsorpzsugy`(multi-store) **2개뿐**,
제3·죽은 ref 없음. `.env` 는 **단일 세트**이고 전 위성이 `envDir: '../../'` 로 공유 ⇒ **위성별 env 혼선 없음**.
프론트가 `crm` 스키마를 직접 쿼리하는 코드 **0건**.

| 위치 | 판정 |
|---|---|
| `supabase/functions/engine-metrics-sync/index.ts:25` | thinkmap Edge → crm Edge `fetch`, 시크릿은 `Deno.env` ⇒ **Edge 계약 준수** |
| `apps/membership/src/api/membership.js` | 브라우저 → thinkmap Edge 만. crm 직접 접근 0 ⇒ **설계대로** |
| `migrate-crm-fdw-conduit.sql` | ⛔**SUPERSEDED 봉인**(파일 1~3행 명시) — 적용 금지 |

### ★통합세션 정정 — 워커의 "통합 «예정»" 은 시제가 틀렸다
`rf-struct` 가 *"crm 만큼은 «분리 유지»가 아니라 «통합 예정»이 최신 결정일 가능성"* 이라 보고했다.
**방향은 맞고 시제가 틀렸다 — 통합은 이미 «완료»됐다**(2026-07-28). 근거:
- 오늘 내 실측: thinkmap 프로젝트에 **`crm` 스키마가 상주**(`nspacl = {postgres=UC/postgres}`, anon/authenticated USAGE 둘 다 **없음**).
- `public.membership_*` 함수군이 `search_path = crm, …` 로 **로컬 crm 스키마를 직접 참조**.
⇒ 워커가 repo 밖(`crm-archive`) 정본을 못 봐서 "예정"으로 읽은 것. **repo 경계가 또 시제를 갈랐다.**
⇒ ★그리고 **강분리 원칙은 여전히 유효하다** — 같은 프로젝트가 되어도 **Edge 계약은 유지**한다는 게 지휘부 판정(2026-08-02)이다.

## 8. 재사용 층위 8층 — 최종 판정 (`rf-layers` 산출)

| 층 | 판정 | 근거 |
|---|---|---|
| ①인증/세션 | **ⓐ단일소스** | 위성 7곳 전부 `@thinkmap/core`, 자체 사본 0 |
| ③Supabase 클라 | **ⓐ단일소스** | `supabaseClient.js` 1개 |
| ④디자인 토큰 | ⓐ파일 단일 / **ⓑ소비 파이프라인 갈림** | `variables.css` 1개. 단 membership 은 `postcss-custom-properties` 로 **재가공**(구형 WebView 폴백) |
| **②라우팅** | **ⓒ제각각(5패턴)** | react-router **0건**. 모선=state / canvas=`pushState`+`popstate` 풀구현 / payroll=1회 읽기 / seat·membership=플래그용 / crmboard·inventory·members=**라우팅 없음** |
| **⑤공통 컴포넌트** | **ⓑ복붙 3중** | core `Modal` 존재하나 **위성 7곳 import 0건**. canvas·membership·seat 가 모달 셸을 **각자 재구현** |
| **⑦에러·로딩 UI** | **ⓑ복붙 7/7** | `if (authLoading) return <div className="pv-center">로딩 중…</div>` **7/7 바이트 동일**. 로깅은 3갈래(core `logError` 2 · `console.error` 9건(seat) · **로깅 0건 4곳**) |
| ⑥빌드 설정 | **ⓑ 5/7 접힘 가능** | 5개는 동일 스켈레톤. **실질 고유는 2건뿐**(membership legacy/postcss · seat `allowedHosts`) |
| **⑧배포** | **ⓒ수동·오케스트레이션 부재** | CI 는 **모선만**. 위성 `deploy` 스크립트 7개는 `-e <이름>` 만 다른 **동일 템플릿**. "전체 배포" 스크립트 **없음** |

**부수 버그**: `crmboard`·`members`·`membership` **dev 포트 5178 충돌** / `HUB_BASE` 상수가 **6/7 App.jsx 에 바이트 동일 반복**

## 9. 디자인 파편화 (`rf-design` 산출)

★**기준을 먼저 갈랐다**(뭉뚱그리지 않음): 내부 건조앱(모선·canvas·crmboard·inventory·members·payroll) / **seat = Material 3 문서화된 예외** / **membership = 브랜드 정본**.

- **브랜드 구값 이탈 `#38528a`·`#45bc51` = 0건** ✓ (rgb 등가형 포함 전수)
- **토큰 인프라 배선 = 7/7 정상**(전 위성 `variables.css` 로드). 문제는 **배선 후 실사용률**.
- ★**`apps/members` 가 최악**: hex 173 vs `var()` 63 — **내부 건조앱인데 토큰화가 가장 안 됨** ⇒ 리팩터 1순위
- ★**병렬 토큰 3계열**: core `--color-*` / seat `--md-*`(문서화 예외) / **membership `--md-*` + 별도 `brand.css --brand-*`(DESIGN.md 값을 손으로 재입력 = 단일소스 아님)**
- **다크모드 인프라는 7/7 동일**(무-플래시 스크립트 복붙). 단 membership 은 **DESIGN.md 신설 다크 토큰 미반영**(해당 hex 0건) — 어제 신설이라 방치 판정은 이르고 **design 통지 여부 확인 필요**
- 공유 **Button 컴포넌트 없음** — `.btn` 류가 위성마다 각자(src 91 · seat 12 · canvas 7 …). 모달과 달리 **애초에 공유화 시도가 없던 영역**

## 9-b. 🔴**안전망 실측 — 우선순위가 바뀐다** (`s2-test` + 통합세션 독립 검증)

상세 = `docs/REFACTOR-SAFETY-NET.md`.

| 항목 | 판정 | 실행 증거 |
|---|---|---|
| 단위 테스트 | **있음(실효)** | `npm run test:run` → **170 passed** / 38 skipped · **794ms** (내가 직접 돌림) |
| **CI 의 test·lint 스텝** | 🔴**0건** | `deploy.yml` = install → **build만** → deploy |
| ESLint | 🔴**없음** | `eslint.config.js` 는 있는데 **패키지 미설치**(`node_modules/.bin/eslint` 부재) = **죽은 설정 파일** |
| TypeScript | **없음** | `.ts/.tsx` 11개 전부 `supabase/functions/`. `src`·`apps`·`core` 는 100% JS |
| 컴포넌트 테스트 | **구조적으로 불가** | vitest `environment:'node'` · jsdom/@testing-library **미설치** |
| 위성 그물 | **7/7 전부 0** | `apps/*/package.json` 에 test 스크립트 **없음** |

★**1~4순위 리팩토링 대상(배포·AuthGate·Modal·vite.config)이 전부 테스트 0건이다.**
그리고 `useAuth.js` 도 0건 — ***오늘 로그인 튕김 조사가 전부 수동 실측이었던 이유가 이것이다.***

### ⇒ **우선순위 재배치 — 「0순위」를 앞에 넣는다**
> **0순위: CI 에 `npm run test:run` 스텝 추가.**
> 근거 = **테스트 170개가 이미 있고 794ms 에 통과하는데, push 마다 아무도 안 돌린다.**
> ***이미 만들어 둔 그물을 안 쓰고 있는 상태*** — 새 코드 0줄, 비용 최저, 효과 즉시.

그 다음에야 1~4순위 통일이 안전해진다. **그물 없이 합치면 회귀를 못 잡는다.**
- ✅ **지금 안전하게 리팩터 가능**: `src/utils/` 8개 + payroll 계산(실효 테스트 있음)
- ❌ **지금은 수동 검증 의존**: 배포 · AuthGate · Modal · vite.config **4개 전부**

🔻**측정 함정(12번째)**: CI 에 test 스텝이 있는지 `grep -i test` 로 봤더니 **1건**이 잡혔는데,
그건 `runs-on: ubuntu-la**test**` 였다. ⇒ **실제 0건.** *부분 문자열 매칭이 «있음」을 만들어냈다.*

## 9-c. 통일 설계 산출 (`s2-unify` · `docs/CORE-UNIFY-PROPOSAL.md`)

- **`<AuthGate>`**: 표준 6위성 흡수 시 **75줄 제거**(canvas 14·crmboard 16·inventory 8·members 14·payroll 14·seat 9)
- ★**membership 은 의도적으로 제외했다** — 인가 실패 시 **`signOut()`** 을 부르는데, 표준 게이트("거부 화면만, 세션 유지")와 **결과 상태가 다르다.**
  ⇒ ***브리프의 "의미가 다른 것을 같은 이름으로 묶지 마라"가 실물로 적용된 사례.*** 별도 `useRoleAuthz` 로 분리.
- **`createSatelliteConfig()`**: 표준 5곳 10줄→2줄, membership 46→~20줄(고유분 보존). **포트 레지스트리 + 로드시 중복검사 throw** 로 5178 충돌을 **구조적으로 불가능하게**.
- ★**포트 재배정은 «무해한 리팩터가 아니다»** — 사람이 아는 숫자가 바뀐다 ⇒ **별도 승인 항목**으로 분리했다. 좋은 판단.
- **미측정 명시**: `pv-*`/`auth-*` CSS 위성별 미세 drift · 포트 CI 정적검증 · 모선 승인대기 게이트의 위성 확장 필요성

## 10. ★통일 우선순위 (최종)

기준 = 중복도 × 변경빈도(2026-06-01~) × **사고이력**

| 순위 | 층 | 근거 |
|---|---|---|
| **1** | **⑧배포 스크립트** | ★**이미 사고 남**(`f289be2` — CI 가 push 마다 위성 하위폴더를 **wipe** 하던 것 차단). 재발 구조(수동+오케스트레이션 부재) **그대로 남아 있음** |
| **2** | **⑦에러·로딩 UI** | 7/7 바이트 동일 + **이미 갈라지기 시작**(membership fix `31b0705` 가 그 증거). 로깅 4곳은 **에러를 아예 안 남김** |
| **3** | ⑤공통 컴포넌트(모달) | 지금 조용하나 core Modal 에 접근성·포커스트랩 개선이 들어가도 **위성 3곳엔 전파 안 됨**(잠재 드리프트) |
| **4** | ⑥빌드 설정 | 순수 기계적, 난이도 최저. 포트 충돌도 **팩토리 레지스트리로 구조적 해소** |
| **5** | ②라우팅 | ★**무리한 통일은 오버엔지니어링** — canvas 만 deep-link 가 실제로 필요. "통일"이 아니라 **옵트인 훅**이 맞는 방향 |
| **6** | `site_nodes` 데이터 정정 | 비용 최저(UPDATE), 효과 즉시 |

### 접을 수 있는 것 / 남겨야 하는 것
**접는다**: vite.config 5개 → `createSatelliteConfig({name, port})` 팩토리 · App.jsx 로딩/로그인/`HUB_BASE` 블록 → core `<AuthGate>` 훅(각 10~15줄 제거) · 모달 셸 3곳 → core `Modal` · 루트 `deploy:satellites` 오케스트레이션
**남긴다**: membership legacy/postcss(**CS-273N 하드웨어 제약**) · seat `allowedHosts`(LAN 테스트) · canvas 라우팅(**유일하게 deep-link 필요**) · membership 인가 게이트(매장 계정 모델 고유)

## 11. 승인이 필요한 것 (조사 밖)

1. **`site_nodes` 데이터 정정** — URL 6행 채우기 · inventory `dev`→`live` · dashboard `satellite`→모선 · canvas domain 정정
2. **membership 레지스트리 등록** — `siteNodesSeed` + `satellites.jsx` (★고객 대면인데 사내 런처에 안 보임)
3. **미참조 파일 7건 삭제** (전부 모선 `src/`, 위험도 낮음)
4. **SPEC 텍스트 드리프트 정정** — inventory·seat "미배포" 표기 · §11 "미래" 표기 · payroll 주석
5. ★**game 도메인 `site_url` 수정** — **내 소유 아님**. 고객 접점이라 최우선 라우팅 필요

| 축 | 담당 | 상태 |
|---|---|---|
| 죽은 요소 · 과설계 | `rf-dead` | 산출 요청함 |
| 위성 구조 정합 · tm↔멀티스토어 | `rf-struct` | 진행 |
| 디자인 파편화 | `rf-design` | 진행 |
| 재사용 층위(라우팅·에러UI·배포) | `rf-layers` | 진행 |
| 로그인 튕김 잔여 축 | `rf-auth` | 진행 |

---

## 5. 통일 우선순위 (잠정)

기준 = 중복도 × 변경빈도 × 사고이력

1. **배포 스크립트** — 문서와 실제가 다르다. *사고이력 있음*(gh-pages CLI HTTP 400 · 위성 wipe 재발 2회) ⇒ **가장 비싼 불일치**
2. **빌드 설정 7벌** — 중복도 최대. 단 고유분(seat allowedHosts · membership legacy)은 남겨야 함 ⇒ 공통 팩토리 + 위성 override
3. **site_nodes 레지스트리** — 조치 비용 최저(데이터 UPDATE), 효과 즉시
4. 라우팅 · 에러UI — 미측정, 산출 후 재배치

*(워커 산출 반영 시 갱신)*
