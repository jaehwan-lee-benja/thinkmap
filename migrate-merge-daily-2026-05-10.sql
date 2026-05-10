-- ============================================================================
-- 5/10 daily: 중복 page 3개 → 사이드바에 보이는 ff8ef4f8 한 개로 통합
--   - 다른 두 page (0380a11a, 950cef21) 의 active row 들을 ff8ef4f8 의 page_id 로 변경
--   - 통합 후 같은 master_id 의 active section row 중복 정리 (가장 오래된 것 keep, 나머지 자식 reparent + soft-delete)
-- ============================================================================

BEGIN;

-- 1. 다른 두 page 의 active row 들을 ff8ef4f8 로 page_id 변경
UPDATE daily_blocks
   SET page_id = 'ff8ef4f8-3e75-4bdf-9fec-274e9ab5fe41'
 WHERE page_date = '2026-05-10'
   AND page_id IN (
     '0380a11a-91c4-4c04-9065-a81b0b34d79f',
     '950cef21-bfac-48b2-9a60-21d212649cef'
   )
   AND deleted_at IS NULL;

-- 2. 같은 master 의 active section row 가 여러 개면 가장 오래된 것만 keep
CREATE TEMP TABLE tmp_dedup AS
WITH section_ranks AS (
  SELECT block_id AS section_block_id, section_master_id,
         ROW_NUMBER() OVER (PARTITION BY section_master_id ORDER BY created_at) AS rn
    FROM daily_blocks
   WHERE page_id = 'ff8ef4f8-3e75-4bdf-9fec-274e9ab5fe41'
     AND block_type = 'section'
     AND section_master_id IS NOT NULL
     AND deleted_at IS NULL
)
SELECT s.section_block_id AS lose_id, k.section_block_id AS keep_id
  FROM section_ranks s
  JOIN section_ranks k ON k.section_master_id = s.section_master_id AND k.rn = 1
 WHERE s.rn > 1;

-- 3. 자식 row 들의 section_id 를 keep_id 로 재매핑
UPDATE daily_blocks db
   SET section_id = t.keep_id
  FROM tmp_dedup t
 WHERE db.section_id = t.lose_id
   AND db.block_type <> 'section'
   AND db.page_id = 'ff8ef4f8-3e75-4bdf-9fec-274e9ab5fe41'
   AND db.deleted_at IS NULL;

-- 4. 직접 자식 parent_block_id 재매핑
UPDATE daily_blocks db
   SET parent_block_id = t.keep_id
  FROM tmp_dedup t
 WHERE db.parent_block_id = t.lose_id
   AND db.page_id = 'ff8ef4f8-3e75-4bdf-9fec-274e9ab5fe41'
   AND db.deleted_at IS NULL;

-- 5. losers section soft-delete
UPDATE daily_blocks db
   SET deleted_at = NOW()
  FROM tmp_dedup t
 WHERE db.block_id = t.lose_id;

-- 검증 1: master 당 active section 1개씩
SELECT section_master_id, COUNT(*) AS cnt
  FROM daily_blocks
 WHERE page_id = 'ff8ef4f8-3e75-4bdf-9fec-274e9ab5fe41'
   AND block_type='section'
   AND deleted_at IS NULL
 GROUP BY section_master_id
HAVING COUNT(*) > 1;

-- 검증 2: ff8ef4f8 의 active row 총수 (이전 2개 → 통합 후 80+ 개)
SELECT COUNT(*) AS total_alive
  FROM daily_blocks
 WHERE page_id = 'ff8ef4f8-3e75-4bdf-9fec-274e9ab5fe41'
   AND deleted_at IS NULL;

DROP TABLE tmp_dedup;

COMMIT;
