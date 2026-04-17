-- 업무일지(calendar/daily) 페이지를 프로젝트에서 분리하는 마이그레이션
-- 실행 대상: Supabase SQL Editor
-- 날짜: 2026-04-17
-- 관련 문서: docs/WORKLOG-SPEC.md 10-2절 (방안 C)

-- 1. pages.project_id NOT NULL 제약 해제
ALTER TABLE pages ALTER COLUMN project_id DROP NOT NULL;

-- 2. 기존 calendar/daily 페이지의 project_id를 NULL로 전환
UPDATE pages
SET project_id = NULL
WHERE page_type IN ('calendar', 'daily')
  AND project_id IS NOT NULL;

-- 3. calendar/daily 페이지용 RLS 정책 추가
-- 모든 인증된 사용자가 calendar/daily 페이지를 조회할 수 있도록
-- (향후 가입 승인 시스템 도입 시 approved 조건 추가)

-- 기존 pages SELECT 정책을 재정의하여 calendar/daily 허용
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
    -- calendar/daily 페이지는 모든 인증된 사용자에게 열람 허용
    OR (page_type IN ('calendar', 'daily') AND auth.uid() IS NOT NULL)
  );

-- calendar/daily INSERT 정책
DROP POLICY IF EXISTS "pages_insert_worklog" ON pages;
CREATE POLICY "pages_insert_worklog" ON pages
  FOR INSERT WITH CHECK (
    page_type IN ('calendar', 'daily')
    AND auth.uid() IS NOT NULL
  );

-- calendar/daily UPDATE 정책
DROP POLICY IF EXISTS "pages_update_worklog" ON pages;
CREATE POLICY "pages_update_worklog" ON pages
  FOR UPDATE USING (
    page_type IN ('calendar', 'daily')
    AND auth.uid() IS NOT NULL
  );

-- calendar/daily DELETE 정책 (마스터만)
DROP POLICY IF EXISTS "pages_delete_worklog" ON pages;
CREATE POLICY "pages_delete_worklog" ON pages
  FOR DELETE USING (
    page_type IN ('calendar', 'daily')
    AND is_master()
  );

-- 4. worklog_comments도 calendar/daily에 대해 접근 허용
-- 기존 정책이 project_id 기반이므로, page_type 기반 정책 추가
DROP POLICY IF EXISTS "worklog_comments_select_worklog" ON worklog_comments;
CREATE POLICY "worklog_comments_select_worklog" ON worklog_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pages p
      WHERE p.id = worklog_comments.page_id
        AND p.page_type IN ('calendar', 'daily')
        AND auth.uid() IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "worklog_comments_insert_worklog" ON worklog_comments;
CREATE POLICY "worklog_comments_insert_worklog" ON worklog_comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM pages p
      WHERE p.id = worklog_comments.page_id
        AND p.page_type IN ('calendar', 'daily')
    )
  );
