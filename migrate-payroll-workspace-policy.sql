-- migrate-payroll-workspace-policy.sql
-- ============================================================================
-- DB 트랙 — ACCESS-TIERS Phase C-P 파일럿 (payroll_sheets)
-- is_master() 게이트 → can_in_workspace(current_workspace(),'owner') 로 수렴(병행 추가).
--
-- 방식(안전·가역): 기존 is_master ALL 정책을 **유지한 채** permissive _v2 정책을 OR 로 추가만 한다.
--   Postgres RLS 다중 permissive 정책 = OR → 접근이 축소될 수 없다(마스터는 계속 is_master 로 통과).
--   _v2 는 grants(owner) 경로를 추가로 연다. 며칠 병행·검증(②) 후에만 구정책 제거(③, 별도 마이그).
-- 롤백: DROP POLICY payroll_sheets_ws_owner_v2. (구정책 무변경이라 원복 불필요)
--
-- 전제(프로덕션 확인 2026-07-07, project sqisntxippjzcekyhqyo):
--   - can_in_workspace()/current_workspace() 함수, grants/workspaces 테이블 존재(Phase A 적용).
--   - workspaces=1, ws owner grant=2 = master 2 → 두 경로 집합 동일(② 검증 통과 예상).
-- 참조: docs/ACCESS-TIERS-MIGRATION-PLAN.md §C-P, docs/ACCESS-TIERS-SPEC.md.
-- ============================================================================

-- ① 병행 _v2 정책 추가 (기존 payroll_sheets_master_all [ALL, is_master] 는 그대로 둔다)
DROP POLICY IF EXISTS payroll_sheets_ws_owner_v2 ON payroll_sheets;
CREATE POLICY payroll_sheets_ws_owner_v2 ON payroll_sheets
  FOR ALL
  USING (can_in_workspace(current_workspace(), 'owner'))
  WITH CHECK (can_in_workspace(current_workspace(), 'owner'));

-- ============================================================================
-- ② 검증 (이 마이그 적용 후, 마스터 유저 세션에서 실행 — 0행이어야 통과)
--    두 경로(구 is_master 집합 vs 신 grants-owner 집합)의 대칭차집합이 비어야 한다.
-- ----------------------------------------------------------------------------
-- WITH old AS (
--   SELECT u.id FROM app_users au JOIN auth.users u ON LOWER(u.email)=LOWER(au.email)
--   WHERE au.role='master'),
-- new AS (
--   SELECT subject_user_id AS id FROM grants
--   WHERE scope_type='workspace' AND scope_id=current_workspace() AND capability='owner')
-- (SELECT 'old_only' s, id FROM old EXCEPT SELECT 'old_only', id FROM new)
-- UNION ALL
-- (SELECT 'new_only' s, id FROM new EXCEPT SELECT 'new_only', id FROM old);
-- ============================================================================
-- ③ 제거 (검증 ② 통과 + 며칠 병행 후 별도 마이그로만):
--    DROP POLICY payroll_sheets_master_all ON payroll_sheets;
-- ============================================================================
