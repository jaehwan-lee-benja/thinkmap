-- ===================================================
-- block_history의 block_id를 nullable로 변경
-- (전체 페이지 스냅샷 저장을 위해)
-- ===================================================

-- 1. block_id를 nullable로 변경
ALTER TABLE block_history ALTER COLUMN block_id DROP NOT NULL;

-- 2. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ block_history.block_id를 nullable로 변경 완료';
  RAISE NOTICE '   - 이제 전체 페이지 스냅샷 저장 가능 (block_id = null)';
END $$;
