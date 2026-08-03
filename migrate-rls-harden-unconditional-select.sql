-- ══════════════════════════════════════════════════════════════════════════
-- [초안·미적용] §10.2 audience 강분리 정렬 + 무조건 SELECT 정책 하드닝
-- ══════════════════════════════════════════════════════════════════════════
-- 상태: ★DRAFT. guardian 재검수 → 유저 승인 전까지 적용 금지.
-- 정본: docs/ARCHITECTURE-PRINCIPLES.md §10.2(내부/외부 강분리 4중 장치, 2026-08-01 유저 확정)
--   - 장치1 audience 태깅: 모든 계정 `app_metadata.audience='staff'|'customer'`(서버만 기록)
--   - 장치2 정책 규범: RLS에서 **bare authenticated 금지** → 반드시 audience 조건 결합
--
-- 대상(실측 정정): crm 보고는 "17개"였으나 thinkmap 재측정 결과 진짜 무조건 허용(`qual='true'`)은
--   **5개, 전부 SELECT**다. 나머지는 INSERT 정책이라 qual 이 NULL 일 뿐 with_check 에 조건이 있다.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ★★★ 최대 위험 — 순서를 틀리면 전 직원 즉시 로그아웃급 장애 ★★★
-- ══════════════════════════════════════════════════════════════════════════
-- 실측(2026-08-01): auth.users 5명 중 **audience 보유 0명**.
--   → `is_staff() AND …` 를 지금 그대로 적용하면 **전원 차단**. 운영 중인 자리후 태블릿·
--     데일리·급여 등 전 앱이 즉시 죽는다.
-- 게다가 audience 를 백필해도 **이미 발급된 JWT 에는 클레임이 없다**. 클레임은 토큰이
--   갱신될 때 비로소 들어간다(기본 만료 1시간) → 백필 직후에도 최대 1시간의 차단 공백.
--
-- 그래서 이 파일은 **3단계로 쪼갠다**. 반드시 이 순서로, 단계 사이에 검증을 넣는다.
--   STEP 1 (무해·선행)  : audience 백필 + 헬퍼 신설. **정책은 아직 안 건드린다** → 회귀 0.
--   STEP 2 (정책 전환)  : 5개 정책을 `is_staff() AND …` 로 교체.
--                         ★단 헬퍼에 **과도기 폴백**을 넣어 구 JWT 세션도 통과시킨다(장애 회피).
--   STEP 3 (엄격화·후속): 전 세션 토큰 회전 확인 후 폴백 제거 → 순수 audience 판정.
--                         ※STEP 3 까지 가야 §10.2 장치1이 실제로 "기계가 막는" 상태가 된다.
-- ══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 1 — audience 백필 + 헬퍼 신설  (정책 미변경 → 회귀 0, 단독 적용 가능)
-- ══════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1-A) 기존 계정 전원을 staff 로 태깅.
--   근거: 현재 auth.users 5명 = 전부 직원(고객 계정은 아직 존재하지 않음, app_users 5행과 1:1).
--   ※고객 표면(게임·멤버십)이 계정을 만들기 시작하면 그때부터는 **생성 시점에** 서버가
--     audience='customer' 를 박아야 한다(§10.2 장치1). 이 백필은 1회성 이행 조치다.
UPDATE auth.users
   SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('audience', 'staff')
 WHERE raw_app_meta_data->>'audience' IS NULL;

-- 1-B) is_staff() — 내부(백오피스) 관객 판정. §10.2 정본 헬퍼.
--   ★과도기 폴백 포함: audience 클레임이 아직 없는 **구 JWT** 는 app_users 활성 등록으로 대체 판정.
--     폴백이 없으면 백필 직후~토큰 회전 전까지 전원 차단된다(위 위험 항목).
--     app_users 조회 때문에 **SECURITY DEFINER 필수**(app_users RLS 재진입 방지).
CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.jwt() -> 'app_metadata' ->> 'audience' = 'staff'    THEN true
      WHEN auth.jwt() -> 'app_metadata' ->> 'audience' = 'customer' THEN false  -- 고객은 즉시 차단
      ELSE EXISTS (                                                             -- ★과도기 폴백(STEP 3에서 제거)
        SELECT 1 FROM app_users u
         WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
           AND u.status = 'active'
      )
    END;
