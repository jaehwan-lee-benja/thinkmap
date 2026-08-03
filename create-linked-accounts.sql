-- ⚠⚠ 재실행 주의 — 이 파일은 2026-08-03 보안 묶음 A 적용분을 **되돌린다** (배너 2026-08-03)
-- ----------------------------------------------------------------------------
-- 이 파일이 정의/재생성하는 함수: get_linked_accounts() · is_linked_account() · is_linked_account_viewer()
-- 라이브는 2026-08-03 에 아래가 적용된 상태다:
--   · secdef 7종 `SET search_path = public, pg_temp` 고정  (migration `pin_secdef_search_path`)
--   · `create_canvas_pair` PUBLIC·anon EXECUTE 회수 + authenticated authored 부여
--                                                    (migration `fix_create_canvas_pair_exposure`)
-- ★이 파일엔 그 설정을 재현하는 줄이 **없다**(authored GRANT 행도 없다 = defacl 상속분 ⓒ)
--   ⇒ 재실행하면 `create or replace` / `drop+create` 로 **고정과 회수가 조용히 사라진다.**
-- ★재실행 규칙: 돌리기 전에 위 두 마이그를 다시 적용할 준비를 해라. 아니면 돌리지 마라.
--   기준선·판정 술어 = `docs/SECURITY-BUNDLE-A-BASELINE-20260803.md`
-- ----------------------------------------------------------------------------
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
  USING (is_master())
  WITH CHECK (is_master());

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
-- auth.users 를 직접 조회해 app_users.auth_uid 누락에 영향받지 않도록 함
CREATE OR REPLACE FUNCTION is_linked_account(owner_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM linked_accounts la
    JOIN auth.users u ON LOWER(u.email) = LOWER(la.linked_email)
    WHERE LOWER(la.primary_email) = LOWER(auth.jwt() ->> 'email')
      AND u.id = owner_user_id
      AND la.permission = 'editor'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 연결 계정 조회 함수 (viewer 포함)
CREATE OR REPLACE FUNCTION is_linked_account_viewer(owner_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM linked_accounts la
    JOIN auth.users u ON LOWER(u.email) = LOWER(la.linked_email)
    WHERE LOWER(la.primary_email) = LOWER(auth.jwt() ->> 'email')
      AND u.id = owner_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. 현재 사용자의 연결 계정 목록을 반환하는 함수
CREATE OR REPLACE FUNCTION get_linked_accounts()
RETURNS TABLE(linked_email TEXT, linked_auth_uid UUID, permission TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT la.linked_email, u.id AS linked_auth_uid, la.permission
  FROM linked_accounts la
  JOIN auth.users u ON LOWER(u.email) = LOWER(la.linked_email)
  WHERE LOWER(la.primary_email) = LOWER(auth.jwt() ->> 'email');
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
    is_master()
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
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can update own or shared projects" ON projects;
CREATE POLICY "Users can update own or shared projects"
  ON projects FOR UPDATE
  USING (
    is_master()
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
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

-- === pages 테이블 ===
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
  );

DROP POLICY IF EXISTS "Users can insert own pages" ON pages;
CREATE POLICY "Users can insert own pages"
  ON pages FOR INSERT
  WITH CHECK (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
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
  );

DROP POLICY IF EXISTS "Users can delete own pages" ON pages;
CREATE POLICY "Users can delete own pages"
  ON pages FOR DELETE
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

-- === blocks 테이블 ===
DROP POLICY IF EXISTS "Users can read own blocks" ON blocks;
CREATE POLICY "Users can read own blocks"
  ON blocks FOR SELECT
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account_viewer(user_id)
  );

DROP POLICY IF EXISTS "Users can insert own blocks" ON blocks;
CREATE POLICY "Users can insert own blocks"
  ON blocks FOR INSERT
  WITH CHECK (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can update own blocks" ON blocks;
CREATE POLICY "Users can update own blocks"
  ON blocks FOR UPDATE
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can delete own blocks" ON blocks;
CREATE POLICY "Users can delete own blocks"
  ON blocks FOR DELETE
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

-- === block_history 테이블 ===
DROP POLICY IF EXISTS "Users can read own block_history" ON block_history;
CREATE POLICY "Users can read own block_history"
  ON block_history FOR SELECT
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account_viewer(user_id)
  );

DROP POLICY IF EXISTS "Users can insert own block_history" ON block_history;
CREATE POLICY "Users can insert own block_history"
  ON block_history FOR INSERT
  WITH CHECK (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can delete own block_history" ON block_history;
CREATE POLICY "Users can delete own block_history"
  ON block_history FOR DELETE
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

-- === backups 테이블 ===
DROP POLICY IF EXISTS "Users can view own backups" ON backups;
CREATE POLICY "Users can view own backups"
  ON backups FOR SELECT
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account_viewer(user_id)
  );

DROP POLICY IF EXISTS "Users can insert own backups" ON backups;
CREATE POLICY "Users can insert own backups"
  ON backups FOR INSERT
  WITH CHECK (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );

DROP POLICY IF EXISTS "Users can delete own backups" ON backups;
CREATE POLICY "Users can delete own backups"
  ON backups FOR DELETE
  USING (
    is_master()
    OR auth.uid() = user_id
    OR is_linked_account(user_id)
  );
