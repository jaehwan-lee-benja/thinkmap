-- ============================================================================
-- pages 확장 — page_type='schedule' 허용
--
-- 1) pages_page_type_chk CHECK 제약에 'schedule' 추가
-- 2) migrate-worklog-independent.sql 의 RLS 3개 정책에 'schedule' 추가
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행.
-- 이미 실행한 사용자도 안전하게 재실행 가능 (DROP 후 재생성).
-- ============================================================================

BEGIN;

-- ── CHECK 제약 재정의 ────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pages_page_type_chk'
  ) THEN
    ALTER TABLE pages DROP CONSTRAINT pages_page_type_chk;
  END IF;
END $$;

ALTER TABLE pages
  ADD CONSTRAINT pages_page_type_chk
  CHECK (page_type IN ('normal','daily','calendar','frame','engine','schedule'));

-- ── SELECT ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pages_select_with_worklog" ON pages;
CREATE POLICY "pages_select_with_worklog" ON pages
  FOR SELECT USING (
    is_master()
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shares s
      WHERE (
        (s.resource_type = 'page' AND s.resource_id = pages.id)
        OR (s.resource_type = 'project' AND s.resource_id = pages.project_id)
      )
      AND s.shared_with_user_id = auth.uid()
    )
    OR is_linked_account_viewer(user_id)
    OR (page_type IN ('calendar', 'daily', 'schedule') AND auth.uid() IS NOT NULL)
  );

-- ── INSERT ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pages_insert_worklog" ON pages;
CREATE POLICY "pages_insert_worklog" ON pages
  FOR INSERT WITH CHECK (
    page_type IN ('calendar', 'daily', 'schedule')
    AND auth.uid() IS NOT NULL
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pages_update_worklog" ON pages;
CREATE POLICY "pages_update_worklog" ON pages
  FOR UPDATE USING (
    page_type IN ('calendar', 'daily', 'schedule')
    AND auth.uid() IS NOT NULL
  );

-- DELETE 정책은 그대로 유지 (마스터만, calendar/daily 만 대상).
-- schedule 페이지는 거의 1개이고 삭제 빈도 낮으므로 별도 정책 불필요 — 필요시 마스터가 calendar/daily 와 함께 처리.

COMMIT;
