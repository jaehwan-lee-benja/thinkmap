-- ============================================================================
-- 2026-05-13 업무일지 진단 (READ-ONLY, 단일 JSON 결과)
-- Supabase Dashboard → SQL Editor 에 통째로 붙여넣고 Run.
-- 결과 셀(result)을 클릭해서 전체 복사 → 그대로 붙여넣어 주세요.
-- ============================================================================

WITH
pages_all AS (
  SELECT id, name, parent_id, user_id, page_type, page_date,
         deleted_at, created_at, updated_at, position
    FROM pages
   WHERE page_date = '2026-05-13' AND page_type = 'daily'
),
active_page_count AS (
  SELECT COUNT(*)::int AS cnt FROM pages_all WHERE deleted_at IS NULL
),
blocks_per_section AS (
  SELECT p.id AS page_id, p.name AS page_name,
         db.section_id, db.block_type, COUNT(*)::int AS row_count
    FROM daily_blocks db
    JOIN pages p ON p.id = db.page_id
   WHERE db.page_date = '2026-05-13' AND db.deleted_at IS NULL
   GROUP BY p.id, p.name, db.section_id, db.block_type
),
dup_section_per_master AS (
  SELECT page_id, section_master_id, COUNT(*)::int AS cnt,
         array_agg(block_id ORDER BY created_at) AS block_ids,
         array_agg(created_at ORDER BY created_at) AS created_ats
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND block_type = 'section'
     AND section_master_id IS NOT NULL
     AND deleted_at IS NULL
   GROUP BY page_id, section_master_id
  HAVING COUNT(*) > 1
),
dup_children AS (
  SELECT block_id, page_id, section_id, parent_block_id,
         LEFT(COALESCE(text_content,''), 200) AS text_preview, created_at,
         COUNT(*) OVER (PARTITION BY page_id, section_id, parent_block_id, text_content)::int AS dup_count
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND block_type <> 'section'
     AND deleted_at IS NULL
     AND text_content IS NOT NULL AND text_content <> ''
),
dup_children_filtered AS (
  SELECT * FROM dup_children WHERE dup_count > 1
),
all_rows AS (
  SELECT block_id, page_id, page_date, section_id, parent_block_id, block_type,
         LEFT(COALESCE(text_content,''), 200) AS text_preview,
         is_todo, todo_checked, is_carry_over, deleted_at, created_at, updated_at
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
   ORDER BY updated_at DESC
   LIMIT 300
),
recent_deleted AS (
  SELECT block_id, page_id, section_id, parent_block_id, block_type,
         LEFT(COALESCE(text_content,''), 300) AS text_preview,
         is_todo, todo_checked, is_carry_over,
         deleted_at, created_at, updated_at
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND deleted_at IS NOT NULL
     AND deleted_at > NOW() - INTERVAL '48 hours'
   ORDER BY deleted_at DESC
),
carry_over_rows AS (
  SELECT block_id, origin_block_id, carry_over_from, is_carry_over, page_id,
         LEFT(COALESCE(text_content,''), 200) AS text_preview,
         deleted_at, created_at
    FROM daily_blocks
   WHERE page_date = '2026-05-13' AND is_carry_over = true
   ORDER BY created_at ASC
)
SELECT jsonb_build_object(
  'q1_pages_all',              (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM pages_all p),
  'q2_active_page_count',      (SELECT cnt FROM active_page_count),
  'q3_blocks_per_section',     (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM blocks_per_section b),
  'q4_dup_section_per_master', (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM dup_section_per_master d),
  'q5_dup_children',           (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM dup_children_filtered d),
  'q6_all_rows',               (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM all_rows r),
  'q7_recent_deleted',         (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM recent_deleted r),
  'q8_carry_over_rows',        (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM carry_over_rows r)
) AS result;
