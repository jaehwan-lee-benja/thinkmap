-- ============================================================================
-- worklog_sections.deleted_at 컬럼 추가
-- 2026-05-04: 자유 섹션 (scope='user') 의 soft delete 지원.
-- ============================================================================
--
-- 사용자가 daily 페이지에서 자유 섹션을 삭제하면 worklog_sections 의 master row 도
-- deleted_at 으로 표시. 이후 daily 페이지 templating 시 deleted master 는 제외.
--
-- fixed (scope='global') 시드 섹션은 절대 deleted 안 함 (NULL 유지).
-- ============================================================================

BEGIN;

ALTER TABLE worklog_sections
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_worklog_sections_active
  ON worklog_sections (scope)
  WHERE deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- 검증
-- ============================================================================
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'worklog_sections' AND column_name = 'deleted_at';
-- ============================================================================
