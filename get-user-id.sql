-- 현재 로그인한 사용자 ID 확인
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;