$$;

COMMENT ON FUNCTION is_staff() IS
  '§10.2 내부 관객 판정. app_metadata.audience=staff. ★과도기 폴백(구 JWT → app_users active) 포함 — 토큰 회전 완료 후 STEP 3 에서 제거할 것.
   ★안전 전제: 폴백의 안전성은 이 파일이 아니라 **별도 트리거 guard_app_users_privilege** 에 의존한다
   (비마스터의 app_users.role/status 자가변경 차단). 그 트리거를 임시 DISABLE 하는 런북
   (마스터 role 직접변경 절차) 수행 중에는 이 폴백도 함께 위험해진다 — ★동시 실행 금지.
   추가로 trg_sync_workspace_grant 가 app_users 승격을 워크스페이스 editor grant 로 자동 전환하므로
   그 창에서는 승격이 grant 까지 번진다(기존 리스크의 연장선).';

-- 1-C) is_customer() — 외부(고객 표면) 관객 판정. 게임·멤버십에서 쓸 정본 헬퍼.
--   폴백 없음(고객은 처음부터 태깅되어 생성되므로). 태깅 없는 계정은 고객이 아니다.
CREATE OR REPLACE FUNCTION is_customer()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'audience' = 'customer';
$$;

COMMENT ON FUNCTION is_customer() IS
  '§10.2 외부(고객) 관객 판정. app_metadata.audience=customer. 폴백 없음 — 태깅 없으면 고객 아님.';

-- 위생(guardian 권고): PUBLIC 기본 EXECUTE 를 회수하고 authenticated 에만 부여.
REVOKE EXECUTE ON FUNCTION is_staff()    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_customer() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION is_staff()    TO authenticated;
GRANT  EXECUTE ON FUNCTION is_customer() TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 1-D) ★is_master() 보정 — status 미검사 결함 + search_path 미고정
-- ══════════════════════════════════════════════════════════════════════════
-- crm 보고(2026-08-01) 권고 #2 채택. 현 정의는 `role='master'` 만 보고 **status 를 안 본다**
--   → 마스터를 `status='inactive'` 로 퇴사 처리해도 **권한이 그대로 남는다**(오프보딩 결함).
--   지금은 비활성 마스터가 0명이라 잠재 상태지만, 마스터를 내리는 날 터진다.
-- ★7/11 가드와의 정합 확인(유저 지시):
--   `guard_app_users_privilege()`(BEFORE INSERT OR UPDATE)가 내부에서 is_master() 를 호출한다.
--   여기에 status='active' 를 넣으면 **가드도 함께 엄격해진다**(비활성 마스터는 role/status 변경 불가).
--   방향이 일치하며 충돌 없음. 활성 마스터 2명은 둘 다 status='active' 로 실측 확인 → 회귀 없음.
-- ※search_path 고정은 위생(현 실측: authenticated 는 public CREATE·스키마 생성 권한이 **없어**
--   섀도잉 악용은 불가 — 그래서 치명이 아니라 위생 항목이다).
CREATE OR REPLACE FUNCTION is_master()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users
     WHERE lower(email) = lower(auth.jwt() ->> 'email')
       AND role = 'master'
       AND status = 'active'          -- ★신설: 비활성 마스터 차단
  );
$$;

COMMENT ON FUNCTION is_master() IS
  '워크스페이스 마스터 판정(shim). role=master AND status=active. 2026-08-01 status 조건·search_path 추가.';

