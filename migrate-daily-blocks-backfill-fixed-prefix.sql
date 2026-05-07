-- ============================================================================
-- daily_blocks.section_master_id 추가 backfill — fixed 섹션 prefix 매칭
-- 2026-05-07
-- ============================================================================
--
-- textContent 가 fixed 섹션 title 로 "시작하는" 모든 row → 그 fixed master id 박음.
-- 예: "당일 이슈123141" → fixed_daily_issue (사용자가 헤더에 오타 입력한 케이스).
--
-- fixed master title (4종) 은 사용자 자유 섹션 이름과 충돌 가능성 낮음 — 안전.
-- ============================================================================

BEGIN;

UPDATE daily_blocks db
   SET section_master_id = ws.id
  FROM worklog_sections ws
 WHERE db.block_type = 'section'
   AND db.section_master_id IS NULL
   AND ws.scope = 'global'
   AND db.text_content LIKE ws.title || '%';

COMMIT;

-- 검증: still_null 이 줄어든 만큼 fixed prefix 매칭 성공.
-- SELECT COUNT(*) FILTER (WHERE section_master_id IS NULL) AS still_null,
--        COUNT(*) FILTER (WHERE section_master_id IS NOT NULL) AS filled
--   FROM daily_blocks WHERE block_type = 'section';
-- ============================================================================
