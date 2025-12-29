-- ====================================================================
-- 불필요한 데이터 정리 스크립트
-- ====================================================================

-- 1. blocks 테이블 데이터 삭제 (현재 사용자의 모든 블록)
DELETE FROM blocks WHERE user_id = auth.uid();

-- 2. block_history 테이블 데이터 삭제
DELETE FROM block_history WHERE user_id = auth.uid();

-- 3. 레거시 테이블 데이터 삭제 (있다면)
DELETE FROM key_thoughts_history WHERE TRUE;

-- 4. user_settings의 key_thoughts 관련 데이터 삭제 (있다면)
DELETE FROM user_settings
WHERE setting_key IN (
  'key_thoughts_blocks',
  'key_thoughts_blocks_backup',
  'blocks_migration_completed'
);

-- 5. 확인 메시지
DO $$
DECLARE
  blocks_count INTEGER;
  history_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO blocks_count FROM blocks WHERE user_id = auth.uid();
  SELECT COUNT(*) INTO history_count FROM block_history WHERE user_id = auth.uid();

  RAISE NOTICE '====================================';
  RAISE NOTICE '✅ 데이터 정리 완료';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'blocks 테이블: % 개 남음', blocks_count;
  RAISE NOTICE 'block_history 테이블: % 개 남음', history_count;
  RAISE NOTICE '====================================';
END $$;
