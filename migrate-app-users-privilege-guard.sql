-- migrate-app-users-privilege-guard.sql
-- ============================================================================
-- ⛔ 보류(적용 금지, 승인 대기) — 2026-07-11. ★보안 수정(권한상승 백도어 차단). 적용 전 guardian 재검수 권장.
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
