-- =============================================================================
-- 마케팅 캔버스 매핑 — daily_blocks 양방향 참조 추가
-- =============================================================================
-- 문제: 현재 매핑은 source 가 (block | page | NULL) 셋만 가능. 업무일지(daily)의
--       토글은 daily_blocks 테이블에 살고 blocks 테이블과 무관해서 FK 로 가리킬
--       수 없음. 결과적으로 토글 ↔ 카드 양방향 링크가 끊김.
--
-- 해결: source_daily_block_id 컬럼 추가 (daily_blocks(block_id) FK).
--       CHECK 제약을 "출처 중 최대 1개만 NOT NULL" 로 확장.
--       UNIQUE 인덱스도 daily_block 출처용 추가.
-- =============================================================================

-- 1) 컬럼 추가
ALTER TABLE canvas_mappings
  ADD COLUMN IF NOT EXISTS source_daily_block_id UUID
    REFERENCES daily_blocks(block_id) ON DELETE CASCADE;

-- 2) CHECK 제약 — 최대 1개만 NOT NULL (셋 다 NULL = 자체 작성 카드)
ALTER TABLE canvas_mappings DROP CONSTRAINT IF EXISTS canvas_mapping_source_chk;

ALTER TABLE canvas_mappings
  ADD CONSTRAINT canvas_mapping_source_chk CHECK (
    (
      (source_block_id IS NOT NULL)::int +
      (source_page_id IS NOT NULL)::int +
      (source_daily_block_id IS NOT NULL)::int
    ) <= 1
  );

-- 3) 인덱스 + UNIQUE
CREATE INDEX IF NOT EXISTS idx_cm_daily_block
  ON canvas_mappings(source_daily_block_id)
  WHERE source_daily_block_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_canvas_mapping_daily_block
  ON canvas_mappings (source_daily_block_id, target_page_id, region_key, COALESCE(node_key,''))
  WHERE source_daily_block_id IS NOT NULL AND deleted_at IS NULL;

-- 4) 검증
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'canvas_mappings'::regclass AND conname LIKE '%source%';
-- SELECT indexname FROM pg_indexes WHERE tablename='canvas_mappings' AND indexname LIKE '%daily%';
