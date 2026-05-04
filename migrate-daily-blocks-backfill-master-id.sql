-- ============================================================================
-- daily_blocks 의 옛 section row 의 section_master_id 일괄 backfill
-- 2026-05-04: §9.9 마이그레이션 이전에 INSERT 된 row 들이 NULL 인 케이스 회복.
-- ============================================================================
--
-- §3.4 정책:
--   - block_type='section' row 만 sectionMasterId 채움
--   - 일반 toggle row 의 sectionMasterId 는 NULL 이 정상 (그대로)
--
-- 매칭 규칙:
--   - daily_blocks.text_content (섹션 제목) === worklog_sections.title
--   - global scope (fixed) 만 backfill. user scope 자유 섹션은 사용자 데이터라 보류.
-- ============================================================================

BEGIN;

UPDATE daily_blocks db
   SET section_master_id = ws.id
  FROM worklog_sections ws
 WHERE db.block_type = 'section'
   AND db.section_master_id IS NULL
   AND db.text_content = ws.title
   AND ws.scope = 'global';

COMMIT;

-- ============================================================================
-- 검증 쿼리
-- ============================================================================
-- SELECT COUNT(*) FILTER (WHERE section_master_id IS NULL) AS still_null,
--        COUNT(*) FILTER (WHERE section_master_id IS NOT NULL) AS backfilled,
--        COUNT(*) AS total_section_rows
--   FROM daily_blocks
--  WHERE block_type = 'section';
-- ============================================================================
