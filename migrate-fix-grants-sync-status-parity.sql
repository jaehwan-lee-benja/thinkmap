-- migrate-fix-grants-sync-status-parity.sql
-- ============================================================================
-- ★미적용 (2026-08-02 신설) — 하드닝 갭 수정 ①/②. **`migrate-rls-harden-unconditional-select.sql`
--   STEP1과 한 세션에서 함께** 적용한다(단독 적용 금지 — 이유는 §순서).
-- ============================================================================
-- ■ 갭의 성격 — "트리거 버그"가 아니라 **선언된 패리티 계약의 한쪽만 바뀐 것**
--   `migrate-grants-sync-trigger.sql` 머리말이 계약을 명시한다:
--     "★패리티 규율: owner grant 집합 = is_master()(=role='master', status 무관) 와 일치해야 함"
--   즉 트리거의 status 무관 동작은 **의도된 미러링**이었고, 당시엔 옳았다.
--   그런데 RLS 하드닝이 `is_master()`에 `status='active'`를 추가해 **계약의 한쪽만 조인다.**
--   원본(트리거)이 따라가지 않으면 거울이 깨진다 ⇒ 이 파일이 나머지 한쪽이다.
--   ※이것이 지휘부 "원본 동기화 규율"의 함수판 사례다(회수가 아니라 강화에서 발생).
--
-- ■ 왜 문제인가 — 하드닝을 적용해도 **의도한 게이트가 안 선다**
--   `access_can()`·`can_in_workspace()`·이 트리거 어디도 `app_users.status`를 참조하지 않는다
--   (2026-08-02 함수 본문 전수 실측). 따라서 `is_master()`만 조이면:
--     · `is_master()` 직접호출 경로 → 게이트 섬 ✅
--     · `can_in_workspace(...,'owner')` 경로 → **게이트 안 섬** ❌
--   그리고 오프보딩이 실제로 겨냥해야 할 고위험 표면이 전부 후자다 —
--   라이브 실측 9테이블: goals · payroll_sheets · site_nodes · inventory_days · inventory_entries
--   · inventory_products · seat_orders · seat_station_status · seat_workspace_prefs.
--   ⇒ 퇴사 처리(status='inactive')된 마스터가 **급여·재고·사이트구조에 계속 owner로 접근**한다.
--   ★하드닝 파일 자신의 코멘트가 "퇴사 마스터 권한 잔존"을 결함으로 짚어놓고 이 표면은 안 건드린다.
--
-- ■ 현재 영향 규모(2026-08-02 실측): `app_users WHERE role='master' AND status IS DISTINCT FROM 'active'`
--   = **0행**. ⇒ 오늘 적용해도 **접근 회귀 0**. 지금은 잠복이고, 첫 오프보딩 순간 발현한다.
--   (= 지금이 고치기 가장 싼 시점이다.)
--
-- ■ 안전: 트리거 함수 본문 교체(`create or replace`, 시그니처 불변 ⇒ ACL 보존) + 스테일 grant 정리 1문.
--   파괴적 DDL 없음. 롤백은 §롤백.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §0. DRY-RUN (변경 없음 — 적용 전 반드시 실행해 0행/기대값 확인)
-- ---------------------------------------------------------------------------
-- (a) 이 변경으로 owner grant 를 잃게 될 주체 = 비활성 마스터. 기대 0행.
--     0이 아니면 **멈추고 보고**하라(실사용자 권한이 즉시 사라진다).
--     SELECT au.email, au.role, au.status
--       FROM app_users au
--      WHERE au.role = 'master' AND au.status IS DISTINCT FROM 'active';
--
-- (b) 실제로 삭제될 grants 행 미리보기. (a)와 같은 수여야 한다.
--     SELECT g.subject_user_id, g.capability, au.email, au.status
--       FROM grants g
--       JOIN app_users au ON au.auth_uid = g.subject_user_id
--      WHERE g.scope_type = 'workspace' AND g.scope_id = current_workspace()
--        AND g.capability = 'owner'
--        AND au.role = 'master' AND au.status IS DISTINCT FROM 'active';
--
-- (c) 계약 상대편 확인 — 하드닝 적용 전이면 is_master() 본문에 status 조건이 **없어야** 한다.
--     SELECT prosrc LIKE '%status%' AS is_master_has_status
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'is_master';

BEGIN;

