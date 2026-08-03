# 보안 잔여 STEP 설계 (2026-08-04)

> ★**이 문서는 설계 산출물이다. SQL 실행·DB 쓰기 0건**(작성 과정에서 DB에 직접 접근하지 않았고,
> 아래 "미측정" 표기 항목은 코드/HANDOFF 근거만으로는 확인 불가한 **DB 카탈로그 상태**다 —
> 적용 세션이 실행 직전 재확인할 것).
> 근거선: `/Users/benja/claude-project/HANDOFF-thinkmap.md` §E-0(2026-08-03 프로덕션 적용 완료 3묶음).
> 대상 파일: `migrate-rls-harden-unconditional-select.sql` · `migrate-harden-function-exposure.sql`
> (둘 다 저장소 루트, 현재 미커밋 상태로 대기 중).

---

## 임무 A — `migrate-rls-harden-unconditional-select.sql` STEP2 · STEP3

### A-1. 현행 실태

| 항목 | 상태 | 근거 |
|---|---|---|
| STEP1 (audience 백필 + `is_staff()`/`is_customer()` 신설 + `is_master()` status 보정 + 자기삽입 정책 통합 + anon INSERT 회수) | ✅ **적용 완료** (2026-08-03) | HANDOFF §E-0 표: `rls_harden_step1_audience_helpers` — audience 미태깅 0 · anon INSERT false · 헬퍼 auth 실행 2/2 |
| 짝 파일 `migrate-fix-grants-sync-status-parity.sql` | ✅ **적용 완료** | HANDOFF §E-0 표: 거울 대조 양방향 차집합 0/0 |
| STEP1 후 **신규 로그인 스모크** (`app_users_self_insert` 실경로) | ⚠️ **미실시** | HANDOFF §E-0 "미완" ⓑ: "STEP1 후 신규 로그인 스모크 미실시" — 오늘(2026-08-04) 이 문서 작성 시점까지 후속 완료 기록 없음(mailbox `.hb-thinkmap` 최신 갱신 07:17이나 스모크 완료를 명시한 통지는 찾지 못함) |
| STEP2 (5개 무조건 SELECT → `is_staff()` 결합) | ⏸ 미적용 | 파일 내 DRAFT 상태 |
| STEP3 (과도기 폴백 제거) | ⏸ 미적용 | 파일 내 DRAFT 상태 |

### A-2. STEP2 판정 — **조건부 가능, 지금은 차단**

`is_staff()`는 이미 존재하고(STEP1 적용됨) 헬퍼 자체는 auth 실행 2/2로 검증됐다. 그러나 파일이 스스로 못박은
선행조건(파일 289~294행 "MUST-DO (3)")이 **"STEP1 적용 후 직원 스모크 통과 확인 → STEP2로 진행"**인데,
그 스모크가 HANDOFF상 아직 미실시다. 정책 전환(STEP2)은 실제 세션의 `app_users` 자기 행 열람 경로에
직결되므로, STEP1 자체가 실사용자 세션에서 검증되지 않은 채 STEP2를 얹으면 **장애 시 원인 분리가 안 된다**
(파일이 명시적으로 경고한 바로 그 실패 모드).

**⇒ STEP2 적용 순서**: ⑴ STEP1 로그인 스모크(HANDOFF 미완 ⓑ) 먼저 완료·기록 ⑵ 파일의 MUST-DO(1) 정책명 드리프트
재확인 SQL 재실행(적용 직전) ⑶ 그 다음 STEP2. **SQL 문안 자체는 이미 파일에 완성돼 있어 추가 설계 불필요**
(`migrate-rls-harden-unconditional-select.sql:188-249`, 2-A~2-E).

### A-3. STEP3 판정 — **차단 확정. 코드 근거로 재확인함**

파일이 명시한 하드 선행조건: *"온보딩 audience 세팅 경로(F-1) 없이는 적용 금지"*(같은 파일 261~269행).
이번에 **그 경로가 지금 존재하는지**를 코드로 직접 확인했다.

- `src/hooks/useUsers.js:39-76` (`addUser`) — `app_users` 테이블에 `insert`만 한다. `auth.users` 나
  `app_metadata`는 건드리지 않는다.
