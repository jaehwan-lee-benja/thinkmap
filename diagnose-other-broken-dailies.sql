-- ============================================================================
-- 다른 깨진 daily 페이지 전수 스캔 (PLAN-board-scope-sections.md §8 Q5)
-- 작성: 2026-05-29
-- ============================================================================
--
-- 목적: 5/28 사고와 같은 "owner 가 다른 page 의 carry-over 로 깨진 daily" 페이지를
--       prod 전체에서 찾아낸다.
--
-- 판정 기준:
--   daily 페이지 P 의 daily_blocks 중 block_type='toggle' 인 row 의 section_id 가
--   같은 page_id=P 에 존재하는 block_type='section' row 의 block_id 와 매칭되지 않으면
--   = "고아 section_id". 화면에서 카드 없이 떠다니는 토글.
--
-- 결과 컬럼:
--   page_date, page_id, owner_email — 어느 페이지가
--   orphan_count                    — 그 페이지 안의 고아 토글 수
--   total_toggles                   — 전체 토글 수 (비율 가늠용)
--   section_rows                    — 그 페이지의 섹션 row 수
-- ============================================================================

WITH section_blocks AS (
  -- 페이지마다 그 페이지 안의 section row 의 block_id 들
  SELECT page_id, block_id
  FROM daily_blocks
  WHERE block_type = 'section'
    AND deleted_at IS NULL
),
orphan_toggles AS (
  SELECT
    db.page_id,
    COUNT(*) AS orphan_count
  FROM daily_blocks db
  WHERE db.block_type = 'toggle'
    AND db.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM section_blocks sb
      WHERE sb.page_id = db.page_id
        AND sb.block_id = db.section_id
    )
  GROUP BY db.page_id
),
page_stats AS (
  SELECT
    page_id,
    COUNT(*) FILTER (WHERE block_type = 'toggle' AND deleted_at IS NULL) AS total_toggles,
    COUNT(*) FILTER (WHERE block_type = 'section' AND deleted_at IS NULL) AS section_rows
  FROM daily_blocks
  GROUP BY page_id
)
SELECT
  p.page_date,
  p.id AS page_id,
  u.email AS owner_email,
  p.parent_id AS board_id,
  o.orphan_count,
  ps.total_toggles,
  ps.section_rows,
  ROUND(100.0 * o.orphan_count / NULLIF(ps.total_toggles, 0), 1) AS orphan_pct,
  p.deleted_at
FROM orphan_toggles o
JOIN pages p ON p.id = o.page_id
LEFT JOIN auth.users u ON u.id = p.user_id
LEFT JOIN page_stats ps ON ps.page_id = o.page_id
WHERE p.page_type = 'daily'
ORDER BY o.orphan_count DESC;
