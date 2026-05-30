-- STEP 4: section_order 이전 (migrate-board-scope-sections.sql)
-- worklog_user_settings.section_order → worklog_board_user_settings (user_id+board_id 키)
-- 각 user 의 기존 section_order 를 그 user 의 기본 보드 (가장 많이 쓴 parent_id) 로 복사.

BEGIN;

INSERT INTO worklog_board_user_settings (user_id, board_id, section_order)
SELECT
  s.user_id,
  (SELECT p.parent_id FROM pages p
   WHERE p.user_id = s.user_id
     AND p.page_type = 'daily'
     AND p.parent_id IS NOT NULL
   GROUP BY p.parent_id
   ORDER BY COUNT(*) DESC
   LIMIT 1) AS board_id,
  s.section_order
FROM worklog_user_settings s
WHERE s.section_order IS NOT NULL
ON CONFLICT (user_id, board_id) DO NOTHING;

COMMIT;

-- 검증
SELECT 'A. board_user_settings rows' AS check,
       (SELECT COUNT(*)::text FROM worklog_board_user_settings) AS value
UNION ALL
SELECT 'B. 기본 보드 매핑 실패 (NULL board_id 로 INSERT 안 된 user)',
       (SELECT COUNT(*)::text FROM worklog_user_settings s
        WHERE s.section_order IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM worklog_board_user_settings b
            WHERE b.user_id = s.user_id
          ))
UNION ALL
SELECT 'C. section_order 에 들어있는 id 중 살아있는 worklog_sections 매칭 안 되는 것 (stale id 합계)',
       (SELECT COALESCE(SUM(stale_count)::text, '0')
        FROM (
          SELECT (
            SELECT COUNT(*)
            FROM jsonb_array_elements_text(b.section_order) AS elem
            LEFT JOIN worklog_sections ws ON ws.id = elem AND ws.deleted_at IS NULL
            WHERE ws.id IS NULL
          ) AS stale_count
          FROM worklog_board_user_settings b
        ) sub);
