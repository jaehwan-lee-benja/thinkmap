-- migrate-goals-workspace-policy.sql
-- ============================================================================
-- DB 트랙 — ACCESS-TIERS Phase C-1 (goals) — payroll C-P 패턴의 정확한 복제
-- goals_master_all(is_master ALL)과 병행으로 can_in_workspace(owner) _v2 추가(OR=넓히기만·무-잠금).
-- dashboard 는 별도 테이블 없음(goals 집계 + pages 진입) → goals 테이블만 대상.
-- 전제(2026-07-11 실측): goals 0행, grants-sync 트리거·권한가드 적용됨, ws owner grant=master 2(패리티0).
-- 참조: docs/ACCESS-TIERS-MIGRATION-PLAN.md §C-1. 구조는 migrate-payroll-workspace-policy.sql 과 동일.
-- 롤백: DROP POLICY goals_ws_owner_v2 ON goals;
-- ============================================================================
DROP POLICY IF EXISTS goals_ws_owner_v2 ON goals;
CREATE POLICY goals_ws_owner_v2 ON goals
  FOR ALL
  USING (can_in_workspace(current_workspace(), 'owner'))
  WITH CHECK (can_in_workspace(current_workspace(), 'owner'));
