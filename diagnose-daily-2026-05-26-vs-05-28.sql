-- 5/26 vs 5/28 daily 페이지 섹션 카드 비교 진단
-- 대상 계정: kbl0226@gmail.com
--
-- 사용법:
--   Supabase SQL Editor 에 통째로 붙여넣고 실행.
--   각 블록(A~G)은 독립 SELECT — 결과를 위→아래로 비교한다.
--   "kbl0226 계정에서 5/26 은 정상, 5/28 은 깨짐" 의 원인을 좁히기 위해 만들어졌다.
--
-- 보는 법:
--   A: 두 페이지가 모두 존재하는지 / page_id 확인
--   B: 섹션 row 개수·순서·master_id 가 두 날짜에서 같은지 (다르면 그게 원인)
--   C: 각 섹션의 자식 row 개수 — 한쪽이 0 인데 다른쪽이 있으면 빈 자식 INSERT 누락
--   D: 5/26 vs 5/28 section_master_id 차집합 (어느 한쪽에만 있는 마스터)
--   E: 사용자의 worklog_sections + section_order 현재 상태 — stale id / deleted_at 확인
--   F: 5/25 배포 마이그레이션이 실제 적용됐는지 (is_open / background_color 컬럼 존재)
--   G: 두 페이지 row 의 미가공 덤프 (텍스트로 직접 눈으로 비교용)
--   H: 5/28 생성 시각 기준 — 5/26 페이지의 row 중 그 시각 이후에 만들어졌거나 갱신된 것
--      (5/26 페이지를 5/28 생성 이후에도 추가 편집한 경우, carry-over 원본이 지금 보는 5/26 과
--       다를 수 있어 진단을 흐트러뜨림. 이 결과로 어느 row 가 사후 편집된 것인지 가려낸다.)

-- ============================================================
-- 변수: 대상 user_id 를 한 번만 잡아두고 임시 테이블에 저장.
-- ============================================================
DROP TABLE IF EXISTS _diag_target;
CREATE TEMP TABLE _diag_target AS
SELECT id AS user_id
FROM auth.users
WHERE email = 'kbl0226@gmail.com'
LIMIT 1;

-- 안전 체크: user_id 가 잡혔는지
SELECT 'target user_id' AS label, user_id FROM _diag_target;

-- ============================================================
-- A. 두 daily 페이지 존재 확인 + page_id
-- ============================================================
SELECT
  'A. pages' AS section,
  p.page_date,
  p.id           AS page_id,
  p.name,
  p.parent_id,
  p.project_id,
  p.created_at,
  p.updated_at,
  p.deleted_at
FROM pages p, _diag_target t
WHERE p.user_id = t.user_id
  AND p.page_type = 'daily'
  AND p.page_date IN (DATE '2026-05-26', DATE '2026-05-28')
ORDER BY p.page_date;

-- ============================================================
-- B. 섹션 row 비교 (block_type='section')
--    같은 master_id 가 두 날짜에 모두 존재하는지, position·visibility 정상인지
-- ============================================================
WITH pages_in_scope AS (
  SELECT p.id AS page_id, p.page_date
  FROM pages p, _diag_target t
  WHERE p.user_id = t.user_id
    AND p.page_type = 'daily'
    AND p.page_date IN (DATE '2026-05-26', DATE '2026-05-28')
)
SELECT
  'B. section rows' AS section,
  pis.page_date,
  db.position,
  db.section_master_id,
  ws.title          AS master_title,
  ws.scope          AS master_scope,
  ws.visibility     AS master_visibility,
  ws.deleted_at     AS master_deleted_at,
  db.text_content   AS row_text,
  db.visibility     AS row_visibility,
  db.is_fixed_section,
  db.block_id,
  db.parent_block_id,
  db.deleted_at
FROM daily_blocks db
JOIN pages_in_scope pis ON pis.page_id = db.page_id
LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
WHERE db.block_type = 'section'
ORDER BY pis.page_date, db.position;

