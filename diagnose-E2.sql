-- E2. kbl0226 의 section_order + stale id 검사
SELECT
  s.section_order,
  jsonb_array_length(s.section_order) AS ordered_count,
  (
    SELECT array_agg(elem)
    FROM jsonb_array_elements_text(s.section_order) AS elem
    LEFT JOIN worklog_sections ws ON ws.id = elem
    WHERE ws.id IS NULL OR ws.deleted_at IS NOT NULL
  ) AS stale_ids_in_order
FROM worklog_user_settings s
JOIN auth.users u ON u.id = s.user_id
WHERE u.email = 'kbl0226@gmail.com';
