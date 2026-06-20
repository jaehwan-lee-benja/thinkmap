-- 작전판 배경 캔버스 크기(field_size, 단위 vh) — 보드 공통. PLAN-roster-visual-board.md §12.
-- 클수록 배경이 커져 고정 px 자리 카드가 상대적으로 작아짐. roster_board_layout에 컬럼 추가.
-- 재실행 안전(IF NOT EXISTS). 기본 56(기존 .roster-field height: 56vh와 동일).
ALTER TABLE roster_board_layout
  ADD COLUMN IF NOT EXISTS field_size numeric NOT NULL DEFAULT 56;