- `src/hooks/useUsers.js:79-98` (`updateUserRole`) — `app_users.role` 을 `update` 할 뿐.
- `src/hooks/useUsers.js:101-120` (`updateUserStatus`) — `app_users.status` 를 `update` 할 뿐.
- 세 함수 전부 클라이언트 `supabase.from('app_users')...` 직접 호출이다. Admin API(`supabase.auth.admin.*`)
  호출이나 `app_metadata`/`audience` 문자열 자체가 **이 세 함수 어디에도 없다**.
- `supabase/functions/` 전수(`ls`): `_shared · engine-metrics-sync · ensure-daily-page · membership-event ·
  membership-history · membership-list · membership-lookup · membership-reward · membership-signup ·
  membership-stamp` — **전부 멤버십(고객) 도메인**이고, 직원 온보딩/승인 Edge Function은 0건.
- 저장소 전체 grep(`--include=*.js,*.jsx,*.ts,*.sql`, `dist`/`node_modules` 제외)에서 `audience` 문자열이
  나오는 파일은 **`migrate-rls-harden-unconditional-select.sql` 단 하나**(정의만 있고 세팅 경로 없음).

**⇒ 결론: F-1(온보딩 audience 세팅 경로)은 코드베이스에 존재하지 않는다.** 지금 STEP3를 적용하면
파일이 경고한 그대로 — 신규 입사자는 `is_staff()`가 영구 false가 되어 앱을 못 쓴다. **STEP3는 차단 상태로 유지.**

### A-4. STEP3 선행 구현 스케치 (설계만 — 미작성·미배포)

STEP3를 열려면 ⓐ승인 경로(`updateUserRole`/`updateUserStatus`가 호출하는 지점)에서 `auth.users.raw_app_meta_data.audience`를
`'staff'`로 세팅하는 서버측 경로가 필요하다. 클라이언트에서 `auth.users`를 직접 못 쓰므로 Admin API가 필요하고,
Admin API 키는 클라이언트에 노출 불가 → **Edge Function**이 정답이다.

```
POST /functions/v1/approve-staff-user   (신설, 미작성)
  body: { user_id }  (app_users.id 또는 auth_uid)
  ── 서버측(service_role) ──
  1) 호출자가 is_master() 인지 검증 (호출자 JWT)
  2) app_users.status='active', role=... 세팅 (기존 updateUserRole/updateUserStatus 로직 이관 또는 병행)
  3) supabase.auth.admin.updateUserById(auth_uid, {
       app_metadata: { audience: 'staff' }
     })
  4) 응답: 갱신된 app_users 행
```

- 프론트 `updateUserRole`/`updateUserStatus`(`src/hooks/useUsers.js`)를 이 Edge Function 호출로 교체하거나,
  최소한 "승인"(status→active) 액션 경로만 우선 교체.
- ⓑ 그 경로로 실제 1명 태깅 성공 확인 ⓒ 전 직원 세션 토큰 회전(재로그인) 확인 — 이 둘은 **구현 이후**의
  검증 단계이며 이번 설계 범위 밖.
- ★기존 계정 5명은 STEP1의 1회성 백필로 이미 태깅됨(audience='staff') — 이 Edge Function은 **신규 입사자**용.

### A-5. 검증 쌍 (재확인)

| 구분 | 술어 | 기대값 |
|---|---|---|
| STEP2 적용 전 | 정책명 드리프트 (`pg_policies` 5개 조회) | 파일 281-285행 쿼리와 정확히 일치 |
| STEP2 적용 후 | `pg_policies WHERE qual='true'` | 0 (기존 5개 무조건 SELECT 소멸) |
| STEP2 적용 후 | 활성 직원 세션 스모크 | 로그인·데일리 생성·QuickTodo·코멘트 이메일 표시·자리후/급여 위성 로드 정상 |
| STEP3 적용 전 (차단 게이트) | Edge Function `approve-staff-user` 존재 + 실사용 1건 | 지금은 **0건 — 게이트 미충족** |
| STEP3 적용 후 | 폴백 없는 `is_staff()`로 기존 세션 정상 동작 | 토큰 회전 완료 후 재확인 |

### A-6. 위험