-- ---------------------------------------------------------------------------
-- §1. 트리거 함수 — master 분기에 status 게이트 추가(계약 재정렬)
--     변경점은 단 두 곳: ⓐ master 분기 조건에 `AND NEW.status = 'active'`
--                        ⓑ 머리 주석의 패리티 문안 갱신
--     그 외 본문(subject 해석·[C] 옛 subject 회수·ON CONFLICT 타겟)은 라이브와 동일하게 보존한다.
-- ---------------------------------------------------------------------------
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

  -- ★패리티 규율(2026-08-02 갱신): owner grant ⟺ role='master' **AND status='active'**.
  --   근거 = 하드닝판 is_master() 가 status='active' 를 요구하도록 조여졌다. 거울을 맞춘다.
  --   (구 문안 "status 무관"은 구 is_master() 와의 패리티였고, 그 전제가 사라졌다.)
  IF NEW.role = 'master' AND NEW.status = 'active' THEN
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
    -- 비active(pending/inactive) → 마스터든 아니든 워크스페이스 grant 제거.
    -- ★이 분기가 오프보딩을 실제로 닫는 지점이다(종전엔 마스터가 위 분기로 빠져나갔다).
    DELETE FROM grants WHERE subject_user_id = v_uid AND scope_type='workspace' AND scope_id = v_ws;
  END IF;

  RETURN NEW;
END;
$$;

-- 트리거 자체는 재생성하지 않는다(라이브 trg_sync_workspace_grant 가 이 함수를 가리키고 있고
-- AFTER INSERT OR UPDATE OF role,status,email,auth_uid 감시 목록도 그대로 유효).

-- ---------------------------------------------------------------------------
-- §2. 스테일 정리 — 트리거는 "앞으로"만 고친다. 이미 쌓인 행은 여기서 1회 정리.
--     §0(b) 미리보기와 같은 행이어야 한다(2026-08-02 기준 0행 예상).
-- ---------------------------------------------------------------------------
DELETE FROM grants g
 USING app_users au
 WHERE au.auth_uid = g.subject_user_id
   AND g.scope_type = 'workspace'
   AND g.scope_id   = current_workspace()
   AND g.capability = 'owner'
   AND au.role   = 'master'
   AND au.status IS DISTINCT FROM 'active';

COMMIT;

-- ============================================================================
-- §검증 — ★통과조건은 쌍이다(⑴금지 술어 false ∧ ⑵의도된 경로 true). ⑴만 보면 기능정지를 못 잡는다.
-- ----------------------------------------------------------------------------
-- ⑴ 금지: 비활성 마스터가 owner grant 를 보유하지 않는다. 기대 **0행**.
--     SELECT count(*) FROM grants g JOIN app_users au ON au.auth_uid = g.subject_user_id
--      WHERE g.scope_type='workspace' AND g.scope_id=current_workspace() AND g.capability='owner'
--        AND au.role='master' AND au.status IS DISTINCT FROM 'active';
--
-- ⑵ 의도된 경로: **활성 마스터는 owner grant 를 그대로 보유한다.** 기대 = 활성 마스터 수와 동일
--    (적용 전후 수치가 같아야 한다 — 줄었다면 회수 성공이 아니라 기능 정지다).
--     SELECT count(*) FILTER (WHERE g.capability='owner') AS owner_grants,
--            (SELECT count(*) FROM app_users WHERE role='master' AND status='active') AS active_masters
--       FROM grants g JOIN app_users au ON au.auth_uid = g.subject_user_id
--      WHERE g.scope_type='workspace' AND g.scope_id=current_workspace()
--        AND au.role='master' AND au.status='active';
--
-- ⑶ 거울 대조: 하드닝 적용 **후** is_master() 참 집합 == owner grant 집합(양방향 차집합 0).
--     이 술어가 이 파일의 존재 이유다 — 한쪽만 조여지면 여기서 어긋난다.
--
-- ⑷ 스모크: 테스트 계정 role='master' 로 status active↔inactive 토글 →
--     grants owner 행이 생성/삭제되는지 확인 후 **원복**. (라이브 운영 계정으로 하지 말 것.)
--
-- §순서 — ★단독 적용 금지
--   이 파일과 `migrate-rls-harden-unconditional-select.sql` STEP1 은 **같은 계약의 양쪽**이다.
--   한쪽만 적용하면 그 사이 구간에서 판정이 갈린다(오늘은 해당자 0명이라 무해하나, 규율상 함께 간다).
--   권장: 하드닝 STEP1 → 이 파일 → ⑶ 거울 대조. 둘 다 끝나야 "적용 완료".
--
-- §롤백
--   `migrate-grants-sync-trigger.sql` 의 함수 본문을 그대로 다시 실행하면 구 동작으로 복귀한다.
--   ★단 §2가 삭제한 grants 행은 **원복되지 않는다**(오늘 기준 0행이라 실질 무영향).
--   되돌릴 일이 생기면 "왜 비활성 마스터가 owner 여야 하는가"를 먼저 답하라.
--   답이 없으면 롤백 대상은 이 파일이 아니라 롤백하려는 판단이다.
-- ============================================================================
