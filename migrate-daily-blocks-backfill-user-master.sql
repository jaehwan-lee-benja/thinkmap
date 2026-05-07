-- ============================================================================
-- daily_blocks 의 user 자유 섹션 row 의 section_master_id 보강
-- 2026-05-07: ToggleExtension 의 sectionMasterId 미등록 버그로 NULL 덮인 row 회복.
-- ============================================================================
--
-- 매칭 규칙: 같은 user_id + 같은 textContent (섹션 제목) → worklog_sections.id (scope='user')
--   - 다중 매칭 (사용자가 같은 이름 자유 섹션 두 개) 은 첫 매칭만. 정확한 매칭은 사용자 정리.
--   - global (fixed) 시드는 이미 backfill 되어 있어야 (이전 마이그레이션). 본 SQL 은 user scope 만.
-- ============================================================================

BEGIN;

UPDATE daily_blocks db
   SET section_master_id = ws.id
  FROM worklog_sections ws
 WHERE db.block_type = 'section'
   AND db.section_master_id IS NULL
   AND ws.scope = 'user'
   AND ws.created_by = db.user_id
   AND ws.title = db.text_content
   AND ws.deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- 검증
-- ============================================================================
-- SELECT COUNT(*) FILTER (WHERE section_master_id IS NULL) AS still_null,
--        COUNT(*) FILTER (WHERE section_master_id IS NOT NULL) AS filled,
--        COUNT(*) AS total_section_rows
--   FROM daily_blocks
--  WHERE block_type = 'section';
-- ============================================================================