- STEP2를 스모크 없이 얹으면: 장애 시 STEP1/STEP2 중 어느 쪽이 원인인지 분리 불가(파일 자체 경고).
- STEP3를 F-1 없이 적용하면: 신규 입사자 영구 차단 + 기존 미회전 세션도 즉시 차단(치명, HANDOFF가 이미 "전 직원 즉시 로그아웃급 장애"로 표시).
- STEP3 선행 Edge Function은 **service_role 키를 쓰는 신규 쓰기 경로**이므로 자체가 guardian 재검수 대상(신설 코드 리스크는 이번 설계에 포함되지 않음 — 별도 구현 시 재검수 필요).

---

## 임무 B — `migrate-harden-function-exposure.sql` STEP2 설계

### B-1. 현행 실태

| 항목 | 상태 | 근거 |
|---|---|---|
| `create_canvas_pair` 권한축(PUBLIC·anon 회수, authenticated 승격) | ✅ **적용 완료**(별도 파일 `migrate-fix-create-canvas-pair-exposure.sql`, HANDOFF §E-0) | `fix_create_canvas_pair_exposure` — anon_x true→false, auth_x true 유지 |
| `create_canvas_pair` **본문**의 `p_master_id` 검증 | ❌ **없음** — 오늘 권한 조정과 별개 축, 미해결 | 아래 B-2 |
| `seed_*` 3종 EXECUTE 회수(이 파일의 STEP1) | ⏸ **미적용** — HANDOFF §E-0 적용 목록에 없음 | HANDOFF §E-0 표 5건 중 이 파일 항목 없음 |
| `seed_*` 3종 본문의 `p_master_id` 검증 | ❌ **없음** | 아래 B-2 |

### B-2. 본문 확인 — 두 함수군 다 "같은 형태" 맞음

`create_canvas_pair`(`migrate-canvas-mapping-fix-rls.sql:192-243`, 현재 라이브 정의):

```sql
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
IF auth.uid() <> p_user_id AND NOT is_linked_account(p_user_id) THEN
  RAISE EXCEPTION 'unauthorized: cannot create canvas pair for user %', p_user_id;
END IF;
-- p_master_id 는 이 시점부터 끝까지 검증 없이 그대로 쓰인다:
PERFORM seed_default_workflow_for_master(p_master_id);
PERFORM seed_frame_schema_for_master(p_master_id);
PERFORM seed_engine_schema_for_master(p_master_id);
INSERT INTO canvas_pairs (user_id, master_id, ...) VALUES (p_user_id, p_master_id, ...);
```

`seed_default_workflow_for_master` / `seed_frame_schema_for_master` / `seed_engine_schema_for_master`
(`migrate-add-canvas-mapping.sql:322-460`) — 세 함수 다 **본문에 인증/소유 검증 자체가 없다**. `p_master_id`를
받아 `canvas_workflows`/`canvas_schemas`에 그대로 INSERT(고정 상수 콘텐츠, `ON CONFLICT DO NOTHING`)한다.
현재 직접 호출자는 없다(HANDOFF 실측, 프론트 grep 0건) — 유일한 도달 경로가 `create_canvas_pair`의 내부
`PERFORM`이므로, **`create_canvas_pair`의 구멍이 그대로 이 셋에도 상속된다.**

### B-3. 정당한 호출자 모델 — 코드로 확정

- `apps/canvas/src/CanvasApp.jsx:4,83` — 주석 "캔버스는 마스터 소유물이라 userId=masterId=본인",
  실제 호출: `masterId={uid}` (`uid = session.user.id`, 자기 자신). **현재 라이브 코드에서 `p_user_id`와
  `p_master_id`는 항상 같은 값(호출자 자신)이다.**
- `docs/MARKETING-CANVAS-MAPPING-PLAN.md:369` — "마스터/직원 = impersonation 시스템: `IMPERSONATION-SPEC.md`의
  `master_id`/`user_id` 패턴 그대로 사용" → `master_id`는 **연결 계정(linked_accounts) 오너 개념**과 같은 자리에
  설계됐다. `create-linked-accounts.sql:54-66`의 `is_linked_account(owner_user_id)`가 바로 이 패턴이다
  (호출자가 `owner_user_id` 계정에 `editor` 권한으로 연결돼 있는지 판정).
