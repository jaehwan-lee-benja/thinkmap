-- ===================================================
-- block_history에 page_id 추가 (페이지별 히스토리 관리)
-- ===================================================

-- 1. page_id 컬럼 추가
ALTER TABLE block_history ADD COLUMN IF NOT EXISTS page_id UUID REFERENCES pages(id) ON DELETE CASCADE;

-- 2. 기존 데이터에 page_id 채우기 (blocks 테이블에서 가져오기)
UPDATE block_history bh
SET page_id = b.page_id
FROM blocks b
WHERE bh.block_id = b.id
  AND bh.page_id IS NULL;

-- 3. 인덱스 추가 (페이지별 히스토리 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_block_history_page_created
  ON block_history(page_id, created_at DESC);

-- 4. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ block_history 테이블에 page_id 추가 완료';
  RAISE NOTICE '   - 기존 데이터 마이그레이션 완료';
  RAISE NOTICE '   - 페이지별 히스토리 조회 인덱스 추가됨';
END $$;
