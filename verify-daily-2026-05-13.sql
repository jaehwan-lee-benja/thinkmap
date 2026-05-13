-- 2026-05-13 현재 상태 확인 (READ-ONLY)
-- Supabase SQL Editor 에서 Run.

WITH
active AS (
  SELECT COUNT(*)::int AS cnt
    FROM daily_blocks
   WHERE page_date = '2026-05-13' AND deleted_at IS NULL
),
by_type AS (
  SELECT block_type, COUNT(*)::int AS cnt
    FROM daily_blocks
   WHERE page_date = '2026-05-13' AND deleted_at IS NULL
   GROUP BY block_type
),
page_row AS (
  SELECT id, name, deleted_at, parent_id, user_id
    FROM pages
   WHERE page_date = '2026-05-13' AND page_type = 'daily'
),
sample_active AS (
  SELECT block_id, block_type,
         LEFT(COALESCE(text_content,''), 60) AS text_preview,
         parent_block_id, section_id, deleted_at IS NULL AS is_active
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND text_content IS NOT NULL AND text_content <> ''
   ORDER BY created_at
   LIMIT 30
),
orphan_children AS (
  -- parent_block_id 가 있는데, 그 parent 가 active 가 아닌 경우 (broken chain)
  SELECT c.block_id, LEFT(COALESCE(c.text_content,''),60) AS text_preview,
         c.parent_block_id, p.deleted_at AS parent_deleted_at
    FROM daily_blocks c
    LEFT JOIN daily_blocks p ON p.block_id = c.parent_block_id
   WHERE c.page_date = '2026-05-13'
     AND c.deleted_at IS NULL
     AND c.parent_block_id IS NOT NULL
     AND (p.deleted_at IS NOT NULL OR p.block_id IS NULL)
)
SELECT jsonb_build_object(
  'total_active',  (SELECT cnt FROM active),
  'by_type',       (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM by_type b),
  'page',          (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM page_row p),
  'sample_rows',   (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM sample_active s),
  'orphan_children', (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM orphan_children o)
) AS result;
