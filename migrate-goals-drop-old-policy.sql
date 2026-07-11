-- migrate-goals-drop-old-policy.sql
-- ============================================================================
-- ✅ 적용됨 — 2026-07-11 (C-1, 유저 진행 지시). payroll C-P ③ 복제.
-- goals 구 is_master 정책 제거 → goals_ws_owner_v2(can_in_workspace owner) 단독 수렴.
-- 선결 충족: grants-sync 트리거·권한가드 적용됨(C-P 배치), 적용 직전 패리티 대칭차집합=0, goals 0행.
-- 롤백: CREATE POLICY goals_master_all ON goals FOR ALL TO public USING (is_master()) WITH CHECK (is_master());
-- ============================================================================
DROP POLICY IF EXISTS goals_master_all ON goals;
