-- =============================================
-- 연결 계정 (Linked Accounts) 기능
-- 특정 사용자가 다른 계정의 데이터에 읽기+쓰기 접근 가능
-- =============================================

-- 1. linked_accounts 테이블 생성
CREATE TABLE IF NOT EXISTS linked_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  primary_email TEXT NOT NULL,   -- 로그인하는 사용자 이메일
  linked_email TEXT NOT NULL,    -- 접근 대상 계정 이메일
  permission TEXT DEFAULT 'editor' CHECK (permission IN ('viewer', 'editor')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(primary_email, linked_email)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_linked_accounts_primary ON linked_accounts(primary_email);
CREATE INDEX IF NOT EXISTS idx_linked_accounts_linked ON linked_accounts(linked_email);

-- RLS 활성화 (마스터만 관리 가능)
ALTER TABLE linked_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master can manage linked_accounts"
  ON linked_accounts FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'designerbenja@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'designerbenja@gmail.com');

-- 본인의 연결 계정 조회 허용
CREATE POLICY "Users can view own linked accounts"
  ON linked_accounts FOR SELECT
  TO authenticated
  USING (
    primary_email = auth.jwt() ->> 'email'
    OR linked_email = auth.jwt() ->> 'email'
  );

-- 2. 연결 계정 여부를 확인하는 함수 (RLS에서 사용)
-- owner_user_id: 데이터 소유자의 auth.users.id
-- 현재 로그인 사용자가 해당 소유자와 연결 계정 관계인지 확인
CREATE OR REPLACE FUNCTION is_linked_account(owner_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM linked_accounts la
    WHERE la.primary_email = auth.jwt() ->> 'email'
      AND la.linked_email = (
        SELECT email FROM app_users WHERE auth_uid = owner_user_id LIMIT 1
      )
      AND la.permission = 'editor'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 연결 계정 조회 함수 (viewer 포함)
CREATE OR REPLACE FUNCTION is_linked_account_viewer(owner_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM linked_accounts la
    WHERE la.primary_email = auth.jwt() ->> 'email'
      AND la.linked_email = (
        SELECT email FROM app_users WHERE auth_uid = owner_user_id LIMIT 1
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. 현재 사용자의 연결 계정 목록을 반환하는 함수
CREATE OR REPLACE FUNCTION get_linked_accounts()
RETURNS TABLE(linked_email TEXT, linked_auth_uid UUID, permission TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT la.linked_email, au.auth_uid, la.permission
  FROM linked_accounts la
  JOIN app_users au ON au.email = la.linked_email
  WHERE la.primary_email = auth.jwt() ->> 'email'
    AND au.auth_uid IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- 4. 데이터 초기 삽입: rlawldus0621 → sarurufarm.partner 연결
-- =============================================
INSERT INTO linked_accounts (primary_email, linked_email, permission)
VALUES ('rlawldus0621@gmail.com', 'sarurufarm.partner@gmail.com', 'editor')
ON CONFLICT (primary_email, linked_email) DO NOTHING;

-- =============================================
-- 5. RLS 정책 업데이트 — 연결 계정 접근 추가
-- =============================================

-- === projects 테이블 ===
DROP POLICY IF EXISTS "Users can view own or shared projects" ON projects;
CREATE POLICY "Users can view own or shared projects"
  ON projects FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account_viewer(user_id)
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
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can update own or shared projects" ON projects;
CREATE POLICY "Users can update own or shared projects"
  ON projects FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
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
    OR is_linked_account(user_id)
  );

-- === pages 테이블 ===
DROP POLICY IF EXISTS "Users can view own or shared pages" ON pages;
CREATE POLICY "Users can view own or shared pages"
  ON pages FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
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
  );

DROP POLICY IF EXISTS "Users can insert own pages" ON pages;
CREATE POLICY "Users can insert own pages"
  ON pages FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can update own or shared pages" ON pages;
CREATE POLICY "Users can update own or shared pages"
  ON pages FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
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
  );

DROP POLICY IF EXISTS "Users can delete own pages" ON pages;
CREATE POLICY "Users can delete own pages"
  ON pages FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

-- === blocks 테이블 ===
DROP POLICY IF EXISTS "Users can read own blocks" ON blocks;
CREATE POLICY "Users can read own blocks"
  ON blocks FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account_viewer(user_id)
  );

DROP POLICY IF EXISTS "Users can insert own blocks" ON blocks;
CREATE POLICY "Users can insert own blocks"
  ON blocks FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can update own blocks" ON blocks;
CREATE POLICY "Users can update own blocks"
  ON blocks FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can delete own blocks" ON blocks;
CREATE POLICY "Users can delete own blocks"
  ON blocks FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

-- === block_history 테이블 ===
DROP POLICY IF EXISTS "Users can read own block_history" ON block_history;
CREATE POLICY "Users can read own block_history"
  ON block_history FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account_viewer(user_id)
  );

DROP POLICY IF EXISTS "Users can insert own block_history" ON block_history;
CREATE POLICY "Users can insert own block_history"
  ON block_history FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can delete own block_history" ON block_history;
CREATE POLICY "Users can delete own block_history"
  ON block_history FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

-- === backups 테이블 ===
DROP POLICY IF EXISTS "Users can view own backups" ON backups;
CREATE POLICY "Users can view own backups"
  ON backups FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account_viewer(user_id)
  );

DROP POLICY IF EXISTS "Users can insert own backups" ON backups;
CREATE POLICY "Users can insert own backups"
  ON backups FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can delete own backups" ON backups;
CREATE POLICY "Users can delete own backups"
  ON backups FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );
