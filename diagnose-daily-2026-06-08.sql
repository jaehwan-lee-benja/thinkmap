-- ============================================================================
-- 6/8 일반 사용자 daily 양식 깨짐 진단 — A~D 단일 쿼리 통합본
-- 작성: 2026-06-09
-- 실행: Supabase Dashboard → SQL Editor 에 "전체 복붙" 후 Run
--   → 결과가 한 그리드에 q(구역) / ord(순서) / payload(jsonb) 로 전부 나온다.
--   → payload 셀을 클릭하면 행 내용이 펼쳐진다. q='C...' 의 _count 가 핵심.
-- ============================================================================
--
-- 가설:
--   board-scope 전환 후 비마스터가 새 daily 를 만들면 board 섹션 세트의
--   visibility='master' 섹션 row 까지 INSERT 된다.
--   - daily_blocks SELECT 정책: USING (visibility='all' OR is_master())
--     → 비마스터 owner 는 자기 페이지의 master 섹션 헤더를 "못 본다".
--   - 그 아래 빈 자식 토글은 visibility='all' 하드코딩 → owner 가 "본다".
--   결과: 헤더 없이 떠다니는 고아 토글 = 양식 깨짐.
--
-- 구역:
--   A. 6/8 daily 페이지 목록 (+ owner 마스터 여부, 섹션/토글 수)
--   B. 6/8 섹션 row 상세 (row visibility vs 마스터 정의 visibility)
--   C. ★핵심★ 비마스터 owner 화면의 고아 토글 수 (>0 이면 가설 확정)
--   D. 보드의 visibility='master' 섹션 정의 (무엇이 숨는지)
-- ============================================================================

WITH master_sections AS (
  SELECT page_id, block_id
  FROM daily_blocks
  WHERE block_type='section' AND visibility='master' AND deleted_at IS NULL
),
qa AS (
  SELECT
    p.id                 AS page_id,
    p.page_date,
    u.email              AS owner_email,
    (au.role='master')   AS owner_is_master,
    p.parent_id          AS board_id,
    bp.name              AS board_name,
    COUNT(*) FILTER (WHERE db.block_type='section' AND db.deleted_at IS NULL)                          AS section_rows,
    COUNT(*) FILTER (WHERE db.block_type='section' AND db.visibility='master' AND db.deleted_at IS NULL) AS master_section_rows,
    COUNT(*) FILTER (WHERE db.block_type='toggle'  AND db.deleted_at IS NULL)                          AS toggle_rows
  FROM pages p
  LEFT JOIN auth.users u   ON u.id = p.user_id
  LEFT JOIN app_users au    ON au.auth_uid = p.user_id
  LEFT JOIN pages bp        ON bp.id = p.parent_id
  LEFT JOIN daily_blocks db ON db.page_id = p.id
  WHERE p.page_type='daily' AND p.page_date='2026-06-08' AND p.deleted_at IS NULL
  GROUP BY p.id, p.page_date, u.email, au.role, p.parent_id, bp.name
),
qb AS (
  SELECT
    u.email              AS owner_email,
    (au.role='master')   AS owner_is_master,
    db.section_master_id,
    ws.title             AS master_title,
    db.visibility        AS row_visibility,
    ws.visibility        AS master_visibility,
    ws.scope             AS master_scope,
    db.position
  FROM pages p
  JOIN daily_blocks db ON db.page_id=p.id AND db.block_type='section' AND db.deleted_at IS NULL
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN app_users au  ON au.auth_uid = p.user_id
  LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
  WHERE p.page_type='daily' AND p.page_date='2026-06-08' AND p.deleted_at IS NULL
),
qc AS (
  SELECT
    u.email   AS owner_email,
    p.id      AS page_id,
    COUNT(*)  AS orphaned_for_owner,
    STRING_AGG(DISTINCT ws.title, ', ') AS under_master_sections
  FROM pages p
  JOIN daily_blocks t ON t.page_id=p.id AND t.block_type='toggle' AND t.deleted_at IS NULL AND t.visibility='all'
  JOIN master_sections ms ON ms.page_id=p.id AND ms.block_id=t.section_id
  LEFT JOIN daily_blocks sec ON sec.block_id=t.section_id
  LEFT JOIN worklog_sections ws ON ws.id=sec.section_master_id
  LEFT JOIN auth.users u ON u.id=p.user_id
  LEFT JOIN app_users au  ON au.auth_uid=p.user_id
  WHERE p.page_type='daily' AND p.page_date='2026-06-08' AND p.deleted_at IS NULL
    AND COALESCE(au.role,'user') <> 'master'
  GROUP BY u.email, p.id
),
qd AS (
  SELECT
    ws.board_id,
    bp.name AS board_name,
    ws.id   AS section_master_id,
    ws.title,
    ws.scope,
    ws.visibility,
    ws.deleted_at
  FROM worklog_sections ws
  LEFT JOIN pages bp ON bp.id = ws.board_id
  WHERE ws.visibility='master' AND ws.deleted_at IS NULL
)
SELECT q, ord, payload FROM (
  -- A
  SELECT 'A. 6/8 daily 페이지'::text AS q, 0::bigint AS ord,
         jsonb_build_object('_count', (SELECT COUNT(*) FROM qa)) AS payload
  UNION ALL
  SELECT 'A. 6/8 daily 페이지', ROW_NUMBER() OVER (ORDER BY owner_email), to_jsonb(qa) FROM qa
  UNION ALL
  -- B
  SELECT 'B. 섹션 row 상세', 0::bigint,
         jsonb_build_object('_count', (SELECT COUNT(*) FROM qb))
  UNION ALL
  SELECT 'B. 섹션 row 상세', ROW_NUMBER() OVER (ORDER BY owner_email, position), to_jsonb(qb) FROM qb
  UNION ALL
  -- C  ★핵심★ — _count > 0 이면 가설 확정
  SELECT 'C. 비마스터 고아 토글(핵심)', 0::bigint,
         jsonb_build_object('_count', (SELECT COUNT(*) FROM qc), '_orphan_total', (SELECT COALESCE(SUM(orphaned_for_owner),0) FROM qc))
  UNION ALL
  SELECT 'C. 비마스터 고아 토글(핵심)', ROW_NUMBER() OVER (ORDER BY orphaned_for_owner DESC), to_jsonb(qc) FROM qc
  UNION ALL
  -- D
  SELECT 'D. board master 섹션 정의', 0::bigint,
         jsonb_build_object('_count', (SELECT COUNT(*) FROM qd))
  UNION ALL
  SELECT 'D. board master 섹션 정의', ROW_NUMBER() OVER (ORDER BY board_id, title), to_jsonb(qd) FROM qd
) z
ORDER BY q, ord;
