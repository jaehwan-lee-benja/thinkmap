-- X. kbl0226 의 daily 페이지에서 참조되는 모든 section_master_id 와
--    그 마스터의 현재 상태 (created_by 어긋남 / hard delete 탐지)
SELECT DISTINCT
  db.section_master_id,
  ws.title,
  ws.scope,
  ws.created_by,
  ws.deleted_at,
  u2.email AS created_by_email
FROM daily_blocks db
JOIN pages p ON p.id = db.page_id
JOIN auth.users u ON u.id = p.user_id
LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
LEFT JOIN auth.users u2 ON u2.id = ws.created_by
WHERE u.email = 'kbl0226@gmail.com'
  AND p.page_type = 'daily'
  AND db.block_type = 'section'
ORDER BY ws.scope NULLS LAST, ws.title;
