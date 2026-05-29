-- B. 5/26 vs 5/28 의 섹션 row 비교
SELECT
  p.page_date,
  db.position,
  db.section_master_id,
  ws.title          AS master_title,
  ws.scope          AS master_scope,
  ws.visibility     AS master_visibility,
  ws.deleted_at     AS master_deleted_at,
  db.text_content   AS row_text,
  db.visibility     AS row_visibility,
  db.is_fixed_section,
  db.block_id,
  db.parent_block_id
FROM daily_blocks db
JOIN pages p ON p.id = db.page_id
JOIN auth.users u ON u.id = p.user_id
LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
WHERE u.email = 'kbl0226@gmail.com'
  AND p.page_type = 'daily'
  AND p.page_date IN (DATE '2026-05-26', DATE '2026-05-28')
  AND db.block_type = 'section'
ORDER BY p.page_date, db.position;
