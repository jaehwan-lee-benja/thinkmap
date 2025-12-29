-- ====================================================================
-- 최적화된 스키마로 마이그레이션
-- 기존 blocks → 최적화된 blocks (depth 필드 추가)
-- ====================================================================

-- 1. 백업 테이블 생성
CREATE TABLE IF NOT EXISTS blocks_backup AS
SELECT * FROM blocks;

-- 2. depth 계산 함수 (재귀적)
CREATE OR REPLACE FUNCTION calculate_block_depth(block_id UUID)
RETURNS INTEGER AS $$
DECLARE
  parent UUID;
  parent_depth INTEGER;
BEGIN
  -- 부모 ID 가져오기
  SELECT parent_id INTO parent FROM blocks WHERE id = block_id;

  -- 부모가 없으면 depth = 0
  IF parent IS NULL THEN
    RETURN 0;
  END IF;

  -- 부모의 depth 재귀 계산
  SELECT calculate_block_depth(parent) INTO parent_depth;

  RETURN parent_depth + 1;
END;
$$ LANGUAGE plpgsql;

-- 3. 기존 테이블에 depth 컬럼 추가 (없으면)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'depth'
  ) THEN
    ALTER TABLE blocks ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 4. 모든 블록의 depth 계산
DO $$
DECLARE
  block_record RECORD;
BEGIN
  FOR block_record IN SELECT id FROM blocks ORDER BY created_at LOOP
    UPDATE blocks
    SET depth = calculate_block_depth(block_record.id)
    WHERE id = block_record.id;
  END LOOP;

  RAISE NOTICE '✅ depth 계산 완료';
END $$;

-- 5. depth 제약조건 추가
ALTER TABLE blocks
ADD CONSTRAINT depth_non_negative CHECK (depth >= 0);

-- 6. depth 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_blocks_user_depth
  ON blocks(user_id, depth);

-- 7. 마이그레이션 완료 확인
DO $$
DECLARE
  block_count INTEGER;
  root_count INTEGER;
  max_depth INTEGER;
BEGIN
  SELECT COUNT(*) INTO block_count FROM blocks;
  SELECT COUNT(*) INTO root_count FROM blocks WHERE depth = 0;
  SELECT MAX(depth) INTO max_depth FROM blocks;

  RAISE NOTICE '====================================';
  RAISE NOTICE '✅ 마이그레이션 완료';
  RAISE NOTICE '====================================';
  RAISE NOTICE '총 블록 수: %', block_count;
  RAISE NOTICE '최상위 블록: %', root_count;
  RAISE NOTICE '최대 깊이: %', max_depth;
  RAISE NOTICE '백업 테이블: blocks_backup';
  RAISE NOTICE '====================================';
END $$;

-- 8. 롤백 함수 (문제 발생 시 사용)
CREATE OR REPLACE FUNCTION rollback_migration()
RETURNS void AS $$
BEGIN
  -- 백업에서 복구
  DROP TABLE IF EXISTS blocks;
  ALTER TABLE blocks_backup RENAME TO blocks;

  RAISE NOTICE '✅ 롤백 완료: 백업에서 복구됨';
END;
$$ LANGUAGE plpgsql;

-- 사용법:
-- 롤백이 필요한 경우: SELECT rollback_migration();
