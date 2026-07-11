-- migrate-site-nodes-workspace-policy.sql
-- ============================================================================
-- DB 트랙 — ACCESS-TIERS 마스터전용 테이블 수렴: site_nodes (payroll/goals C 패턴 복제)
-- site_nodes_master_all(is_master ALL) 병행으로 can_in_workspace(owner) _v2 추가(OR=넓히기만·무-잠금).
-- 전제(2026-07-11): site_nodes 7행(백오피스 레지스트리), grants-sync·권한가드 적용됨, ws owner grant=master 2(패리티0).
-- 롤백: DROP POLICY site_nodes_ws_owner_v2 ON site_nodes;
-- ============================================================================
DROP POLICY IF EXISTS site_nodes_ws_owner_v2 ON site_nodes;
CREATE POLICY site_nodes_ws_owner_v2 ON site_nodes
  FOR ALL
  USING (can_in_workspace(current_workspace(), 'owner'))
  WITH CHECK (can_in_workspace(current_workspace(), 'owner'));