-- ============================================================
-- C. 섹션별 자식(toggle) row 개수 — 빈 자식 누락 / 이월 누락 진단
-- ============================================================
WITH pages_in_scope AS (
  SELECT p.id AS page_id, p.page_date
  FROM pages p, _diag_target t
  WHERE p.user_id = t.user_id
    AND p.page_type = 'daily'
    AND p.page_date IN (DATE '2026-05-26', DATE '2026-05-28')
),
sec AS (
  SELECT db.block_id AS section_block_id, db.section_master_id,
         db.text_content AS section_title, pis.page_date, pis.page_id
  FROM daily_blocks db
  JOIN pages_in_scope pis ON pis.page_id = db.page_id
  WHERE db.block_type = 'section' AND db.deleted_at IS NULL
)
SELECT
  'C. section children count' AS section,
  sec.page_date,
  sec.section_master_id,
  sec.section_title,
  COUNT(child.block_id)                                          AS children_total,
  COUNT(child.block_id) FILTER (WHERE child.is_carry_over)        AS children_carry_over,
  COUNT(child.block_id) FILTER (WHERE child.is_todo)              AS children_todo,
  COUNT(child.block_id) FILTER (WHERE child.text_content = '' OR child.text_content IS NULL) AS children_empty_text
FROM sec
LEFT JOIN daily_blocks child
  ON child.parent_block_id = sec.section_block_id
 AND child.deleted_at IS NULL
GROUP BY sec.page_date, sec.section_master_id, sec.section_title
ORDER BY sec.page_date, sec.section_master_id;

-- ============================================================
-- D. 5/26 ↔ 5/28 섹션 master_id 차집합 (한쪽에만 있는 master)
-- ============================================================
WITH pages_in_scope AS (
  SELECT p.id AS page_id, p.page_date
  FROM pages p, _diag_target t
  WHERE p.user_id = t.user_id
    AND p.page_type = 'daily'
    AND p.page_date IN (DATE '2026-05-26', DATE '2026-05-28')
),
masters_per_date AS (
  SELECT pis.page_date, db.section_master_id
  FROM daily_blocks db
  JOIN pages_in_scope pis ON pis.page_id = db.page_id
  WHERE db.block_type = 'section' AND db.deleted_at IS NULL
)
SELECT
  'D. master_id diff' AS section,
  COALESCE(m26.section_master_id, m28.section_master_id) AS section_master_id,
  CASE
    WHEN m26.section_master_id IS NULL THEN 'only on 05-28'
    WHEN m28.section_master_id IS NULL THEN 'only on 05-26'
    ELSE 'both'
  END AS presence,
  ws.title       AS master_title,
  ws.scope       AS master_scope,
  ws.visibility  AS master_visibility,
  ws.deleted_at  AS master_deleted_at
FROM (SELECT section_master_id FROM masters_per_date WHERE page_date = DATE '2026-05-26') m26
FULL OUTER JOIN (SELECT section_master_id FROM masters_per_date WHERE page_date = DATE '2026-05-28') m28
  ON m26.section_master_id = m28.section_master_id
LEFT JOIN worklog_sections ws
  ON ws.id = COALESCE(m26.section_master_id, m28.section_master_id)
ORDER BY presence, section_master_id;

-- ============================================================
-- E. 사용자 worklog_sections + section_order — 이 사용자의 섹션 마스터 상태
-- ============================================================
SELECT
  'E1. worklog_sections (global + user)' AS section,
  ws.id,
  ws.title,
  ws.scope,
  ws.visibility,
  ws.sort_order,
  ws.parent_id,
  ws.created_by,
  ws.deleted_at,
  ws.created_at
FROM worklog_sections ws, _diag_target t
WHERE ws.scope = 'global'
   OR (ws.scope = 'user' AND ws.created_by = t.user_id)
ORDER BY ws.scope, ws.sort_order, ws.created_at;

