-- ============================================================================
-- 5/10 daily 페이지: 같은 master_id 의 중복 active section row 정리
-- 전략:
--   - section_master_id 당 가장 오래된 (created_at ASC) active section row 1개만 keep
--   - 죽는 section 의 자식 row 들을 keep section 으로 reparent (section_id, parent_block_id 갱신)
--   - 죽는 section row 자체는 soft-delete
-- 결과: 한 master 당 active section 하나로 통합, 자식 콘텐츠 보존
-- ============================================================================

BEGIN;

CREATE TEMP TABLE tmp_dedup AS
WITH section_ranks AS (
  SELECT block_id AS section_block_id, section_master_id,
         ROW_NUMBER() OVER (PARTITION BY section_master_id ORDER BY created_at) AS rn
    FROM daily_blocks
   WHERE page_date = '2026-05-10'
     AND block_type = 'section'
     AND section_master_id IS NOT NULL
     AND deleted_at IS NULL
)
SELECT
  s.section_block_id AS lose_id,
  k.section_block_id AS keep_id
FROM section_ranks s
JOIN section_ranks k
  ON k.section_master_id = s.section_master_id
 AND k.rn = 1
WHERE s.rn > 1;

-- 1. 자식 row 들의 section_id 를 keep_id 로 재매핑 (콘텐츠 보존)
UPDATE daily_blocks db
   SET section_id = t.keep_id
  FROM tmp_dedup t
 WHERE db.section_id = t.lose_id
   AND db.block_type <> 'section'
   AND db.page_date = '2026-05-10'
   AND db.deleted_at IS NULL;

-- 2. 직접 자식 (parent_block_id = lose_id) 의 parent_block_id 를 keep_id 로 재매핑
UPDATE daily_blocks db
   SET parent_block_id = t.keep_id
  FROM tmp_dedup t
 WHERE db.parent_block_id = t.lose_id
   AND db.page_date = '2026-05-10'
   AND db.deleted_at IS NULL;

-- 3. losers section row soft-delete
UPDATE daily_blocks db
   SET deleted_at = NOW()
  FROM tmp_dedup t
 WHERE db.block_id = t.lose_id;

-- 검증: 같은 master_id 가 여러 active section row 인지 (있으면 0건이 정상)
SELECT section_master_id, COUNT(*) AS active_count
  FROM daily_blocks
 WHERE page_date = '2026-05-10'
   AND block_type = 'section'
   AND section_master_id IS NOT NULL
   AND deleted_at IS NULL
 GROUP BY section_master_id
HAVING COUNT(*) > 1;

DROP TABLE tmp_dedup;

COMMIT;
