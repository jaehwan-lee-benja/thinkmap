-- ============================================================================
-- 마스터 권한 visibility 일관 정리
-- 2026-05-07: v1 시점에 daily_blocks.visibility 만 master 로 토글된 master 들을
--             worklog_sections + 모든 daily_blocks 동일 master row 까지 일괄 sync.
-- ============================================================================
--
-- 규칙: daily_blocks 에 visibility='master' 인 section row 가 1개라도 있는 master 는
--      "사용자가 master 권한 의도" → worklog_sections + 다른 페이지의 모든 동일 master
--      section row 도 visibility='master' 로 일치.
-- ============================================================================

BEGIN;

-- 1. worklog_sections: daily_blocks 에 master row 가 있는 master 를 master 로
UPDATE worklog_sections ws
   SET visibility = 'master'
 WHERE ws.id IN (
   SELECT DISTINCT db.section_master_id
     FROM daily_blocks db
    WHERE db.block_type = 'section'
      AND db.visibility = 'master'
      AND db.section_master_id IS NOT NULL
      AND db.deleted_at IS NULL
 )
   AND ws.visibility != 'master';

-- 2. daily_blocks: worklog_sections.visibility='master' 인 master 의 모든 section row 일치
UPDATE daily_blocks db
   SET visibility = 'master'
  FROM worklog_sections ws
 WHERE db.section_master_id = ws.id
   AND db.block_type = 'section'
   AND ws.visibility = 'master'
   AND db.visibility != 'master'
   AND db.deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- 검증
-- ============================================================================
-- SELECT id, title, visibility FROM worklog_sections WHERE visibility = 'master' ORDER BY title;
--
-- SELECT db.page_date, db.text_content, db.visibility, ws.visibility AS master_vis
--   FROM daily_blocks db LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
--  WHERE db.block_type = 'section' AND db.section_master_id IS NOT NULL AND db.deleted_at IS NULL
--    AND db.visibility != ws.visibility;
-- → 결과 0 이어야 정상 (모두 일치)
-- ============================================================================