-- ══════════════════════════════════════════════════════════════════════════
-- 1-E) app_users 자기삽입 정책 정리 — 중복 2개 → 1개 + 권한 컬럼 고정
-- ══════════════════════════════════════════════════════════════════════════
-- 현 상태: 자기삽입 정책이 **2개 중복**(`Users can insert own record` /
--   `Users can self-insert own record`) — 둘 다 email 만 검사하고 role/status 무제약.
-- ★단 crm 이 보고한 "role='master' 자기삽입으로 즉시 승격" 체인은 **실제로는 성립하지 않는다**:
--   7/11 가드가 비마스터 INSERT 의 role/status/is_store 를 강제 하향한다.
--   롤백 트랜잭션 실증(2026-08-01): role='master',status='active' 로 넣어도 저장값은
--   role='user', status='pending', is_store=false 였다. → 🔴 아님.
-- 그래도 정리하는 이유:
--   ① PERMISSIVE 중복은 OR 결합이라 "실효 조건"을 정책 한 줄로 검증할 수 없다(설계서 §1.3).
--   ② 가드는 **런북상 임시 DISABLE 가능**하다(마스터 role 변경 시). 가드가 꺼진 순간에도
--      정책 자체가 role/status 를 고정하면 승격 경로가 이중으로 막힌다(belt & braces).
DROP POLICY IF EXISTS "Users can insert own record" ON app_users;
DROP POLICY IF EXISTS "Users can self-insert own record" ON app_users;
CREATE POLICY app_users_self_insert ON app_users
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(email) = lower(auth.jwt() ->> 'email')   -- 자기 이메일만
    AND role = 'user'                              -- ★승격 불가(가드와 동일 값으로 고정)
    AND status = 'pending'                         -- ★마스터 승인 대기
    AND coalesce(is_store, false) = false
  );
-- ※`Master can insert users`(초대 경로) 정책은 그대로 둔다 — is_master() 조건이라 안전.
-- ※프론트 ensureAppUser 는 role/status 를 보내지 않으므로(기본값 의존) 이 고정으로 깨지지 않는다.
--   ★단 STEP 1 적용 후 신규 로그인 1건으로 스모크 확인할 것.

-- ══════════════════════════════════════════════════════════════════════════
-- 1-F) 미사용 grant 회수 — anon 의 app_users INSERT
-- ══════════════════════════════════════════════════════════════════════════
-- 실측: anon 에 INSERT grant 가 살아 있으나 anon 정책이 0건이라 RLS 가 막고 있다(현재 무해).
--   grant 가 남아 있는 것 자체가 위험(정책 실수 1건이면 열린다) → 회수. 회귀 없음(사용처 0).
REVOKE INSERT ON public.app_users FROM anon;

COMMIT;

-- STEP 1 검증(반드시 통과 후 STEP 2)
--   SELECT count(*) FILTER (WHERE raw_app_meta_data->>'audience'='staff') AS staff,
--          count(*) AS total FROM auth.users;                       -- 기대 5 / 5
--   그리고 실제 직원 세션에서 앱 스모크(로그인·데일리·자리후) — 정책 미변경이라 무변화여야 한다.


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 2 — 5개 무조건 SELECT 정책을 audience 결합 조건으로 교체
-- ══════════════════════════════════════════════════════════════════════════
-- 규범(§10.2 장치2): bare authenticated 금지 → 모든 조건에 is_staff() 를 AND 결합한다.
-- 데이터 조건은 CLAUDE.md 규정대로 워크스페이스 grant 판정을 쓴다
--   (활성 직원 4명 전원 workspace grant 보유·누락 0 — 실측).
--
-- ★재귀·성능 안전성(실측): current_workspace()=상수 UUID(테이블 미접근),
--   can_in_workspace/access_can/is_master/is_staff = SECURITY DEFINER → 정책 평가 중 RLS 재진입 없음.
--
-- ★코드 회귀 조사 결과(서브에이전트 전수조사 2026-08-01):
--   · app_users        : 전 앱 로그인 부트스트랩이 의존(useAuth checkUserInfo/ensureAppUser는
--                        **email 로 조회**하고 신규는 auth_uid 가 NULL 일 수 있다 → email 매칭 절 필수).
--                        타인 행 읽기 2곳(코멘트 작성자 email·데일리 생성의 master auth_uid)
--                        → "마스터 전용" 안은 전면 장애, 채택 금지.
--   · worklog_sections : 일반 멤버 경로 의존(데일리 생성 시드·QuickTodo·섹션 리프레시).
--   · workspaces / workspace_groups / page_type_access : 프론트 읽기 0건 → 회귀 위험 사실상 없음.
--
-- ★guardian 지적 반영: workspaces·workspace_groups·page_type_access 에는 `*_write` **FOR ALL**
--   정책(USING is_master())이 이미 있고 FOR ALL 은 SELECT 에도 걸린다 → 실효 조건은
--   `(is_staff() AND viewer) OR is_master()`. 안전망이며 구멍 아님.
--   ※단 그 FOR ALL 정책들도 §10.2 규범상 is_staff() 결합 대상이다 → STEP 2-F 참조.

