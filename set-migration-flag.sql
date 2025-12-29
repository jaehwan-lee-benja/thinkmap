-- ====================================================================
-- 마이그레이션 완료 플래그 설정
-- 최적화된 스키마를 사용하므로 마이그레이션이 완료된 것으로 표시
-- ====================================================================

-- user_settings 테이블에 마이그레이션 완료 플래그 추가
INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
VALUES (
  auth.uid(),
  'blocks_migration_completed',
  'true',
  NOW()
)
ON CONFLICT (user_id, setting_key)
DO UPDATE SET
  setting_value = 'true',
  updated_at = NOW();

-- 확인
SELECT setting_key, setting_value
FROM user_settings
WHERE user_id = auth.uid()
  AND setting_key = 'blocks_migration_completed';
