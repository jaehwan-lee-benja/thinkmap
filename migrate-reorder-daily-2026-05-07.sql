-- ============================================================================
-- 5/7 daily 페이지의 section row position 재매김
-- 2026-05-07: 카드 순서를 worklog_sections 의 sort_order + created_at + title 로 정렬.
-- ============================================================================

UPDATE daily_blocks db
   SET position = ranked.new_pos
  FROM (
    SELECT db2.block_id,
           ROW_NUMBER() OVER (
             ORDER BY COALESCE(ws.sort_order, 999), ws.created_at, ws.title
           ) AS new_pos
      FROM daily_blocks db2
      LEFT JOIN worklog_sections ws ON ws.id = db2.section_master_id
     WHERE db2.block_type = 'section'
       AND db2.page_date = '2026-05-07'
       AND db2.deleted_at IS NULL
  ) ranked
 WHERE db.block_id = ranked.block_id;

-- 검증: 같은 페이지의 section row position 이 1, 2, 3, ... 으로 결정적인지
-- SELECT position, text_content FROM daily_blocks
--  WHERE block_type = 'section' AND page_date = '2026-05-07' AND deleted_at IS NULL
--  ORDER BY position;
