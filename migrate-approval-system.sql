-- 가입 승인 시스템 마이그레이션
-- 실행 대상: Supabase SQL Editor
-- 날짜: 2026-04-17

-- 1. app_users.status에 'pending' 값 추가
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_status_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_status_check
  CHECK (status IN ('active', 'invited', 'inactive', 'pending'));

-- 2. 본인 상태 조회 허용 (현재 마스터만 SELECT 가능 → 본인 row는 본인도 조회 가능)
CREATE POLICY "Users can view own record"
ON app_users FOR SELECT
TO authenticated
USING (
  auth.uid() = auth_uid
);

-- 3. 본인 레코드 자동 생성 허용 (ensureAppUser용)
-- 이미 존재하면 기존 정책 삭제 후 재생성
DROP POLICY IF EXISTS "Users can insert own record" ON app_users;
CREATE POLICY "Users can insert own record"
ON app_users FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() ->> 'email' = email
);

-- 4. 본인 auth_uid만 동기화 허용 (role/status는 마스터만 변경 가능 — 기존 정책으로 보장)
DROP POLICY IF EXISTS "Users can update own auth_uid" ON app_users;
CREATE POLICY "Users can update own auth_uid"
ON app_users FOR UPDATE
TO authenticated
USING (
  auth.jwt() ->> 'email' = email
)
WITH CHECK (
  auth.jwt() ->> 'email' = email
);

-- 5. 구 calendar 페이지 정리 (project_id가 있는 중복 calendar 삭제)
-- project_id IS NULL인 calendar만 남기고, project_id가 있는 calendar는 soft delete
UPDATE pages
SET deleted_at = NOW()
WHERE page_type = 'calendar'
  AND project_id IS NOT NULL
  AND deleted_at IS NULL;
