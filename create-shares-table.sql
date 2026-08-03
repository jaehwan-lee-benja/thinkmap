-- ⚠⚠ 재실행 주의 — 이 파일은 2026-08-03 보안 묶음 A 적용분을 **되돌린다** (배너 2026-08-03)
-- ----------------------------------------------------------------------------
-- 이 파일이 정의/재생성하는 함수: get_user_id_by_email() · set_shared_with_user_id()
-- 라이브는 2026-08-03 에 아래가 적용된 상태다:
--   · secdef 7종 `SET search_path = public, pg_temp` 고정  (migration `pin_secdef_search_path`)
--   · `create_canvas_pair` PUBLIC·anon EXECUTE 회수 + authenticated authored 부여
--                                                    (migration `fix_create_canvas_pair_exposure`)
-- ★이 파일엔 그 설정을 재현하는 줄이 **없다**(authored GRANT 행도 없다 = defacl 상속분 ⓒ)
--   ⇒ 재실행하면 `create or replace` / `drop+create` 로 **고정과 회수가 조용히 사라진다.**
-- ★재실행 규칙: 돌리기 전에 위 두 마이그를 다시 적용할 준비를 해라. 아니면 돌리지 마라.
--   기준선·판정 술어 = `docs/SECURITY-BUNDLE-A-BASELINE-20260803.md`
-- ----------------------------------------------------------------------------
-- ===================================================
-- 공유 기능 테이블 및 RLS 정책
-- ===================================================

-- 1. shares 테이블 생성
CREATE TABLE IF NOT EXISTS shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('project', 'page')),
  resource_id UUID NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  shared_with_email TEXT NOT NULL,
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'viewer' CHECK (permission IN ('viewer', 'editor')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(resource_type, resource_id, shared_with_email)
);

-- 2. shares 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_shared_with_user ON shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_shares_shared_with_email ON shares(shared_with_email);
CREATE INDEX IF NOT EXISTS idx_shares_resource ON shares(resource_type, resource_id);

-- 3. shares RLS 정책
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;

-- 소유자는 자신이 만든 공유를 볼 수 있음
DROP POLICY IF EXISTS "Owners can view their shares" ON shares;
CREATE POLICY "Owners can view their shares"
  ON shares FOR SELECT
  USING (auth.uid() = owner_id);

-- 공유 받은 사람도 자신에게 공유된 것을 볼 수 있음
DROP POLICY IF EXISTS "Shared users can view shares" ON shares;
CREATE POLICY "Shared users can view shares"
  ON shares FOR SELECT
  USING (auth.uid() = shared_with_user_id);

-- 소유자만 공유를 생성할 수 있음
DROP POLICY IF EXISTS "Owners can create shares" ON shares;
CREATE POLICY "Owners can create shares"
  ON shares FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- 소유자만 공유를 수정할 수 있음
DROP POLICY IF EXISTS "Owners can update shares" ON shares;
CREATE POLICY "Owners can update shares"
  ON shares FOR UPDATE
  USING (auth.uid() = owner_id);

-- 소유자만 공유를 삭제할 수 있음
DROP POLICY IF EXISTS "Owners can delete shares" ON shares;
CREATE POLICY "Owners can delete shares"
  ON shares FOR DELETE
  USING (auth.uid() = owner_id);

-- ===================================================
-- 4. projects 테이블 RLS 정책 업데이트 (공유 접근 허용)
-- ===================================================

-- 기존 정책 삭제 후 재생성
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
CREATE POLICY "Users can view own or shared projects"
  ON projects FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shares
      WHERE shares.resource_type = 'project'
        AND shares.resource_id = projects.id
        AND shares.shared_with_user_id = auth.uid()
    )
  );

-- 편집 권한이 있는 공유 사용자도 업데이트 가능
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "Users can update own or shared projects"
  ON projects FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shares
      WHERE shares.resource_type = 'project'
        AND shares.resource_id = projects.id
        AND shares.shared_with_user_id = auth.uid()
        AND shares.permission = 'editor'
    )
  );

-- ===================================================
-- 5. pages 테이블 RLS 정책 업데이트 (공유 접근 허용)
-- ===================================================

DROP POLICY IF EXISTS "Users can view own pages" ON pages;
CREATE POLICY "Users can view own or shared pages"
  ON pages FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM shares
      WHERE (
        (shares.resource_type = 'page' AND shares.resource_id = pages.id)
        OR (shares.resource_type = 'project' AND shares.resource_id = pages.project_id)
      )
      AND shares.shared_with_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own pages" ON pages;
CREATE POLICY "Users can update own or shared pages"
  ON pages FOR UPDATE
  USING (
    auth.uid() = user_id
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

-- ===================================================
-- 6. 사용자 이메일로 user_id 조회를 위한 함수 (공유 시 사용)
-- ===================================================
CREATE OR REPLACE FUNCTION get_user_id_by_email(email_input TEXT)
RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE email = email_input LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ===================================================
-- 7. 공유 생성 시 자동으로 shared_with_user_id 설정하는 트리거
-- ===================================================
CREATE OR REPLACE FUNCTION set_shared_with_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.shared_with_user_id := get_user_id_by_email(NEW.shared_with_email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_set_shared_with_user_id ON shares;
CREATE TRIGGER trigger_set_shared_with_user_id
  BEFORE INSERT OR UPDATE ON shares
  FOR EACH ROW
  EXECUTE FUNCTION set_shared_with_user_id();

-- 8. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ 공유 기능 테이블이 생성되었습니다.';
  RAISE NOTICE '   - shares 테이블 생성됨';
  RAISE NOTICE '   - projects/pages RLS 정책 업데이트됨';
  RAISE NOTICE '   - 이메일 기반 사용자 조회 함수 생성됨';
END $$;
