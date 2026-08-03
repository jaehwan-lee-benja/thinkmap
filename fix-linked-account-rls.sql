-- ⚠⚠ 재실행 주의 — 이 파일은 2026-08-03 보안 묶음 A 적용분을 **되돌린다** (배너 2026-08-03)
-- ----------------------------------------------------------------------------
-- 이 파일이 정의/재생성하는 함수: get_linked_accounts() · is_linked_account() · is_linked_account_viewer() · get_user_id_by_email()
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
-- 연결 계정 RLS 함수 수정
-- 원인: is_linked_account* / get_linked_accounts 가 app_users.auth_uid 에 의존하는데,
--       비마스터 사용자는 app_users 를 self-update 할 수 없어 auth_uid 가 NULL 로 남음.
--       → 결과: A 가 만든 calendar/daily 페이지를 B(연결 계정)에서 볼 수 없음.
--
-- 해결: auth.users 를 직접 조회하도록 함수 3종을 재정의해 app_users.auth_uid 의존 제거.
--       추가로 app_users self-insert/self-update 정책을 열어 향후 누락 방지.
-- =============================================

-- 1. is_linked_account_viewer — viewer/editor 둘 다 통과 (SELECT 용)
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

-- 2. is_linked_account — editor 권한만 (INSERT/UPDATE/DELETE 용)
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

-- 3. get_linked_accounts — 연결된 계정 목록 반환 (임퍼소네이션 드롭다운용)
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
-- 4. app_users self-heal 정책 (선택적 안전장치)
--    is_master() 가 아니어도 본인 이메일 레코드는 자가 등록/갱신 가능
-- =============================================

DROP POLICY IF EXISTS "Users can self-insert own record" ON app_users;
CREATE POLICY "Users can self-insert own record"
  ON app_users FOR INSERT
  TO authenticated
  WITH CHECK (LOWER(email) = LOWER(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Users can self-update own auth_uid" ON app_users;
CREATE POLICY "Users can self-update own auth_uid"
  ON app_users FOR UPDATE
  TO authenticated
  USING (LOWER(email) = LOWER(auth.jwt() ->> 'email'))
  WITH CHECK (LOWER(email) = LOWER(auth.jwt() ->> 'email'));

-- =============================================
-- 5. 기존 app_users 레코드의 auth_uid 누락분 일괄 보정 (idempotent)
-- =============================================
UPDATE app_users
SET auth_uid = u.id
FROM auth.users u
WHERE LOWER(app_users.email) = LOWER(u.email)
  AND (app_users.auth_uid IS NULL OR app_users.auth_uid <> u.id);

-- =============================================
-- 완료
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '✅ 연결 계정 RLS 함수가 auth.users 직접 조회로 전환되었습니다.';
  RAISE NOTICE '   - is_linked_account / is_linked_account_viewer / get_linked_accounts 재정의';
  RAISE NOTICE '   - app_users self-heal 정책 추가';
  RAISE NOTICE '   - 기존 app_users.auth_uid 누락분 자동 보정 완료';
END $$;