- 즉 기존 `p_user_id` 검증(`auth.uid() = p_user_id OR is_linked_account(p_user_id)`)은 **"누구 명의로 페이지가
  생성되는가"**를 지키고, 실제 테넌트 경계(`canvas_workflows`/`canvas_schemas`가 걸리는 축)는 **`master_id`**다.
  지금은 이 테넌트 경계축에 아무 검증이 없다 — **오늘 임의의 로그인 사용자가 남의 `master_id`로 시드 행을
  삽입할 수 있는 구멍이 그대로**(HANDOFF가 "저위험"으로 이미 분류: 콘텐츠 고정 + `ON CONFLICT DO NOTHING`이라
  덮어쓰기·주입 불가, 단 게임 재출발로 authenticated 인구가 늘면 성질이 바뀐다).

### B-4. 제안 SQL 초안 — `p_master_id` 검증 (2안, ★A 권장)

**안 A(권장) — 기존 `p_user_id` 패턴을 `p_master_id`에도 미러링.** `is_linked_account` 경로(임퍼소네이션)를
안 깬다: 연결 계정 editor가 `p_master_id` 소유자를 대신해 호출하는 것도 그대로 허용되고, 그 외의 임의
`master_id`만 막는다.

```sql
-- create_canvas_pair 본문, 기존 p_user_id 체크 직후 / seed_* PERFORM 이전에 삽입
IF auth.uid() <> p_master_id AND NOT is_linked_account(p_master_id) THEN
  RAISE EXCEPTION 'unauthorized: cannot create canvas pair for master %', p_master_id;
END IF;
```

**안 B(더 엄격, 대안) — 현재 유일한 실사용 패턴(`p_user_id = p_master_id`)을 그대로 강제.**
`CanvasApp.jsx`가 항상 이 값을 같게 보내므로 회귀는 없지만, `docs/MARKETING-CANVAS-MAPPING-PLAN.md:369`가
가리키는 "직원이 마스터 캔버스에 기여" 임퍼소네이션 확장 여지를 지금 막아버린다.

```sql
IF p_user_id <> p_master_id THEN
  RAISE EXCEPTION 'unsupported: p_master_id must equal p_user_id (canvas is self-owned)';
END IF;
```

★두 안 중 어느 쪽이든 **미결정 ⓐ(정당한 소유자 판정 기준)는 이걸로 확정됨** — 코드 근거는 "`current_workspace()`
기준"이 아니라 **`is_linked_account`(연결 계정) 기준**이다(캔버스는 워크스페이스가 아니라 `auth.users.id` 단위
소유 모델). 안 A를 1차 권장한다 — 기존 검증과 대칭이고, 향후 임퍼소네이션 확장을 막지 않는다.

### B-5. 미결정 ⓑ — 기존 데이터 정합성(적용 전 필수 확인, 미실행)

파일 자체가 요구하는 선조사(87-89행)를 안 A/B 문안에 맞게 구체화:

```sql
-- 적용 직전 실행(읽기 전용). 기대 0.
SELECT count(*) FROM canvas_pairs cp
 WHERE NOT (
   -- 안 A 기준
   cp.master_id = cp.user_id   -- 자기 소유
   -- 안 A라면 여기에 OR EXISTS(과거 시점 is_linked_account 관계) 는 재현 불가하므로
   -- 실질적으로는 "생성 당시 정당했는지"가 아니라 "지금 최소 자기소유 형태인지"만 1차 스크린
 );
```
※ 이 카운트는 **미실행**(SQL 실행 금지 지침). 적용 세션이 위 쿼리를 돌려 0이 아니면, 어긋난 행이
안 A 조건(현재도 여전히 `is_linked_account` 관계로 설명 가능한지)으로 정당화되는지 개별 확인 필요.

### B-6. `seed_*` 3종 처리 — STEP1(권한 회수)이 먼저, 본문 검증은 선택적

- 이 파일의 **STEP1**(`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`, 파일 40-42행)은 아직 미적용이고
  **로직 변경이 없는 grant/revoke뿐**이라 STEP2(본문 수정)보다 리스크가 훨씬 낮다. 프론트 호출부 0건
  (HANDOFF 실측)이라 회귀 없음.
- STEP1이 적용되면 `seed_*`는 `create_canvas_pair` 내부 `PERFORM`(SECURITY DEFINER, 소유자 권한으로 실행)
  경로로만 도달 가능해진다. 소유자 자신의 함수 호출은 REVOKE의 영향을 받지 않으므로 캔버스 앱은 그대로 동작한다.
