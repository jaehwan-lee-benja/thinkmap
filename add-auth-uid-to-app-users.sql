-- app_users에 auth_uid 컬럼 추가
-- auth.users.id를 저장하여 임퍼소네이션 시 올바른 user_id 참조

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS auth_uid UUID;

-- 기존 데이터 마이그레이션: email로 매칭하여 auth_uid 채우기
UPDATE app_users
SET auth_uid = au.id
FROM auth.users au
WHERE LOWER(app_users.email) = LOWER(au.email);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_app_users_auth_uid ON app_users(auth_uid);
