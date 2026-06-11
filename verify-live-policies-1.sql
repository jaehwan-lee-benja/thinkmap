-- ============================================================================
-- Phase 0.7 — LIVE 정책 단독 덤프 (#1만, 결과 1개라 Editor에 확실히 표시됨)
-- 실행: 전체 복붙 후 Run. (읽기만, RLS 변경 없음)
-- ============================================================================
SELECT
  tablename,
  policyname,
  cmd,                        -- SELECT / INSERT / UPDATE / DELETE / ALL
  qual        AS using_expr,  -- USING 절 (읽기/대상행 조건)
  with_check  AS check_expr   -- WITH CHECK 절 (쓰기 허용 조건)
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pages','daily_blocks')
ORDER BY tablename,
         CASE cmd WHEN 'SELECT' THEN 1 WHEN 'INSERT' THEN 2
                  WHEN 'UPDATE' THEN 3 WHEN 'DELETE' THEN 4 ELSE 5 END,
         policyname;
