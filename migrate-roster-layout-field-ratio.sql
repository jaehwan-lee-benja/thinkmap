-- 작전판 배경 캔버스 가로:세로 비율(field_ratio) — 보드 공통. PLAN-roster-visual-board.md §12.
-- roster_board_layout에 컬럼 추가. 재실행 안전(IF NOT EXISTS). 기본 1.6(가로형).
ALTER TABLE roster_board_layout
  ADD COLUMN IF NOT EXISTS field_ratio numeric NOT NULL DEFAULT 1.6;
