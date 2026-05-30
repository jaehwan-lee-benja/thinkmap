-- STEP 1: 스키마 확장 (migrate-board-scope-sections.sql)
-- - worklog_sections.board_id 추가
-- - pages.is_board 추가 + backfill
-- - worklog_board_members 신규
-- - worklog_board_user_settings 신규
-- - RLS 정책
-- 실행 후 5 개 sanity 결과를 확인.

BEGIN;

-- 1-a. worklog_sections.board_id 추가 (NULL 허용 — 'global' 은 NULL 유지)
ALTER TABLE worklog_sections
  ADD COLUMN IF NOT EXISTS board_id uuid REFERENCES pages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_worklog_sections_board
  ON worklog_sections(board_id, sort_order)
  WHERE deleted_at IS NULL;

-- 1-b. pages.is_board 추가
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS is_board boolean NOT NULL DEFAULT false;

-- daily 페이지의 parent 는 모두 보드로 표시
UPDATE pages SET is_board = true
WHERE id IN (
  SELECT DISTINCT parent_id
  FROM pages
  WHERE page_type = 'daily' AND parent_id IS NOT NULL
);

-- 1-c. worklog_board_members
CREATE TABLE IF NOT EXISTS worklog_board_members (
  board_id    uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('master','member')),
  invited_by  uuid REFERENCES auth.users(id),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_worklog_board_members_user
  ON worklog_board_members(user_id);

-- 1-d. worklog_board_user_settings
CREATE TABLE IF NOT EXISTS worklog_board_user_settings (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id       uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  section_order  jsonb NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, board_id)
);

-- RLS: worklog_board_user_settings
ALTER TABLE worklog_board_user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_user_settings_self" ON worklog_board_user_settings;
CREATE POLICY "board_user_settings_self" ON worklog_board_user_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS: worklog_board_members
ALTER TABLE worklog_board_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_members_select_self" ON worklog_board_members;
CREATE POLICY "board_members_select_self" ON worklog_board_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "board_members_select_master" ON worklog_board_members;
CREATE POLICY "board_members_select_master" ON worklog_board_members
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM worklog_board_members m
      WHERE m.board_id = worklog_board_members.board_id
        AND m.user_id = auth.uid()
        AND m.role = 'master'
    )
  );
DROP POLICY IF EXISTS "board_members_write_master" ON worklog_board_members;
CREATE POLICY "board_members_write_master" ON worklog_board_members
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM worklog_board_members m
      WHERE m.board_id = worklog_board_members.board_id
        AND m.user_id = auth.uid()
        AND m.role = 'master'
    )
  );

COMMIT;

-- ============================================================================
-- 적용 결과 sanity (위→아래 한 번씩 확인)
-- ============================================================================

-- 1) worklog_sections 에 board_id 컬럼 추가 확인
SELECT '1) board_id col' AS check, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'worklog_sections' AND column_name = 'board_id';

-- 2) pages.is_board 추가 + backfill 확인 (true 인 row 수 = 보드 수)
SELECT '2) is_board true count' AS check, COUNT(*) AS rows
FROM pages WHERE is_board = true;

-- 3) 신규 테이블 2개 존재 확인
SELECT '3) new tables' AS check, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('worklog_board_members','worklog_board_user_settings')
ORDER BY table_name;

-- 4) board_members 빈 상태 (STEP 2 에서 시드 예정)
SELECT '4) board_members rows (should be 0)' AS check, COUNT(*) AS rows
FROM worklog_board_members;

-- 5) board_user_settings 빈 상태 (STEP 4 에서 시드 예정)
SELECT '5) board_user_settings rows (should be 0)' AS check, COUNT(*) AS rows
FROM worklog_board_user_settings;
