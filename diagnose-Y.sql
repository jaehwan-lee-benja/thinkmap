-- Y. 2026-05-26, 2026-05-28 daily 페이지를 user_id 제한 없이 전수 조회.
--    kbl0226 이 아닌 user_id 의 페이지가 있는지, content_tiptap 이 v1 인지 확인.
SELECT
  p.page_date,
  p.id              AS page_id,
  p.name,
  p.user_id,
  u.email           AS owner_email,
  p.parent_id,
  p.project_id,
  p.created_at,
  p.deleted_at,
  CASE WHEN p.content_tiptap IS NULL THEN 'null'
       WHEN p.content_tiptap::text = '{"type":"doc","content":[]}' THEN 'empty'
       ELSE 'has json'
  END               AS content_tiptap_state,
  (SELECT COUNT(*) FROM daily_blocks db WHERE db.page_id = p.id) AS daily_blocks_count
FROM pages p
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE p.page_type = 'daily'
  AND p.page_date IN (DATE '2026-05-26', DATE '2026-05-28')
ORDER BY p.page_date, u.email;