BEGIN;

-- 2-A) app_users — 직원 명단·이메일(PII).
-- ══════════════════════════════════════════════════════════════════════════
-- ★★ guardian 2회차 🔴 수정 — 자기 행 매칭을 is_staff() **밖으로** 뺀다 ★★
-- ══════════════════════════════════════════════════════════════════════════
-- 틀린 초안: `is_staff() AND (viewer OR 자기행)` ← 자기 행 읽기까지 audience 게이트에 묶었다.
-- 왜 치명이었나(guardian 재현 경로):
--   ① 신규 입사자 첫 로그인 → audience 미태깅(태깅 코드가 아직 없다) + self-insert 는 가드가
--      status='pending' 으로 강제 → `is_staff()` 폴백도 status='active' 요구라 **false**.
--   ② 그러면 자기 행조차 0 rows → useAuth.checkUserInfo 가 `status: null` 반환.
--   ③ App.jsx 승인 게이트 `if (!isMaster && userStatus && userStatus !== 'active')` 가
--      **userStatus=null 때문에 통째로 스킵** → "승인 대기" 화면이 안 뜨고 본 앱이 렌더된다.
--   ④ 게다가 `pages_insert_worklog` 는 원래 `auth.uid() IS NOT NULL` 만 보므로
--      **미승인 신규 가입자가 데일리·캘린더를 실제로 생성·사용**할 수 있게 된다.
--   → 즉 조이려던 정책이 오히려 **승인 게이트를 무력화**한다. `migrate-dynamic-master.sql` 이
--      "자기 상태 확인을 위해 app_users SELECT 개방"이라 적어둔 과거 결정을 되돌리는 회귀였다.
-- 판단: **자기 행 열람은 PII 유출이 아니라 "본인 상태 확인"** 이므로 audience 게이트 대상이 아니다.
--   §10.2 규범2(bare authenticated 금지)의 취지는 **타인 데이터 전체 개방** 차단이며,
--   자기 행 한정 조회는 코드베이스 전역에서 통용되는 `auth.uid()=user_id` 패턴과 동급의 안전 예외다.
-- ★형제 정책 통합: 기존 `Users can view own record`(=`auth.uid()=auth_uid`)는 아래 조건의
--   부분집합이므로 **삭제**한다(설계서 규범: 테이블·cmd 당 PERMISSIVE 정책 1개).
DROP POLICY IF EXISTS "Authenticated can view users" ON app_users;
DROP POLICY IF EXISTS "Users can view own record" ON app_users;
CREATE POLICY app_users_select ON app_users
  FOR SELECT TO authenticated
  USING (
    auth_uid = auth.uid()                                            -- 자기 행(uid) — audience 무관
    OR lower(email) = lower(auth.jwt() ->> 'email')                  -- 자기 행(부트스트랩 email 매칭)
    OR (is_staff() AND can_in_workspace(current_workspace(), 'viewer'))  -- 동료 전체 열람은 staff+viewer만
  );

