-- migrate-app-users-privilege-guard.sql
-- ============================================================================
-- ⛔⛔ 재실행 금지 — 이 파일은 **라이브보다 낡았다**. 돌리면 보안이 후퇴한다. (봉인 2026-08-02)
-- ----------------------------------------------------------------------------
-- 아래 "✅ 적용됨" 라벨은 사실이지만, **그 뒤 라이브가 더 조여졌고 이 파일은 갱신되지 않았다.**
-- 2026-08-02 라이브 실측(pg_get_functiondef 문자 대조):
--   · 라이브 guard_app_users_privilege() = role / status / **is_store** 3열 감시 (신형)
--   · 이 파일                            = role / status 2열 감시            (구형, is_store 없음)
--   · 승격 주체 = migrate-membership-kiosk-thinkmap.sql (원본인 이 파일이 아니다)
-- ★재실행 영향: `create or replace`가 트리거 함수 본문을 통째로 구형으로 덮어써
--   **is_store 감시가 사라진다** ⇒ 인증된 아무 계정이나 self-update `{is_store:true}` 로
--   매장 키오스크 게이트를 셀프 승격 가능(그 kiosk 파일의 CRITICAL 주석이 막으려던 바로 그 구멍).
-- ★심각도 = 즉시 익스플로잇. 판정식 "(파일이 푸는 겹) × (나머지 겹이 이미 있는가)" 적용 결과:
--   나머지 겹인 정책 "Users can self-update own auth_uid" 는 `with check (lower(email)=lower(jwt email))`
--   뿐이라 **컬럼 제한이 전혀 없다** ⇒ 이 트리거가 is_store 승격을 막는 **유일한 겹**이다.
--   (아래 원 주석 "문제" 절이 지적한 컬럼-무제한 정책이 바로 그 나머지 겹이다 — 오늘도 그대로다.)
-- ★재실행 규칙: 돌리지 마라. 가드 본문의 정본은 이 파일이 아니라 **라이브 카탈로그**다.
--   가드를 고쳐야 하면 라이브 본문(3열)을 베이스로 새 마이그를 쓰고, 그 커밋에서 이 파일도 동기화하라.
--   ※규율(2026-08-02 확장 제안): 원본 동기화는 "회수 마이그"만이 아니라 **라이브를 조인 모든 마이그**에,
--     특히 **조인 주체가 원본 파일이 아닐 때** 필요하다 — 이 건이 정확히 그 사례다.
-- ============================================================================
-- ✅ 적용됨 — 2026-07-11 (유저 "모두 승인", 최종 guardian 재검수 통과, migration=app_users_privilege_guard). ★보안 수정(권한상승 백도어 차단).
--    ★단 위 봉인 배너 참조 — 적용 이후 라이브가 3열로 승격됨(이 파일은 2열 구형).
-- ============================================================================
-- 문제(supabase-guardian 발견, 기존 취약점):
--   app_users self-insert/self-update 정책("Users can self-insert own record"/"Users can self-update own auth_uid",
--   fix-linked-account-rls.sql)이 **컬럼 제한이 없다**. 인증된 아무 사용자나 PostgREST 로 자기 own row 에
--   `.update({role:'master', status:'active'})` 또는 self-insert 로 role='master' 기입 가능 → is_master() 즉시 통과(전권).
--   지금은 구 is_master 정책이 안전망이라 사후 롤백 가능하나, grants-sync 트리거가 이걸 grants.owner 로 영속화하고
--   C-P③(구 정책 제거) 후엔 grants.owner 가 유일 근거라 실질 백도어가 된다.
-- 해법: BEFORE INSERT/UPDATE 트리거로 **비마스터의 role/status 특권 변경을 차단**(정책은 그대로 두되 트리거로 가드).
--   정상 흐름 무영향: ensureAppUser 신규 self-insert 는 role='user'/status='pending'(가드 기본값과 동일),
--   ensureAppUser 재로그인은 auth_uid 만 UPDATE(role/status 무변경 → 통과), useUsers 의 addUser/역할·상태 변경은 마스터(is_master) → 통과.
-- 안전: 순수 추가. 롤백 = DROP TRIGGER/FUNCTION 2줄.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_app_users_privilege()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 비마스터의 self-insert 는 무권한 사용자(pending)로만 허용. 마스터(addUser)는 자유.
    IF NOT is_master() THEN
      NEW.role   := 'user';
      NEW.status := 'pending';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: 비마스터가 role/status 를 바꾸려 하면 차단(auth_uid 등 다른 컬럼 갱신은 허용).
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status)
     AND NOT is_master() THEN
    RAISE EXCEPTION 'app_users.role/status 변경은 마스터만 가능합니다. (self-privilege change 차단)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_app_users_privilege ON app_users;
CREATE TRIGGER trg_guard_app_users_privilege
  BEFORE INSERT OR UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION public.guard_app_users_privilege();

-- ============================================================================
-- 적용 전 감사(이미 악용됐는지 — 마스터 각 row 의 invited_by/정황 수동 대조):
--   SELECT id, email, role, status, invited_by, created_at FROM app_users WHERE role='master' ORDER BY created_at;
-- 적용 후 스모크(비마스터 세션에서 self-update role=master 시도 → 예외 발생해야 정상, 실제로는 안전한 계정으로).
-- 롤백:
--   DROP TRIGGER IF EXISTS trg_guard_app_users_privilege ON app_users;
--   DROP FUNCTION IF EXISTS public.guard_app_users_privilege();
-- ============================================================================
