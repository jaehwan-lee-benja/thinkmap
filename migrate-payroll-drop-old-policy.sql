-- migrate-payroll-drop-old-policy.sql
-- ============================================================================
-- ✅ 적용됨 — 2026-07-11 (유저 "모두 승인", migration=payroll_drop_old_master_policy).
--   선결 충족 후 적용: grants-sync 트리거 + 권한가드 적용됨, 패리티 대칭차집합=0 재확인.
--   결과: payroll_sheets = payroll_sheets_ws_owner_v2(can_in_workspace owner) 단독. 구 is_master 정책 제거됨.
-- ============================================================================
-- DB 트랙 — ACCESS-TIERS Phase C-P ③ (payroll_sheets 구 is_master 정책 제거)
-- payroll 파일럿 병행(_v2) 검증 통과 후, 구 정책을 제거해 워크스페이스 grant 단독으로 수렴.
--
-- 선결(모두 충족, 2026-07-11 재확인):
--   - payroll_sheets_ws_owner_v2 (can_in_workspace(owner)) 2026-07-09 적용, 2일 병행 무사고.
--   - 패리티 재확인: 구(master)=2 · 신(ws owner grant)=2 · 대칭차집합=0 (양 경로 동일 집합).
--   - payroll_sheets 데이터 0행(접근 상실 리스크 실질 없음).
-- 위험: 접근이 좁아질 수 있는 유일한 순간(구 OR 절 제거). _v2 단독으로 마스터 2명 커버됨을 위 패리티로 확인.
-- ============================================================================

-- ★적용 직전 패리티 재확인(0행이어야 진행) — 아래를 먼저 실행해 symmetric_diff=0 확인:
-- WITH ws AS (SELECT id FROM workspaces LIMIT 1),
-- old AS (SELECT u.id FROM app_users au JOIN auth.users u ON LOWER(u.email)=LOWER(au.email) WHERE au.role='master'),
-- new AS (SELECT subject_user_id id FROM grants WHERE scope_type='workspace' AND scope_id=(SELECT id FROM ws) AND capability='owner')
-- (SELECT 'old_only' s,id FROM old EXCEPT SELECT 'old_only',id FROM new)
-- UNION ALL (SELECT 'new_only' s,id FROM new EXCEPT SELECT 'new_only',id FROM old);

-- ③ 제거
DROP POLICY IF EXISTS payroll_sheets_master_all ON payroll_sheets;

-- ============================================================================
-- 롤백 (접근 이상 발견 시 즉시 재생성 — 구 정책 원형 복구):
-- CREATE POLICY payroll_sheets_master_all ON payroll_sheets
--   FOR ALL TO public
--   USING (is_master()) WITH CHECK (is_master());
-- ============================================================================
-- 적용 후 검증: payroll_sheets 정책이 payroll_sheets_ws_owner_v2 단독인지 확인.
--   SELECT policyname FROM pg_policies WHERE tablename='payroll_sheets';  -- 1행(_v2)만
-- ============================================================================