-- ※형제 정책 확인 완료: 대상 5개 테이블에 위보다 넓은 형제 PERMISSIVE SELECT 정책은 없다
--   (workspaces/workspace_groups/page_type_access 의 형제는 `is_master()` FOR ALL,
--    worklog_sections 는 단일, app_users 는 2-A 에서 통합 완료).

-- 2-B) worklog_sections — 업무일지 섹션(내부 업무 정보).
--   ※행 단위 visibility('all'|'master') 정교화는 의도적으로 범위 밖(현재도 전원 열람 = 상태 유지).
DROP POLICY IF EXISTS worklog_sections_select ON worklog_sections;
CREATE POLICY worklog_sections_select ON worklog_sections
  FOR SELECT TO authenticated
  USING (is_staff() AND can_in_workspace(current_workspace(), 'viewer'));

-- 2-C) workspaces — 행 자체가 워크스페이스이므로 id 로 판정.
DROP POLICY IF EXISTS workspaces_select ON workspaces;
CREATE POLICY workspaces_select ON workspaces
  FOR SELECT TO authenticated
  USING (is_staff() AND can_in_workspace(id, 'viewer'));

-- 2-D) workspace_groups — 소속 워크스페이스로 판정.
DROP POLICY IF EXISTS workspace_groups_select ON workspace_groups;
CREATE POLICY workspace_groups_select ON workspace_groups
  FOR SELECT TO authenticated
  USING (is_staff() AND can_in_workspace(workspace_id, 'viewer'));

-- 2-E) page_type_access — 권한 레지스트리(정책 메타).
DROP POLICY IF EXISTS pta_select ON page_type_access;
CREATE POLICY pta_select ON page_type_access
  FOR SELECT TO authenticated
  USING (is_staff() AND can_in_workspace(current_workspace(), 'viewer'));

COMMIT;

-- 2-F) ★범위 밖(별건, 규모 보고용): §10.2 장치2를 **전면** 적용하려면 이 5개로는 부족하다.
--   현재 public 스키마의 authenticated 정책 48개는 **전부** audience 조건이 없다(audience 자체가
--   방금 생겼으므로 당연). 즉 "bare authenticated 금지" 규범의 완전 이행 = 48개 일괄 정렬 마이그가
--   따로 필요하다. 본 파일은 유출 위험이 실재하는 무조건 SELECT 5개만 우선 처리한다.
--   → 후속 과제로 등록 권장(내부 스키마 API 노출 분리(장치3)·Edge 규범(장치4)도 미이행).


-- ══════════════════════════════════════════════════════════════════════════
-- STEP 3 — (후속) 과도기 폴백 제거 = §10.2 장치1 완성
-- ══════════════════════════════════════════════════════════════════════════
-- ★★ 차단 전제(guardian 2회차 신규 발견) — 이거 없이 STEP 3 적용 금지 ★★
--   현재 코드베이스에 **audience 를 세팅하는 경로가 아예 없다**(addUser·ensureAppUser·Edge 전수 grep 0건).
--   폴백을 제거하면 STEP 3 이후 **입사하는 신규 직원은 is_staff() 가 영구 false** → 앱을 못 쓴다.
--   따라서 STEP 3 선행조건:
--     ⓐ 신규 직원 승인 경로(updateUserStatus/updateUserRole)가 `auth.users.app_metadata.audience='staff'`
--        를 함께 세팅하도록 구현(Admin API 또는 Edge Function — 클라이언트에서 직접 못 씀).
--     ⓑ 그 경로로 실제 1명 태깅 성공을 확인.
--     ⓒ 전 직원 세션 토큰 회전 확인(재로그인 또는 1시간 경과 후 정상 동작).
--   ★ⓐ 미구현 상태로 폴백을 지우면 온보딩이 막히고, 구 JWT 세션도 즉시 차단된다.
--
-- CREATE OR REPLACE FUNCTION is_staff()
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
-- AS $$ SELECT auth.jwt() -> 'app_metadata' ->> 'audience' = 'staff'; $$;
--
-- 이후엔 app_users 에 이름만 있고 audience 태깅이 없는 계정은 아무것도 못 본다(의도).


