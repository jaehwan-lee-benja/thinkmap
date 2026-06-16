-- 보드 공통 작전판 레이아웃 — 홀·주방/바 네모(모든 체제 공유). PLAN-roster-visual-board.md §12.
-- 슬롯(카드)은 체제별(roster_templates), 매장 구조(홀/주방)는 보드당 1행 공통.
-- 전제: is_master(), is_board_member(uuid)(migrate-create-members.sql 선적용). 재실행 안전.

BEGIN;

CREATE TABLE IF NOT EXISTS roster_board_layout (
  board_id   uuid PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  hall_x     numeric NOT NULL DEFAULT 6,
  hall_y     numeric NOT NULL DEFAULT 4,
  hall_w     numeric NOT NULL DEFAULT 88,
  hall_h     numeric NOT NULL DEFAULT 36,
  kitchen_x  numeric NOT NULL DEFAULT 6,
  kitchen_y  numeric NOT NULL DEFAULT 44,
  kitchen_w  numeric NOT NULL DEFAULT 88,
  kitchen_h  numeric NOT NULL DEFAULT 52,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roster_board_layout ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roster_board_layout_select ON roster_board_layout;
CREATE POLICY roster_board_layout_select ON roster_board_layout FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS roster_board_layout_write ON roster_board_layout;
CREATE POLICY roster_board_layout_write ON roster_board_layout FOR ALL
  USING (is_master() OR is_board_member(board_id))
  WITH CHECK (is_master() OR is_board_member(board_id));

COMMIT;
