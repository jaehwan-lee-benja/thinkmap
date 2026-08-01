-- ============================================================================
-- 멤버십 키오스크 — thinkmap 측 신설 (SITE-SPLIT Phase 6)
--   ① is_store() 도메인 헬퍼 + app_users 매장 표식(직원 게이트)
--   ①-b ★self-escalation 가드 확장 — 위 컬럼과 같은 트랜잭션 필수(아래 CRITICAL 참조)
--   ② membership_kiosk_audit (프록시 Edge 감사·레이트리밋 근거)
--
-- ★적용 보류(초안). 하드게이트: supabase-guardian 검수 → 유저 승인 → thinkmap 통합세션 적용.
--   회원 데이터는 crm 소유(multi-store). 이 마이그는 thinkmap DB(sqisntxippjzcekyhqyo)에만 —
--   회원 테이블 없음(진실원천 crm 단일). 감사 테이블엔 민감 PII 미저장(operator+action+member_id만).
-- 정본: docs/MEMBERSHIP-KIOSK-SPEC.md §3.3·§5.1. 선례: is_master()(migrate-dynamic-master.sql).
--
-- ⚠️ 권한등급 결정 대기(§5.1): 아래는 "app_users.is_store bool 컬럼 + is_store() 헬퍼" 안.
--   role enum 확장안으로 갈 경우 이 파일을 그에 맞게 교체. roster 선례대로 access-tiers 아닌 도메인 헬퍼.
--
-- 🔴 CRITICAL(guardian 2026-07-24): app_users 의 self-service RLS(fix-linked-account-rls.sql)는
--   **컬럼 제한이 없어** 인증 계정이 자기 row 의 임의 컬럼을 self-write 할 수 있다. 기존 가드
--   트리거 guard_app_users_privilege()(migrate-app-users-privilege-guard.sql)는 role/status 만
--   감시한다. is_store 컬럼을 그냥 추가하면 **아무 계정이나 self-update({is_store:true})로 직원
--   게이트를 전면 우회**(매장 태블릿 없이도)한다. → 컬럼 추가와 **동일 트랜잭션**에서 가드를
--   is_store 까지 확장한다(①-b). 둘을 분리하면 그 사이 창이 백도어가 됨.
-- ============================================================================

BEGIN;

-- ── ① 매장 계정 표식 + is_store() 헬퍼 ──────────────────────────────────────
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_store boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app_users.is_store IS
  '매장 키오스크 계정 여부. true=멤버십 키오스크 조회/적립/가입 프록시 Edge 통과 허용(최소권한, 다른 앱 권한 함의 없음). 비마스터 self-write 는 guard 트리거가 차단. MEMBERSHIP-KIOSK-SPEC §5.1.';

-- ── ①-b ★가드 트리거 확장 — is_store self-escalation 차단 (컬럼과 같은 트랜잭션) ─────────
-- 기존(migrate-app-users-privilege-guard.sql, 적용됨)에 is_store 감시를 더한다. role/status 로직 보존.
-- 정상 흐름 무영향: ensureAppUser self-insert 는 is_store 미지정(DEFAULT false=가드 강제값과 동일),
--   재로그인 auth_uid UPDATE 는 is_store 무변경 → 통과. 매장계정 부여는 마스터(useUsers)만.
CREATE OR REPLACE FUNCTION public.guard_app_users_privilege()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 비마스터의 self-insert 는 무권한 사용자(pending)로만 허용 + 매장표식 금지. 마스터는 자유.
    IF NOT is_master() THEN
      NEW.role     := 'user';
      NEW.status   := 'pending';
      NEW.is_store := false;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: 비마스터가 role/status/is_store 를 바꾸려 하면 차단(auth_uid 등 다른 컬럼 갱신은 허용).
  IF (NEW.role     IS DISTINCT FROM OLD.role
      OR NEW.status   IS DISTINCT FROM OLD.status
      OR NEW.is_store IS DISTINCT FROM OLD.is_store)
     AND NOT is_master() THEN
    RAISE EXCEPTION 'app_users.role/status/is_store 변경은 마스터만 가능합니다. (self-privilege change 차단)';
  END IF;
  RETURN NEW;
END;
$$;

-- 트리거는 기존것 유지(BEFORE INSERT OR UPDATE). 함수만 교체돼도 트리거가 새 함수 본문을 쓴다.
-- (재적용 안전을 위해 명시적으로 재생성)
DROP TRIGGER IF EXISTS trg_guard_app_users_privilege ON app_users;
CREATE TRIGGER trg_guard_app_users_privilege
  BEFORE INSERT OR UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION public.guard_app_users_privilege();

-- 호출자(auth.uid) 가 매장 계정인지. 프록시 Edge 가 is_master() OR is_store() 로 게이트.
CREATE OR REPLACE FUNCTION is_store()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT au.is_store FROM app_users au WHERE au.auth_uid = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION is_store() IS
  '현재 로그인 계정이 매장 키오스크 계정인지. 멤버십 키오스크 직원 게이트 전용(최소권한).';

-- ── ② 키오스크 감사/레이트리밋 로그 ────────────────────────────────────────
-- 민감 PII 미저장: 번호·이름 없음. operator(app_user)·action·member_id(crm uuid)·시각만.
CREATE TABLE IF NOT EXISTS membership_kiosk_audit (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator   uuid NOT NULL,                    -- auth.users.id (직원 세션)
  action     text NOT NULL,                    -- 'lookup' | 'event_claim' | 'signup'
  member_id  uuid,                             -- crm 회원 uuid(조회/가입은 NULL 가능)
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_kiosk_audit_action_chk
    CHECK (action IN ('lookup','event_claim','signup'))
);

