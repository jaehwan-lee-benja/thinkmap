-- ============================================================================
-- 5/10 daily 페이지 재정리 (race condition 으로 또 중복 생성됨)
-- 흐름:
--   1. 5/10 의 active page 중 가장 오래된 것 (사이드바 첫 자리 = pages.position 정렬 기준) 을 keep
--   2. 나머지 active page 들의 row 를 keep page 의 page_id 로 통합
--   3. 나머지 page 들 soft-delete
--   4. master 당 active section 중복 정리 (자식 reparent + lose section soft-delete)
--   5. 같은 (section_id, parent_block_id, text_content) 자식 중복 정리
-- ============================================================================

BEGIN;

-- 1. keep page 선정 (가장 오래된 active 5/10 daily page)
CREATE TEMP TABLE tmp_keep_page AS
SELECT id AS keep_id FROM pages
 WHERE page_date = '2026-05-10' AND page_type = 'daily' AND deleted_at IS NULL
 ORDER BY created_at ASC LIMIT 1;

-- 2. 다른 active page 의 active row 들을 keep page 로 통합
UPDATE daily_blocks db
   SET page_id = (SELECT keep_id FROM tmp_keep_page)
 WHERE db.page_date = '2026-05-10'
   AND db.deleted_at IS NULL
   AND db.page_id <> (SELECT keep_id FROM tmp_keep_page);

-- 3. 나머지 active 5/10 daily page 들 soft-delete
UPDATE pages
   SET deleted_at = NOW()
 WHERE page_date = '2026-05-10' AND page_type = 'daily' AND deleted_at IS NULL
   AND id <> (SELECT keep_id FROM tmp_keep_page);

-- 4. 같은 master 의 active section row 중복 정리
CREATE TEMP TABLE tmp_dedup AS
WITH section_ranks AS (
  SELECT block_id AS section_block_id, section_master_id,
         ROW_NUMBER() OVER (PARTITION BY section_master_id ORDER BY created_at) AS rn
    FROM daily_blocks
   WHERE page_id = (SELECT keep_id FROM tmp_keep_page)
     AND block_type = 'section'
     AND section_master_id IS NOT NULL
     AND deleted_at IS NULL
)
SELECT s.section_block_id AS lose_id, k.section_block_id AS keep_id
  FROM section_ranks s
  JOIN section_ranks k ON k.section_master_id = s.section_master_id AND k.rn = 1
 WHERE s.rn > 1;

UPDATE daily_blocks db
   SET section_id = t.keep_id
  FROM tmp_dedup t
 WHERE db.section_id = t.lose_id
   AND db.block_type <> 'section'
   AND db.deleted_at IS NULL;

UPDATE daily_blocks db
   SET parent_block_id = t.keep_id
  FROM tmp_dedup t
 WHERE db.parent_block_id = t.lose_id
   AND db.deleted_at IS NULL;

UPDATE daily_blocks db
   SET deleted_at = NOW()
  FROM tmp_dedup t
 WHERE db.block_id = t.lose_id;

-- 5. 같은 (section_id, parent_block_id, text_content) 자식 중복 정리
WITH ranked AS (
  SELECT block_id,
         ROW_NUMBER() OVER (
           PARTITION BY section_id, parent_block_id, text_content
           ORDER BY created_at
         ) AS rn
    FROM daily_blocks
   WHERE page_id = (SELECT keep_id FROM tmp_keep_page)
     AND block_type <> 'section'
     AND deleted_at IS NULL
     AND text_content IS NOT NULL
     AND text_content <> ''
)
UPDATE daily_blocks db
   SET deleted_at = NOW()
  FROM ranked r
 WHERE db.block_id = r.block_id
   AND r.rn > 1;

-- 검증 1: master 당 active section 1개씩
SELECT section_master_id, COUNT(*) AS cnt
  FROM daily_blocks
 WHERE page_date = '2026-05-10' AND block_type = 'section' AND deleted_at IS NULL
 GROUP BY section_master_id HAVING COUNT(*) > 1;

-- 검증 2: active page 1개
SELECT COUNT(*) AS active_pages
  FROM pages WHERE page_date = '2026-05-10' AND page_type = 'daily' AND deleted_at IS NULL;

DROP TABLE tmp_keep_page, tmp_dedup;

COMMIT;
