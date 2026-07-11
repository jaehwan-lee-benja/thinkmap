-- migrate-grants-sync-trigger.sql
-- ============================================================================
-- ✅ 적용됨 — 2026-07-11 (유저 "모두 승인", 최종 guardian 통과, migration=grants_sync_trigger).
--   privilege-guard 와 함께 적용됨(순서: guard→sync→검증). ON CONFLICT 타겟 EXPLAIN 매칭 확인 후 적용.
-- ============================================================================
-- DB 트랙 — ACCESS-TIERS 선결: grants 지속 동기화 자동화
-- 문제: grants 백필(Phase A)은 1회성. 이후 app_users.role/status/auth_uid 변화가 grants 에 반영 안 됨.
--       → 구 is_master 정책 제거(③) 후 신규 마스터가 grants 없이 조용한 접근실패.
-- 해법: app_users 변경 시 워크스페이스 grant 자동 동기화 트리거.
--
-- ★패리티 규율: 구 정책 dual-run 중 owner grant 집합 = is_master()(=role='master', status 무관) 와 일치해야 함.
--   → owner grant ⟺ role='master'(status 무관). editor = active 비마스터(백필 동일).
--
-- guardian 2차 반영:
--   [B] watch 컬럼에 auth_uid 추가 — 관리자 사전초대(addUser status=active,미로그인) → 첫 로그인 시 ensureAppUser 가
--       auth_uid 만 UPDATE. auth_uid 미감시면 그때 트리거 미발동 → owner grant 영영 안 생김. auth_uid 감시로 해소.
--   [D] subject 해석은 NEW.auth_uid 우선(직접·유일), 없을 때만 email→auth.users(백필 정합·미로그인 대비).
--   [C] email/auth_uid 변경으로 subject 가 바뀌면 옛 subject 의 workspace grant 회수(스테일 owner 방지).
--   [E] upsert = ON CONFLICT (uq_grants_subject_scope: subject_user_id,scope_type,scope_id,COALESCE(resource_kind,'')).
--   [F] 롤백은 트리거/함수만 제거 — 트리거 동작 중 반영된 grants row 는 원복 안 됨(운영자 인지).
-- 안전: 순수 추가. 구 is_master 안전망 유지 중이라 무-잠금(접근 넓히기만).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_workspace_grant_for_app_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_old_uid uuid;
  v_ws uuid := current_workspace();
BEGIN
  IF v_ws IS NULL THEN RETURN NEW; END IF;

  -- 대상 auth 계정: auth_uid 우선, 없으면 email 매핑(미로그인 사용자는 둘 다 없어 스킵).
  v_uid := NEW.auth_uid;
  IF v_uid IS NULL THEN
    SELECT u.id INTO v_uid FROM auth.users u WHERE LOWER(u.email) = LOWER(NEW.email) LIMIT 1;
  END IF;

  -- [C] subject 변경(email/auth_uid 정정) 시 옛 subject 의 workspace grant 회수.
  IF TG_OP = 'UPDATE' THEN
    v_old_uid := OLD.auth_uid;
    IF v_old_uid IS NULL THEN
      SELECT u.id INTO v_old_uid FROM auth.users u WHERE LOWER(u.email) = LOWER(OLD.email) LIMIT 1;
    END IF;
    IF v_old_uid IS NOT NULL AND v_old_uid IS DISTINCT FROM v_uid THEN
      DELETE FROM grants WHERE subject_user_id = v_old_uid AND scope_type='workspace' AND scope_id = v_ws;
    END IF;
  END IF;

  IF v_uid IS NULL THEN RETURN NEW; END IF;  -- auth 계정 아직 없음 → 스킵(첫 로그인 때 auth_uid UPDATE 로 재진입)

  IF NEW.role = 'master' THEN
    -- owner ⟺ role='master' (is_master 미러, status 무관 → dual-run 패리티)
    INSERT INTO grants (subject_user_id, workspace_id, scope_type, scope_id, capability)
      VALUES (v_uid, v_ws, 'workspace', v_ws, 'owner')
    ON CONFLICT (subject_user_id, scope_type, scope_id, COALESCE(resource_kind, ''::text))
      DO UPDATE SET capability = 'owner', updated_at = now();
  ELSIF NEW.status = 'active' THEN
    INSERT INTO grants (subject_user_id, workspace_id, scope_type, scope_id, capability)
      VALUES (v_uid, v_ws, 'workspace', v_ws, 'editor')
    ON CONFLICT (subject_user_id, scope_type, scope_id, COALESCE(resource_kind, ''::text))
      DO UPDATE SET capability = 'editor', updated_at = now();
  ELSE
    -- 비마스터 & 비active(pending/inactive) → 워크스페이스 grant 제거.
    DELETE FROM grants WHERE subject_user_id = v_uid AND scope_type='workspace' AND scope_id = v_ws;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_workspace_grant ON app_users;
CREATE TRIGGER trg_sync_workspace_grant
  AFTER INSERT OR UPDATE OF role, status, email, auth_uid ON app_users
  FOR EACH ROW EXECUTE FUNCTION public.sync_workspace_grant_for_app_user();

-- ============================================================================
-- 적용 후 검증(패리티 0행) + 스모크(테스트계정 role master↔user 토글 → grants owner 생성/삭제 → 원복).
-- 롤백:
--   DROP TRIGGER IF EXISTS trg_sync_workspace_grant ON app_users;
--   DROP FUNCTION IF EXISTS public.sync_workspace_grant_for_app_user();
--   ※ 트리거가 이미 만든/지운 grants row 는 원복 안 됨.
-- ============================================================================
