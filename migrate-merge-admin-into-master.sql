-- ============================================================================
-- app_users.role 의 'admin' 을 'master' 로 통합
-- 2026-05-07: 관리자/마스터 의미 통일 — admin role 폐기, master + user 만 사용.
-- ============================================================================
--
-- 배경: 코드 RLS 가 is_master() 만 사용. admin 은 사실상 user 와 같은 권한이라
--      실효 의미 없었음. UI 에서 두 라벨이 혼용되어 마스터 단일로 정리.
-- ============================================================================

BEGIN;

-- 1. 기존 'admin' role 사용자를 'master' 로 변경
UPDATE app_users SET role = 'master' WHERE role = 'admin';

-- 2. CHECK constraint 재정의: 'admin' 제거
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('master', 'user'));

COMMIT;

-- ============================================================================
-- 검증
-- ============================================================================
-- SELECT role, COUNT(*) FROM app_users GROUP BY role;
-- → master / user 만 나와야 정상
-- ============================================================================