SELECT
  'E2. worklog_user_settings.section_order' AS section,
  s.section_order,
  jsonb_array_length(s.section_order)                  AS ordered_count,
  -- section_order 에 있는 id 중 worklog_sections 에 deleted_at 인 / 없는 것
  (
    SELECT array_agg(elem)
    FROM jsonb_array_elements_text(s.section_order) AS elem
    LEFT JOIN worklog_sections ws ON ws.id = elem
    WHERE ws.id IS NULL OR ws.deleted_at IS NOT NULL
  ) AS stale_ids_in_order
FROM worklog_user_settings s, _diag_target t
WHERE s.user_id = t.user_id;

-- ============================================================
-- F. 5/25 배포 마이그레이션 적용 여부 (컬럼 존재 확인)
-- ============================================================
SELECT
  'F. daily_blocks columns' AS section,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'daily_blocks'
  AND column_name IN ('is_open', 'background_color')
ORDER BY column_name;

-- ============================================================
-- G. 두 페이지의 모든 daily_blocks row 미가공 덤프
--    (위 진단으로 모자랄 때 눈으로 비교용)
-- ============================================================
WITH pages_in_scope AS (
  SELECT p.id AS page_id, p.page_date
  FROM pages p, _diag_target t
  WHERE p.user_id = t.user_id
    AND p.page_type = 'daily'
    AND p.page_date IN (DATE '2026-05-26', DATE '2026-05-28')
)
SELECT
  'G. raw rows' AS section,
  pis.page_date,
  db.position,
  db.block_type,
  db.section_master_id,
  db.block_id,
  db.parent_block_id,
  db.section_id,
  db.text_content,
  db.is_todo,
  db.todo_checked,
  db.is_carry_over,
  db.carry_over_from,
  db.is_pinned,
  db.visibility,
  db.is_fixed_section,
  db.deleted_at,
  db.created_at
FROM daily_blocks db
JOIN pages_in_scope pis ON pis.page_id = db.page_id
ORDER BY pis.page_date, db.position, db.created_at;

-- ============================================================
-- H. 5/28 생성 이후 5/26 페이지에 추가된 / 갱신된 row
--
--    아이디어: 5/28 페이지의 가장 이른 created_at 을 "5/28 생성 시각" 으로 보고,
--             5/26 페이지의 row 중 그 시각 이후의 created_at 또는 updated_at 을 가진 것을 추출.
--    의미: 이 row 들은 carry-over 가 일어난 뒤에 추가된 것이므로
--          "5/28 생성 시점의 5/26 상태" 를 재구성할 때 제외해야 한다.
-- ============================================================
WITH t_28 AS (
  SELECT MIN(db.created_at) AS created_at_28
  FROM daily_blocks db
  JOIN pages p ON p.id = db.page_id
  JOIN _diag_target t ON t.user_id = p.user_id
  WHERE p.page_type = 'daily' AND p.page_date = DATE '2026-05-28'
),
page_26 AS (
  SELECT p.id AS page_id
  FROM pages p, _diag_target t
  WHERE p.user_id = t.user_id
    AND p.page_type = 'daily'
    AND p.page_date = DATE '2026-05-26'
  LIMIT 1
)
SELECT
  'H. post-28 edits on 5/26' AS section,
  (SELECT created_at_28 FROM t_28)                              AS reference_time_28,
  db.position,
  db.block_type,
  db.section_master_id,
  db.text_content,
  db.is_carry_over,
  db.carry_over_from,
  db.created_at,
  db.updated_at,
  CASE
    WHEN db.created_at > (SELECT created_at_28 FROM t_28) THEN 'created after 5/28'
    WHEN db.updated_at > (SELECT created_at_28 FROM t_28) THEN 'updated after 5/28'
  END AS change_kind
FROM daily_blocks db
JOIN page_26 p26 ON p26.page_id = db.page_id
WHERE db.created_at > (SELECT created_at_28 FROM t_28)
   OR db.updated_at > (SELECT created_at_28 FROM t_28)
ORDER BY db.position, db.created_at;
