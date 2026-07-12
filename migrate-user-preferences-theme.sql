-- ✅ 적용됨 — 2026-07-12 (라이트모드 Phase1). user_preferences.theme(system|light|dark) 크로스디바이스 저장.
-- 순수 추가·nullable. 롤백: ALTER TABLE user_preferences DROP COLUMN theme;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS theme text;
