-- ============================================================================
-- 배치도 체제 템플릿 — 전역 기본 시드 (board_id IS NULL)
--
--   모델: 상위 캔버스 + 주방/바 사각형. 한 역할 = 한 자리(좌표). 오픈/마감/상시는 보드에서 분리.
--   좌표 재사용: grid_col = x%(0~100), grid_row = y%(0~100). 자유 좌표(스냅). shift 는 보드 비사용(null).
--   주방(네모 안) ≈ y>=45, 홀(네모 밖) ≈ y<45. PLAN-roster-visual-board.md §6.
--   슬라이드 기준 "대략" — 사이트 편집(드래그 이동/새 버전 저장)으로 다듬는다. 재실행 안전.
--   전제: migrate-create-roster-templates.sql 선적용.
-- ============================================================================

BEGIN;

-- 공통 좌표(매장 작전판): 주방/바 = 아래(y 62/84), 홀 = 위(y 24).
--   커피(22,62) 아이스크림(42,62) 서포트(62,62) 포장(82,62)
--   빵자르기(30,84) 카이막(50,84) 설거지(74,84)
--   홀·자리안내(35,24) 반납대(64,24) 마감보조(84,26)

-- ── 평일 4명 ─────────────────────────────────────────────────────────────────
DELETE FROM roster_templates WHERE board_id IS NULL AND name = '평일 4명';
WITH t AS (
  INSERT INTO roster_templates (board_id, weekday, headcount, name, is_default, display_order)
  VALUES (NULL, '평일', 4, '평일 4명', true, 10) RETURNING id
)
INSERT INTO roster_template_slots (template_id, grid_col, grid_row, role, tasks)
SELECT t.id, v.x, v.y, v.role, v.tasks FROM t, (VALUES
  (22,62,'커피','샷, 스팀, 컵준비'),
  (42,62,'아이스크림','아이스크림, 계산'),
  (62,62,'서포트','쟁반 셋팅, 주문서 정리, 호출'),
  (74,84,'설거지','설거지')
) AS v(x,y,role,tasks);

-- ── 토 5명 ───────────────────────────────────────────────────────────────────
DELETE FROM roster_templates WHERE board_id IS NULL AND name = '토 5명';
WITH t AS (
  INSERT INTO roster_templates (board_id, weekday, headcount, name, is_default, display_order)
  VALUES (NULL, '토', 5, '토 5명', true, 20) RETURNING id
)
INSERT INTO roster_template_slots (template_id, grid_col, grid_row, role, tasks)
SELECT t.id, v.x, v.y, v.role, v.tasks FROM t, (VALUES
  (22,62,'커피','샷, 스팀, 컵준비'),
  (42,62,'아이스크림','아이스크림, 계산'),
  (62,62,'서포트','쟁반 셋팅, 주문서 정리, 호출'),
  (30,84,'빵자르기','카이막 뜨기, 빵, 설거지, 반납대'),
  (74,84,'설거지','설거지'),
  (35,24,'홀·자리안내','홀 관리, 자리 안내')
) AS v(x,y,role,tasks);

-- ── 토 6명 ───────────────────────────────────────────────────────────────────
DELETE FROM roster_templates WHERE board_id IS NULL AND name = '토 6명';
WITH t AS (
  INSERT INTO roster_templates (board_id, weekday, headcount, name, is_default, display_order)
  VALUES (NULL, '토', 6, '토 6명', true, 30) RETURNING id
)
INSERT INTO roster_template_slots (template_id, grid_col, grid_row, role, tasks)
SELECT t.id, v.x, v.y, v.role, v.tasks FROM t, (VALUES
  (22,62,'커피','샷, 스팀, 컵준비'),
  (42,62,'아이스크림','아이스크림, 계산'),
  (62,62,'서포트','쟁반 셋팅, 주문서 정리, 호출'),
  (82,62,'포장','카이막, 포장(카이막·말렌카)'),
  (30,84,'빵자르기','카이막 뜨기, 빵, 설거지, 반납대'),
  (74,84,'설거지','설거지'),
  (35,24,'홀·자리안내','홀 관리, 자리 안내')
) AS v(x,y,role,tasks);

-- ── 일 7명 ───────────────────────────────────────────────────────────────────
DELETE FROM roster_templates WHERE board_id IS NULL AND name = '일 7명';
WITH t AS (
  INSERT INTO roster_templates (board_id, weekday, headcount, name, is_default, display_order)
  VALUES (NULL, '일', 7, '일 7명', true, 40) RETURNING id
)
INSERT INTO roster_template_slots (template_id, grid_col, grid_row, role, tasks)
SELECT t.id, v.x, v.y, v.role, v.tasks FROM t, (VALUES
  (22,62,'커피','샷, 스팀, 컵준비'),
  (42,62,'아이스크림','아이스크림, 계산'),
  (62,62,'서포트','쟁반 셋팅, 주문서 정리, 호출'),
  (82,62,'포장','카이막, 포장(카이막·말렌카)'),
  (30,84,'빵자르기','카이막 뜨기, 빵, 설거지, 반납대'),
  (74,84,'설거지','설거지'),
  (35,24,'홀·자리안내','홀 관리, 자리 안내'),
  (64,24,'반납대','반납대, 물기 닦기')
) AS v(x,y,role,tasks);

-- ── 일·토 8명 ────────────────────────────────────────────────────────────────
DELETE FROM roster_templates WHERE board_id IS NULL AND name = '일·토 8명';
WITH t AS (
  INSERT INTO roster_templates (board_id, weekday, headcount, name, is_default, display_order)
  VALUES (NULL, NULL, 8, '일·토 8명', true, 50) RETURNING id
)
INSERT INTO roster_template_slots (template_id, grid_col, grid_row, role, tasks)
SELECT t.id, v.x, v.y, v.role, v.tasks FROM t, (VALUES
  (22,62,'커피','샷, 스팀, 컵준비'),
  (42,62,'아이스크림','아이스크림, 계산'),
  (62,62,'서포트','쟁반 셋팅, 주문서 정리, 호출'),
  (82,62,'포장','카이막, 포장(카이막·말렌카)'),
  (30,84,'빵자르기','카이막 뜨기, 빵, 설거지, 반납대'),
  (50,84,'카이막','카이막 뜨기, 반납대, 물기닦기'),
  (74,84,'설거지','설거지'),
  (35,24,'홀·자리안내','홀 관리, 자리 안내'),
  (64,24,'반납대','반납대, 물기 닦기')
) AS v(x,y,role,tasks);

COMMIT;

-- 검증: SELECT name, headcount, (SELECT count(*) FROM roster_template_slots s WHERE s.template_id=t.id) slots
--       FROM roster_templates t WHERE board_id IS NULL ORDER BY display_order;
