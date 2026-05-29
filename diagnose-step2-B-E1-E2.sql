-- 5/28 깨짐 원인 확정용 — 한 쿼리씩 따로 실행해서 결과를 복붙
--
-- 실행 방법 (중요):
--   1. 아래 ▼B 블록만 마우스로 드래그해서 선택 → Run
--   2. 결과 복붙해서 보내기
--   3. ▼E1 블록만 선택 → Run → 복붙
--   4. ▼E2 블록만 선택 → Run → 복붙
--
--   (한꺼번에 실행하면 마지막 결과만 보임)


-- ============================================================
-- ▼ B  ── 5/26 vs 5/28 의 섹션 row 비교
--    이거 하나만 드래그해서 Run.
-- ============================================================
SELECT
  p.page_date,
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
  db.parent_block_id
FROM daily_blocks db
JOIN pages p ON p.id = db.page_id
JOIN auth.users u ON u.id = p.user_id
LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
WHERE u.email = 'kbl0226@gmail.com'
  AND p.page_type = 'daily'
  AND p.page_date IN (DATE '2026-05-26', DATE '2026-05-28')
  AND db.block_type = 'section'
ORDER BY p.page_date, db.position;


-- ============================================================
-- ▼ E1 ── kbl0226 이 보유한 worklog_sections (global + user)
--    이거 하나만 드래그해서 Run.
-- ============================================================
SELECT
  ws.id,
  ws.title,
  ws.scope,
  ws.visibility,
  ws.sort_order,
  ws.parent_id,
  ws.created_by,
  ws.deleted_at,
  ws.created_at
FROM worklog_sections ws
JOIN auth.users u ON u.email = 'kbl0226@gmail.com'
WHERE ws.scope = 'global'
   OR (ws.scope = 'user' AND ws.created_by = u.id)
ORDER BY ws.scope, ws.sort_order, ws.created_at;


-- ============================================================
-- ▼ E2 ── kbl0226 의 section_order + stale id 검사
--    이거 하나만 드래그해서 Run.
-- ============================================================
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


-- ============================================================
-- ▼ X  ── kbl0226 의 daily 페이지에서 실제로 참조되는 모든 section_master_id 와
--         그 마스터의 현재 상태 (E1 누락분 탐지 — created_by 가 어긋났는지 확인)
--    이거 하나만 드래그해서 Run.
-- ============================================================
SELECT DISTINCT
  db.section_master_id,
  ws.title,
  ws.scope,
  ws.created_by,
  ws.deleted_at,
  u2.email AS created_by_email
FROM daily_blocks db
JOIN pages p ON p.id = db.page_id
JOIN auth.users u ON u.id = p.user_id
LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
LEFT JOIN auth.users u2 ON u2.id = ws.created_by
WHERE u.email = 'kbl0226@gmail.com'
  AND p.page_type = 'daily'
  AND db.block_type = 'section'
ORDER BY ws.scope NULLS LAST, ws.title;
