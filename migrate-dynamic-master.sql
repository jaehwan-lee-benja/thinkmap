-- ⚠⚠ 재실행 주의 — 이 파일은 2026-08-03 보안 묶음 A 적용분을 **되돌린다** (배너 2026-08-03)
-- ----------------------------------------------------------------------------
-- 이 파일이 정의/재생성하는 함수: is_master()
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
-- 동적 마스터 지정 마이그레이션
-- 하드코딩된 designerbenja@gmail.com 대신
-- app_users.role = 'master'로 마스터 여부를 판별
-- =============================================

-- 1. is_master() 함수 생성 (RLS 정책 + 프론트엔드 RPC 호출용)
CREATE OR REPLACE FUNCTION is_master()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM app_users
    WHERE email = auth.jwt() ->> 'email'
    AND role = 'master'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- 2. app_users 테이블 RLS 정책 업데이트
-- =============================================

-- app_users SELECT: is_master() 순환 참조 방지를 위해 모든 인증 사용자에게 조회 허용
-- (is_master()가 app_users를 조회하므로, SELECT 정책에서 is_master()를 쓰면 무한 재귀)
DROP POLICY IF EXISTS "Master can view all users" ON app_users;
DROP POLICY IF EXISTS "Users can view own record" ON app_users;
DROP POLICY IF EXISTS "Authenticated can view users" ON app_users;
CREATE POLICY "Authenticated can view users"
  ON app_users FOR SELECT
  TO authenticated
  USING (true);

-- 마스터가 사용자 추가
DROP POLICY IF EXISTS "Master can insert users" ON app_users;
CREATE POLICY "Master can insert users"
  ON app_users FOR INSERT
  TO authenticated
  WITH CHECK (is_master());

-- 마스터가 사용자 수정
DROP POLICY IF EXISTS "Master can update users" ON app_users;
CREATE POLICY "Master can update users"
  ON app_users FOR UPDATE
  TO authenticated
  USING (is_master())
  WITH CHECK (is_master());

-- 마스터가 사용자 삭제
DROP POLICY IF EXISTS "Master can delete users" ON app_users;
CREATE POLICY "Master can delete users"
  ON app_users FOR DELETE
  TO authenticated
  USING (is_master());

-- =============================================
-- 3. linked_accounts 테이블 RLS 정책 업데이트
-- =============================================

DROP POLICY IF EXISTS "Master can manage linked_accounts" ON linked_accounts;
CREATE POLICY "Master can manage linked_accounts"
  ON linked_accounts FOR ALL
  TO authenticated
  USING (is_master())
  WITH CHECK (is_master());

-- =============================================
-- 4. projects 테이블 RLS 정책 업데이트
-- =============================================

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

-- =============================================
-- 5. pages 테이블 RLS 정책 업데이트
-- =============================================

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

-- =============================================
-- 6. blocks 테이블 RLS 정책 업데이트
-- =============================================

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

-- =============================================
-- 7. block_history 테이블 RLS 정책 업데이트
-- =============================================

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

-- =============================================
-- 8. backups 테이블 RLS 정책 업데이트
-- =============================================

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

-- =============================================
-- 9. user_preferences 테이블 RLS 정책 업데이트
-- =============================================

DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  USING (
    is_master()
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (
    is_master()
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING (
    is_master()
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;
CREATE POLICY "Users can delete own preferences"
  ON user_preferences FOR DELETE
  USING (
    is_master()
    OR auth.uid() = user_id
  );

-- =============================================
-- 완료
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '동적 마스터 마이그레이션 완료: 모든 RLS 정책이 is_master() 함수를 사용하도록 업데이트되었습니다.';
END $$;
