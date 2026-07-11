-- migrate-site-nodes-drop-old-policy.sql
-- ============================================================================
-- ✅ 적용됨 — 2026-07-11 (유저 승인). payroll/goals C 패턴 복제.
-- site_nodes 구 is_master 정책 제거 → site_nodes_ws_owner_v2(can_in_workspace owner) 단독 수렴.
-- 선결: grants-sync·권한가드 적용됨, 적용 직전 패리티 대칭차집합=0, site_nodes 7행.
-- 롤백: CREATE POLICY site_nodes_master_all ON site_nodes FOR ALL TO public USING (is_master()) WITH CHECK (is_master());
-- ============================================================================
DROP POLICY IF EXISTS site_nodes_master_all ON site_nodes;