-- ══════════════════════════════════════════════════════════════════════════
-- ★적용 전 MUST-DO (guardian 선행조건)
-- ══════════════════════════════════════════════════════════════════════════
-- (1) 정책명 드리프트 재확인 — 적용 **직전** 실행. 아래 5개와 정확히 일치해야 한다.
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--    WHERE schemaname='public'
--      AND tablename IN ('app_users','worklog_sections','workspaces','workspace_groups','page_type_access')
--    ORDER BY tablename, cmd;
--
-- (2) "grant 없는 로그인 계정" 실측 — ★`SET LOCAL ROLE authenticated` 만으로는 안 된다.
--     그 방법은 auth.uid()/auth.jwt() 가 비어 **익명**을 테스트하는 것이다. 실제 비활성 계정
--     세션(또는 request.jwt.claims GUC 주입)으로 확인한다. 기대값:
--       · app_users → **1 rows**(자기 행만)  ← 0 rows 가 아니다(의도된 동작)
--       · worklog_sections / workspaces / workspace_groups / page_type_access → 0 rows
--
-- (3) ★신설: STEP 1 을 먼저 적용하고 **직원 스모크 통과**를 확인한 뒤에 STEP 2 로 넘어간다.
--     STEP 1·2 를 한 번에 밀지 말 것(장애 시 원인 분리가 안 된다).
--
-- ══════════════════════════════════════════════════════════════════════════
-- 적용 후 검증
-- ══════════════════════════════════════════════════════════════════════════
-- ① SELECT count(*) FROM pg_policies WHERE schemaname='public' AND qual='true';   -- 기대 0
-- ② 실제 직원 세션 스모크: 로그인(useAuth 부트스트랩) · 데일리 생성 · QuickTodo 상단바 ·
--    코멘트 작성자 이메일 표시 · 자리후/급여 위성 로드.
-- ③ 위 MUST-DO (2) 를 사후에도 동일 기대값으로 재확인.
-- ④ is_staff() 폴백 의존도 확인: audience 를 가진 세션에서도 정상인지(폴백 없이 통과하는지).
--
-- ══════════════════════════════════════════════════════════════════════════
-- ★적용 직후 필수 후속 2단계 (2026-08-02 전수 감사 결과 편입) — 이걸 빼면 하드닝이 반쪽이다
-- ══════════════════════════════════════════════════════════════════════════
-- ⓐ **짝 파일 적용**: `migrate-fix-grants-sync-status-parity.sql` 을 같은 세션에서 이어 적용.
--    이유: 이 파일은 `is_master()` 에 status='active' 를 넣지만, `access_can`·`can_in_workspace`·
--    grants 싱크 트리거는 **status 를 보지 않는다**(2026-08-02 함수 본문 전수 실측).
--    ⇒ 이 파일만 적용하면 `can_in_workspace(...,'owner')` 를 쓰는 **9테이블**
--       (goals · payroll_sheets · site_nodes · inventory_days/entries/products ·
--        seat_orders/station_status/workspace_prefs) 에서 **status 게이트가 서지 않는다**.
--       = 퇴사(status='inactive') 처리한 마스터가 급여·재고·사이트구조에 owner 로 잔존.
--    ★이 파일의 1-D 코멘트가 겨냥한 "퇴사 마스터 권한 잔존"이 정작 고위험 표면에서 안 막힌다는 뜻이다
--      (고치는 함수 = is_master, 실제로 뚫린 함수 = can_in_workspace — 서로 다른 함수다).
--    검증: 적용 후 **is_master() 참 집합 == workspace owner grant 집합**(양방향 차집합 0).
--
-- ⓑ **원본 동기화 — 순서의존 2파일 봉인 확인**(지휘부 규율, 적용과 같은 커밋에서):
--    아래 2파일은 **오늘은 안전하지만 이 하드닝 적용 후 재실행되면 하드닝을 조용히 되돌린다.**
--    2026-08-02 에 순서경고 배너를 넣어 뒀다 — 배너가 그대로 있는지 확인하고, 없으면 다시 넣어라.
--      · `migrate-access-tiers-phase-a.sql`
--          → `workspaces_select` · `page_type_access(pta_select)` 를 `using(true)` 로 재생성 = STEP2 무효화.
--      · `migrate-canvas-mapping-fix-rls.sql`
--          → 회수된 `seed_*` 를 `drop function`+create 로 새 OID 발급 ⇒ 기본 ACL(PUBLIC EXECUTE) 원복.
--            (`create or replace` 는 ACL 을 보존하지만 **drop+create 는 보존하지 않는다** — 이 구분이 요점.)
--    ★함께 적용할 함수축 갭 수정: `migrate-fix-create-canvas-pair-exposure.sql`
--      (짝인 `migrate-harden-function-exposure.sql` 이 `create_canvas_pair` 회수를 누락했다.)
--
-- ══════════════════════════════════════════════════════════════════════════
-- ★롤백 — 장애 시 그대로 붙여넣는 완성 SQL (guardian 권고: MTTR 단축)
-- ══════════════════════════════════════════════════════════════════════════
-- 순서 주의: STEP 2 를 먼저 되돌린다(STEP 1 만 지우면 is_staff() 가 사라져 정책이 전원 차단).
--
-- ── R1. STEP 2 원복(정책을 원래의 무조건 허용으로) ──────────────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS app_users_select ON app_users;
-- CREATE POLICY "Authenticated can view users" ON app_users FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Users can view own record"   ON app_users FOR SELECT TO authenticated USING (auth.uid() = auth_uid);
-- DROP POLICY IF EXISTS worklog_sections_select ON worklog_sections;
-- CREATE POLICY worklog_sections_select ON worklog_sections FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS workspaces_select ON workspaces;
-- CREATE POLICY workspaces_select ON workspaces FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS workspace_groups_select ON workspace_groups;
-- CREATE POLICY workspace_groups_select ON workspace_groups FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS pta_select ON page_type_access;
-- CREATE POLICY pta_select ON page_type_access FOR SELECT TO authenticated USING (true);
-- COMMIT;
--
-- ── R2. STEP 1 원복(필요할 때만) ────────────────────────────────────────────
-- BEGIN;
-- -- is_master() 원복(status 조건 제거)
-- CREATE OR REPLACE FUNCTION is_master() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path = public AS $$
--   SELECT EXISTS (SELECT 1 FROM app_users WHERE lower(email)=lower(auth.jwt()->>'email') AND role='master');
-- $$;
-- -- 자기삽입 정책 원복(중복 2개 형태로)
-- DROP POLICY IF EXISTS app_users_self_insert ON app_users;
-- CREATE POLICY "Users can self-insert own record" ON app_users FOR INSERT TO authenticated
--   WITH CHECK (lower(email) = lower(auth.jwt() ->> 'email'));
-- -- anon INSERT grant 복원(권장하지 않음 — 필요할 때만)
-- -- GRANT INSERT ON public.app_users TO anon;
-- -- audience 태깅 제거 + 헬퍼 삭제
-- UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data - 'audience';
-- DROP FUNCTION IF EXISTS is_staff();
-- DROP FUNCTION IF EXISTS is_customer();
-- COMMIT;
-- ══════════════════════════════════════════════════════════════════════════
