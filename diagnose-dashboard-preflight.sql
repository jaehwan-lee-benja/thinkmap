-- ============================================================================
-- 통합 대시보드 — 마이그레이션 적용 전 라이브 DB 사전 점검
--
-- 코드/저장소 SQL 로는 확인했으나 라이브 DB 실제 상태 확인이 필요한 항목.
-- Supabase SQL Editor 에서 한 블록씩 실행해 결과를 확인할 것.
-- (migrate-create-goals.sql / migrate-pages-allow-dashboard.sql 적용 "전" 실행)
-- ============================================================================

-- 1) goals 가 의존하는 함수 존재 확인 — is_master + schedule_touch_updated_at 나와야 정상
--    (goals 는 마스터 전용이라 can_view/can_edit_schedule_owner 는 더 이상 쓰지 않음)
SELECT proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('is_master', 'schedule_touch_updated_at');

-- 2) pages 의 현재 page_type CHECK 제약 정의
--    → dashboard 추가 전 기존 허용값 목록 확인 (payroll 포함 여부 등)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'pages_page_type_chk';

-- 3) pages 기본 정책에 is_master() 바이패스가 있는지 확인
--    → 마스터가 dashboard 페이지를 INSERT/SELECT 할 통로 (worklog 절은 안 건드림)
SELECT polname,
       CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                   WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE polcmd END AS cmd,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS withcheck_expr
FROM pg_policy
WHERE polrelid = 'pages'::regclass
  AND polname IN ('Users can view own or shared pages', 'Users can insert own pages');

-- 4) daily_blocks 의 투두 컬럼명 확인 (todo_completion 집계가 의존)
--    → is_todo / todo_checked / page_date / user_id / deleted_at 존재해야 함
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'daily_blocks'
  AND column_name IN ('is_todo', 'todo_checked', 'page_date', 'user_id', 'deleted_at')
ORDER BY column_name;

-- 5) (참고) goals 테이블이 이미 있는지 — 없어야 신규 생성
SELECT to_regclass('public.goals') AS goals_table;

-- ── 적용 "후" 검증 ─────────────────────────────────────────────────────────
-- 아래는 두 마이그레이션 실행 후 확인용.

-- 6) goals 정책 확인 — goals_master_all 1개(FOR ALL, is_master) 나와야 정상
-- SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
-- WHERE polrelid = 'goals'::regclass ORDER BY polname;

-- 7) pages CHECK 에 dashboard 포함 확인
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'pages_page_type_chk';
