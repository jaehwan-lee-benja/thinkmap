-- STEP 2: 보드 멤버십 시드 (migrate-board-scope-sections.sql)
-- 그 보드 아래 daily 를 만든 적이 있는 user 는 자동 멤버.
-- app_users.role='master' 인 사람은 보드 master 로 시드.

BEGIN;

INSERT INTO worklog_board_members (board_id, user_id, role, joined_at)
SELECT DISTINCT
  p.parent_id,
  p.user_id,
  CASE WHEN au.role = 'master' THEN 'master' ELSE 'member' END,
  now()
FROM pages p
LEFT JOIN app_users au ON au.auth_uid = p.user_id
WHERE p.page_type = 'daily'
  AND p.parent_id IS NOT NULL
  AND p.user_id IS NOT NULL
ON CONFLICT (board_id, user_id) DO NOTHING;

COMMIT;

-- 시드 결과 확인 (한 번에 보기)
SELECT 'A. total members seeded' AS check, COUNT(*)::text AS value
FROM worklog_board_members
UNION ALL
SELECT 'B. master count',
       (SELECT COUNT(*)::text FROM worklog_board_members WHERE role='master')
UNION ALL
SELECT 'C. member count',
       (SELECT COUNT(*)::text FROM worklog_board_members WHERE role='member')
UNION ALL
SELECT 'D. distinct boards with members',
       (SELECT COUNT(DISTINCT board_id)::text FROM worklog_board_members)
UNION ALL
SELECT 'E. boards without any master (위험 — 0 이어야 정상)',
       (SELECT COUNT(*)::text FROM pages p
        WHERE p.is_board=true
          AND NOT EXISTS (
            SELECT 1 FROM worklog_board_members m
            WHERE m.board_id=p.id AND m.role='master'
          ));
