-- STEP 0: 백업 (migrate-board-scope-sections.sql)
-- 마이그 대상 테이블 2개를 통째로 복제. row 수 적어 안전.
-- 실행 후 두 row 의 count 결과를 확인.

BEGIN;

CREATE TABLE IF NOT EXISTS worklog_sections_backup_2026_05_29 AS
  SELECT * FROM worklog_sections;

CREATE TABLE IF NOT EXISTS worklog_user_settings_backup_2026_05_29 AS
  SELECT * FROM worklog_user_settings;

COMMIT;

-- 백업 결과 확인
SELECT 'sections backup' AS label, COUNT(*) AS rows FROM worklog_sections_backup_2026_05_29
UNION ALL
SELECT 'user_settings backup', COUNT(*) FROM worklog_user_settings_backup_2026_05_29;
