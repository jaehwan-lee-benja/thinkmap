-- ============================================================================
-- Phase 0.7 회귀표 BEFORE 기준 확정 — LIVE RLS 정책/헬퍼 전수 덤프 (읽기만)
-- 작성: 2026-06-11 · PLAN-daily-carryover-authority.md Phase 0.7
-- 목적: pages / daily_blocks / worklog_sections 의 *실제 적용중* 정책을 그대로 떠서
--       회귀표 BEFORE 열을 마이그레이션 파일 추정이 아니라 LIVE 진실에 못박는다.
--       + board-membership 헬퍼가 이미 존재하는지(중복 정의 방지)도 확인.
-- 실행: SQL Editor 전체 복붙 후 Run. (RLS 변경 없음)
-- ============================================================================

-- 1) 적용중인 정책 (pages / daily_blocks / worklog_sections)
SELECT
  tablename,
  policyname,
  cmd,                        -- SELECT / INSERT / UPDATE / DELETE / ALL
  roles,                      -- 적용 롤 (보통 {authenticated})
  qual        AS using_expr,  -- USING 절
  with_check  AS check_expr   -- WITH CHECK 절
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pages','daily_blocks','worklog_sections')
ORDER BY tablename,
         CASE cmd WHEN 'SELECT' THEN 1 WHEN 'INSERT' THEN 2
                  WHEN 'UPDATE' THEN 3 WHEN 'DELETE' THEN 4 ELSE 5 END,
         policyname;

-- 2) RLS 활성화 여부 (force 포함)
SELECT relname AS table, relrowsecurity AS rls_on, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname IN ('pages','daily_blocks','worklog_sections','worklog_board_members')
ORDER BY relname;

-- 3) 권한 판정 헬퍼 함수 존재 현황 (board-membership 헬퍼 중복정의 방지)
SELECT proname AS func, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'is_master',
    'is_linked_account', 'is_linked_account_viewer', 'get_linked_accounts',
    'is_board_member', 'is_board_member_of_page'
  )
ORDER BY proname;
