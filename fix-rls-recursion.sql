-- 무한 재귀 수정: pages 대신 projects 테이블로 멤버십 확인

DROP POLICY IF EXISTS "Users can view own or shared pages" ON pages;
CREATE POLICY "Users can view own or shared pages"
  ON pages FOR SELECT
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account_viewer(user_id)
    OR EXISTS (
      SELECT 1 FROM shares
      WHERE (
        (shares.resource_type = 'page' AND shares.resource_id = pages.id)
        OR (shares.resource_type = 'project' AND shares.resource_id = pages.project_id)
      )
      AND shares.shared_with_user_id = auth.uid()
    )
    OR (
      pages.page_type IN ('calendar', 'daily')
      AND EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = pages.project_id
          AND projects.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update own or shared pages" ON pages;
CREATE POLICY "Users can update own or shared pages"
  ON pages FOR UPDATE
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
    OR EXISTS (
      SELECT 1 FROM shares
      WHERE (
        (shares.resource_type = 'page' AND shares.resource_id = pages.id)
        OR (shares.resource_type = 'project' AND shares.resource_id = pages.project_id)
      )
      AND shares.shared_with_user_id = auth.uid()
      AND shares.permission = 'editor'
    )
    OR (
      pages.page_type IN ('calendar', 'daily')
      AND EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = pages.project_id
          AND projects.user_id = auth.uid()
      )
    )
  );
