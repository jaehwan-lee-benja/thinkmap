-- STEP 3: user-scope 섹션 → board-scope 이전 (migrate-board-scope-sections.sql)
-- 3-a. 각 user-scope 섹션을 그 created_by 가 가장 많이 쓴 보드에 매핑
-- 3-c. scope CHECK 에 'board' 추가
-- 3-d. board_id 가 채워진 user-scope row 의 scope 를 'board' 로 전환
-- 3-e. 같은 보드 내 동명 섹션 중복 정리 (오래된 것 유지 + 자식 row 재매핑)

BEGIN;

-- 3-a. board_id 매핑 (가장 많이 daily 를 만든 parent_id)
WITH primary_board AS (
  SELECT
    ws.id AS section_id,
    (SELECT p.parent_id
     FROM pages p
     WHERE p.user_id = ws.created_by
       AND p.page_type = 'daily'
       AND p.parent_id IS NOT NULL
     GROUP BY p.parent_id
     ORDER BY COUNT(*) DESC
     LIMIT 1) AS board_id
  FROM worklog_sections ws
  WHERE ws.scope = 'user' AND ws.deleted_at IS NULL
)
UPDATE worklog_sections ws
SET board_id = pb.board_id
FROM primary_board pb
WHERE ws.id = pb.section_id AND pb.board_id IS NOT NULL;

-- 3-c. scope CHECK 갱신 — 'board' 추가
ALTER TABLE worklog_sections
  DROP CONSTRAINT IF EXISTS worklog_sections_scope_check;
ALTER TABLE worklog_sections
  ADD CONSTRAINT worklog_sections_scope_check
  CHECK (scope IN ('global','user','board'));

-- 3-d. board_id 채워진 row 의 scope 를 'board' 로 전환
UPDATE worklog_sections
SET scope = 'board'
WHERE scope = 'user'
  AND deleted_at IS NULL
  AND board_id IS NOT NULL;

-- 3-e. 보드 내 중복 (같은 board_id + 같은 title) 정리.
--      가장 오래된 것 살리고 나머지는 deleted_at 처리.
--      daily_blocks 의 section_master_id 는 살아남은 id 로 재매핑.
WITH ranked AS (
  SELECT
    id,
    board_id,
    title,
    ROW_NUMBER() OVER (PARTITION BY board_id, title ORDER BY created_at ASC, id ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY board_id, title ORDER BY created_at ASC, id ASC) AS keep_id
  FROM worklog_sections
  WHERE scope = 'board' AND deleted_at IS NULL
),
duplicates AS (
  SELECT id AS dup_id, keep_id FROM ranked WHERE rn > 1
)
UPDATE daily_blocks db
SET section_master_id = d.keep_id
FROM duplicates d
WHERE db.section_master_id = d.dup_id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY board_id, title ORDER BY created_at ASC, id ASC) AS rn
  FROM worklog_sections
  WHERE scope = 'board' AND deleted_at IS NULL
)
UPDATE worklog_sections ws
SET deleted_at = now()
FROM ranked r
WHERE ws.id = r.id AND r.rn > 1;

COMMIT;

-- ============================================================================
-- 검증
-- ============================================================================
SELECT 'A. scope=board 살아있는 row' AS check,
       (SELECT COUNT(*)::text FROM worklog_sections WHERE scope='board' AND deleted_at IS NULL) AS value
UNION ALL
SELECT 'B. scope=user 잔존 (0이면 모든 user-scope 이전 성공)',
       (SELECT COUNT(*)::text FROM worklog_sections WHERE scope='user' AND deleted_at IS NULL)
UNION ALL
SELECT 'C. scope=board 인데 board_id 가 NULL (0이어야 정상)',
       (SELECT COUNT(*)::text FROM worklog_sections WHERE scope='board' AND board_id IS NULL AND deleted_at IS NULL)
UNION ALL
SELECT 'D. 중복 dedup 으로 soft delete 된 board 섹션 수',
       (SELECT COUNT(*)::text FROM worklog_sections WHERE scope='board' AND deleted_at IS NOT NULL)
UNION ALL
SELECT 'E. daily_blocks 의 section_master_id orphan (살아있는 master 와 매칭 안 됨)',
       (SELECT COUNT(*)::text FROM daily_blocks db
        LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id AND ws.deleted_at IS NULL
        WHERE db.block_type='section' AND db.deleted_at IS NULL AND ws.id IS NULL);