-- 레이트리밋 카운트용(operator+action+최근창).
CREATE INDEX IF NOT EXISTS membership_kiosk_audit_op_action_time
  ON membership_kiosk_audit (operator, action, created_at DESC);

COMMENT ON TABLE membership_kiosk_audit IS
  '멤버십 키오스크 프록시 Edge 호출 감사·레이트리밋 근거. 민감 PII 미저장(번호/이름 없음). service_role(Edge)만 기록.';

-- RLS: service_role(Edge)만. 브라우저 직접 접근 없음(마스터 조회는 필요시 별도 정책 추가).
ALTER TABLE membership_kiosk_audit ENABLE ROW LEVEL SECURITY;
-- service_role 은 RLS 우회 → 별도 정책 불필요. (마스터 감사뷰가 필요하면 SELECT USING(is_master()) 추가.)

-- ── ③ store 계정 프로비저닝 (유저 결정 2026-07-24: sarurufarm.partner@gmail.com) ──────────
-- pre-insert(이메일 사전삽입) 방식: ensureAppUser(useAuth.js)가 email 로 매칭하므로, 매니저가
--   태블릿에서 첫 로그인하면 이 row 를 찾아 auth_uid 만 바인딩한다(is_store 보존 → 가드 UPDATE 통과).
--   로그인 순서 무관(ON CONFLICT 로 로그인 선행 시 플래그만 부여) = 멱등.
-- ★최소권한: status='pending' — 키오스크 게이트(is_store())는 status 무관이라 태블릿 조작엔 충분하고,
--   status='active' 가 주는 워크스페이스 editor grant(grants-sync)는 자동 부여하지 않는다. 매장 계정은
--   "키오스크 전용"이 원칙(§5.1). 매니저가 모선 접근도 필요하면 마스터가 별도 승인(status 승격).
-- ★가드 우회 필수: 직접 SQL 세션은 JWT 없음 → is_master()=false → 가드가 INSERT 의 is_store 를 false 로
--   강제한다(런북 [[db_grants_sync_and_privilege_guard]]). 트리거를 이 구간만 DISABLE(DISABLE/ENABLE TRIGGER =
--   SHARE ROW EXCLUSIVE 락으로 ROW EXCLUSIVE(INSERT/UPDATE/DELETE)와 충돌 → 동시쓰기 차단, COMMIT 전
--   재ENABLE → 우회 창 없음. 트랜잭셔널이라 롤백 시 트리거 ENABLED 상태 자동 복원).
-- ※이메일은 소문자 리터럴(ensureAppUser 가 email.toLowerCase() 로 매칭). 추가 매장계정 시에도 소문자로.
ALTER TABLE app_users DISABLE TRIGGER trg_guard_app_users_privilege;

INSERT INTO app_users (email, role, status, is_store)
VALUES ('sarurufarm.partner@gmail.com', 'user', 'pending', true)
ON CONFLICT (email) DO UPDATE SET is_store = true, updated_at = now();

ALTER TABLE app_users ENABLE TRIGGER trg_guard_app_users_privilege;

COMMIT;

-- ============================================================================
-- 적용 전 dry-run(guardian §4 — is_store 구멍 실증 + store 대상 확인):
--   SELECT prosrc FROM pg_proc WHERE proname='guard_app_users_privilege';  -- is_store 없으면 구 트리거(이 마이그로 확장됨)
--   SELECT polname, cmd, pg_get_expr(polwithcheck,polrelid) FROM pg_policy WHERE polrelid='app_users'::regclass;
--   SELECT current_workspace();  -- 고정 UUID 반환 확인(grants-sync 전제)
--   -- ★store 대상 row 사전 확인: 이미 존재하면 그 row 에 is_store 만 얹힘 → role/status 확인 후 의도 검증.
--   SELECT id, email, role, status, is_store FROM app_users WHERE LOWER(email)='sarurufarm.partner@gmail.com';
-- 적용 후 스모크(안전한 비마스터 테스트 계정 세션에서):
--   UPDATE app_users SET is_store=true WHERE email=<자기이메일>;  -- → 예외 발생해야 정상(가드 차단)
--   (role/status 도 동일하게 차단 유지 확인)
--   -- store 계정: 첫 로그인 후 status='pending'·is_store=true 유지 + grants 무생성 확인:
--   SELECT role,status,is_store,auth_uid FROM app_users WHERE email='sarurufarm.partner@gmail.com';
--   SELECT * FROM grants WHERE subject_user_id=<그 auth_uid>;   -- 0건이어야 정상(pending=grant 없음)
-- 롤백: 함수를 role/status 만 감시하던 이전 본문으로 되돌리고(migrate-app-users-privilege-guard.sql),
--   DROP FUNCTION is_store(); DROP TABLE membership_kiosk_audit; ALTER TABLE app_users DROP COLUMN is_store;
--   DELETE FROM app_users WHERE email='sarurufarm.partner@gmail.com' AND role='user' AND status='pending';  -- seed 정리(로그인 전이면 안전)
--   ※ 단 is_store 컬럼이 남은 채 가드만 되돌리면 구멍 재발 → 컬럼과 가드는 항상 함께.
-- ============================================================================
