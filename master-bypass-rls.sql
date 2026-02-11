-- =============================================
-- 마스터 계정 임퍼소네이션을 위한 RLS 정책 업데이트
-- 마스터 이메일: designerbenja@gmail.com
-- =============================================

-- === projects 테이블 ===
DROP POLICY IF EXISTS "Users can view own or shared projects" ON projects;
CREATE POLICY "Users can view own or shared projects"
  ON projects FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shares
      WHERE shares.resource_type = 'project'
        AND shares.resource_id = projects.id
        AND shares.shared_with_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can update own or shared projects" ON projects;
CREATE POLICY "Users can update own or shared projects"
  ON projects FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shares
      WHERE shares.resource_type = 'project'
        AND shares.resource_id = projects.id
        AND shares.shared_with_user_id = auth.uid()
        AND shares.permission = 'editor'
    )
  );

DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

-- === pages 테이블 ===
DROP POLICY IF EXISTS "Users can view own or shared pages" ON pages;
CREATE POLICY "Users can view own or shared pages"
  ON pages FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shares
      WHERE (
        (shares.resource_type = 'page' AND shares.resource_id = pages.id)
        OR (shares.resource_type = 'project' AND shares.resource_id = pages.project_id)
      )
      AND shares.shared_with_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own pages" ON pages;
CREATE POLICY "Users can insert own pages"
  ON pages FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can update own or shared pages" ON pages;
CREATE POLICY "Users can update own or shared pages"
  ON pages FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shares
      WHERE (
        (shares.resource_type = 'page' AND shares.resource_id = pages.id)
        OR (shares.resource_type = 'project' AND shares.resource_id = pages.project_id)
      )
      AND shares.shared_with_user_id = auth.uid()
      AND shares.permission = 'editor'
    )
  );

DROP POLICY IF EXISTS "Users can delete own pages" ON pages;
CREATE POLICY "Users can delete own pages"
  ON pages FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

-- === blocks 테이블 ===
DROP POLICY IF EXISTS "Users can read own blocks" ON blocks;
CREATE POLICY "Users can read own blocks"
  ON blocks FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can insert own blocks" ON blocks;
CREATE POLICY "Users can insert own blocks"
  ON blocks FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can update own blocks" ON blocks;
CREATE POLICY "Users can update own blocks"
  ON blocks FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can delete own blocks" ON blocks;
CREATE POLICY "Users can delete own blocks"
  ON blocks FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

-- === block_history 테이블 ===
DROP POLICY IF EXISTS "Users can read own block_history" ON block_history;
CREATE POLICY "Users can read own block_history"
  ON block_history FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can insert own block_history" ON block_history;
CREATE POLICY "Users can insert own block_history"
  ON block_history FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can delete own block_history" ON block_history;
CREATE POLICY "Users can delete own block_history"
  ON block_history FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

-- === backups 테이블 ===
DROP POLICY IF EXISTS "Users can view own backups" ON backups;
CREATE POLICY "Users can view own backups"
  ON backups FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can insert own backups" ON backups;
CREATE POLICY "Users can insert own backups"
  ON backups FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can delete own backups" ON backups;
CREATE POLICY "Users can delete own backups"
  ON backups FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

-- === user_preferences 테이블 ===
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;
CREATE POLICY "Users can delete own preferences"
  ON user_preferences FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );
