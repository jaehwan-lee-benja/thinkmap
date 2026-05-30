-- STEP 3 E. 검증의 orphan 20개 분해.
-- 살아있는 페이지 vs 이미 삭제된 페이지로 나눠 본다.

SELECT
  CASE WHEN p.deleted_at IS NULL THEN '활성 페이지' ELSE '삭제된 페이지' END AS page_status,
  CASE WHEN ws.id IS NULL THEN 'master 존재 안함 (hard delete)'
       WHEN ws.deleted_at IS NOT NULL THEN 'master 살아있음 but deleted_at'
       ELSE '기타'
  END AS master_status,
  COUNT(*) AS rows
FROM daily_blocks db
JOIN pages p ON p.id = db.page_id
LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
WHERE db.block_type='section'
  AND db.deleted_at IS NULL
  AND (ws.id IS NULL OR ws.deleted_at IS NOT NULL)
GROUP BY page_status, master_status
ORDER BY page_status, master_status;

-- 활성 페이지에 있는 orphan 의 상세 — 페이지·section_master_id·title 확인
SELECT '--- 활성 페이지의 orphan 상세 ---' AS sep;

SELECT
  p.page_date,
  u.email AS owner_email,
  db.section_master_id,
  ws.title       AS master_title,
  ws.deleted_at  AS master_deleted_at,
  db.text_content AS row_text,
  db.position
FROM daily_blocks db
JOIN pages p ON p.id = db.page_id
LEFT JOIN auth.users u ON u.id = p.user_id
LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
WHERE db.block_type='section'
  AND db.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND (ws.id IS NULL OR ws.deleted_at IS NOT NULL)
ORDER BY p.page_date DESC, db.position;
