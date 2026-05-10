-- ============================================================================
-- 5/10 (ff8ef4f8) 페이지: 같은 (section_id, parent_block_id, text_content) 자식 row 중복 정리
-- - 같은 section + 같은 부모 + 같은 텍스트 → 가장 오래된 것만 keep, 나머지 soft-delete
-- - text_content 가 NULL 또는 '' 인 placeholder (position 999 빈 자식 등) 는 제외
-- - 다른 section / 다른 parent 의 동일 텍스트는 보존 (의도된 mirror 가능성)
-- ============================================================================

BEGIN;

WITH ranked AS (
  SELECT block_id,
         ROW_NUMBER() OVER (
           PARTITION BY section_id, parent_block_id, text_content
           ORDER BY created_at
         ) AS rn
    FROM daily_blocks
   WHERE page_id = 'ff8ef4f8-3e75-4bdf-9fec-274e9ab5fe41'
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

-- 검증: 같은 (section_id, parent_block_id, text_content) 자식 중복이 남았는지
SELECT section_id, parent_block_id, LEFT(text_content, 30) AS preview, COUNT(*) AS cnt
  FROM daily_blocks
 WHERE page_id = 'ff8ef4f8-3e75-4bdf-9fec-274e9ab5fe41'
   AND block_type <> 'section'
   AND deleted_at IS NULL
   AND text_content IS NOT NULL
   AND text_content <> ''
 GROUP BY section_id, parent_block_id, text_content
HAVING COUNT(*) > 1;

-- 활성 row 총수
SELECT COUNT(*) AS total_alive_after_dedup
  FROM daily_blocks
 WHERE page_id = 'ff8ef4f8-3e75-4bdf-9fec-274e9ab5fe41'
   AND deleted_at IS NULL;

COMMIT;