- 이 상태에서 `create_canvas_pair`에 안 A/B의 `p_master_id` 검증까지 들어가면, `seed_*`에 도달하는 유일한
  경로 자체가 이미 마스터 검증을 통과한 뒤이므로 **`seed_*` 본문에 별도 검증을 추가하는 건 순수 defense-in-depth**
  다(가치는 있으나 이번 STEP2 설계의 필수 항목은 아니다 — 원한다면 동일한 `IF auth.uid() <> p_master_id AND
  NOT is_linked_account(p_master_id) THEN RAISE ...` 를 3함수 각각에 복붙, 별도 후속 STEP으로 분리 권장).

### B-7. 검증 쌍

| 항목 | 술어 | 기대값 |
|---|---|---|
| B-5 선조사 | 위 카운트 쿼리 | 0 (아니면 개별 확인 후 진행) |
| 적용 후 정상 경로 | 캔버스 위성에서 로그인 상태로 자기 소유 페어 생성 | 성공 (기존 스모크와 동일) |
| 적용 후 차단 경로 | 임의 `p_master_id`(타인, 비연결계정)로 RPC 호출 | `unauthorized` 예외 |
| 적용 후 임퍼소네이션 경로(안 A만) | `linked_accounts` editor 세션으로 `p_master_id`=오너 계정 호출 | 성공 유지(회귀 없음) |
| `seed_*` STEP1 적용 후 | `has_function_privilege` 재측정 (파일 44-51행 쿼리) | anon_x=false · auth_x=false · svc_x=true(탐지기) |

### B-8. 위험

- 안 A/B 둘 다 **로직 변경**이므로 guardian 재검수 필수(이 문서는 검수를 대신하지 않는다).
- B-5 선조사를 건너뛰고 적용하면 기존 정상 페어가 있는데도 조인 검증으로 막힐 가능성(파일이 이미 경고).
- `seed_*` STEP1은 리스크가 낮지만, `migrate-canvas-mapping-fix-rls.sql`이 `drop function`+create로
  `create_canvas_pair`를 재생성하는 파일이라 **재실행 시 이번 STEP2 수정과 오늘 적용된 권한 조정이 함께
  원복된다**(그 파일 상단 순서경고 배너, `migrate-rls-harden-unconditional-select.sql:319-326` 참조) — STEP2를
  적용한다면 `migrate-canvas-mapping-fix-rls.sql`의 `create_canvas_pair` 정의 자체를 이 검증 포함 버전으로
  갱신해 두어야, 그 파일이 실수로 재실행돼도 구멍이 되살아나지 않는다.

---

## 적용 순서 요약

1. **(A 선행)** STEP1(rls-harden) 로그인 스모크 완료·기록 → STEP2(rls-harden) 적용.
2. **(B, 병행 가능)** `seed_*` STEP1(권한 회수, 이 함수-노출 파일) 적용 — 로직 무변경, 리스크 낮음.
3. **(B)** guardian 재검수 → B-5 선조사(카운트=0 확인) → `create_canvas_pair` 본문에 안 A(권장) 적용,
   **같은 커밋에서 `migrate-canvas-mapping-fix-rls.sql`의 정의도 함께 갱신**.
4. **(A, 별도 트랙)** F-1(Edge Function `approve-staff-user`, A-4 스케치) 구현·guardian 재검수·유저 승인 →
   실사용 1건 확인 → 전 직원 토큰 회전 확인 → **그 다음에만** STEP3(rls-harden) 적용.

## 차단 조건 요약

| STEP | 차단 여부 | 차단 사유 | 해제 조건 |
|---|---|---|---|
| A-STEP2 | 조건부 차단 | STEP1 로그인 스모크 미실시 | 스모크 완료·기록 |
| A-STEP3 | **확정 차단** | F-1 온보딩 audience 경로 코드 0건(재확인 완료) | Edge Function 구현+검증(A-4) |
| B-STEP1(seed 회수) | 차단 아님 | — | guardian 검수 후 즉시 가능 |
| B-STEP2(`p_master_id` 검증) | 설계 완료, 적용 차단 | 로직 변경(guardian 미검수) + B-5 선조사 미실행 | guardian 검수 + 선조사 0 확인 |
