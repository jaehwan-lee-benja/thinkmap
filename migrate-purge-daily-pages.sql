-- ============================================================================
-- 사전 폐기 SQL — 기존 daily/calendar 페이지 + 관련 데이터 모두 삭제
-- WORKLOG-SPEC.md v2 — §5.1
-- ============================================================================
--
-- ⚠️  주의:
--   1. 이 스크립트는 v2 출범 직전에 한 번만 실행한다.
--   2. 운영 데이터가 쌓인 후 절대 재실행 금지.
--   3. 사용자 (jaehwan-lee-benja) 의 명시적 승인 후에만 실행.
--   4. 현재는 모든 daily/calendar 데이터가 더미라는 합의 (2026-04-28) 하에 안전.
--
-- 실행 순서:
--   1. 이 스크립트 (사전 폐기)
--   2. migrate-create-daily-blocks.sql (v2 스키마)
--   3. v2 코드 머지/릴리즈
-- ============================================================================

BEGIN;

-- 1. daily/calendar 페이지의 코멘트 제거
DELETE FROM worklog_comments
 WHERE page_id IN (
   SELECT id FROM pages WHERE page_type IN ('daily', 'calendar')
 );

-- 2. daily/calendar 페이지 자체 제거
--    pages 의 ON DELETE CASCADE 로 다른 의존 row 들도 정리됨.
DELETE FROM pages
 WHERE page_type IN ('daily', 'calendar');

-- 3. worklog_user_settings 의 section_order 초기화
--    기존에 폐기되는 자유 섹션 id 가 들어있을 수 있음.
UPDATE worklog_user_settings
   SET section_order = '[]'::jsonb,
       updated_at    = now();

-- 4. 자유 섹션 (worklog_sections.scope='user') 모두 제거
--    v2 출범 후 사용자가 새로 만들도록.
--    scope 컬럼이 아직 없을 수 있으므로 조건부 실행.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'worklog_sections' AND column_name = 'scope'
  ) THEN
    DELETE FROM worklog_sections WHERE scope = 'user';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- 검증 쿼리 (실행 후 확인)
-- ============================================================================
-- SELECT page_type, COUNT(*) FROM pages GROUP BY page_type;
-- → daily/calendar 가 0건이어야 함
--
-- SELECT COUNT(*) FROM worklog_comments;
-- → daily 와 연결된 코멘트 모두 사라졌는지 (다른 page_type 에 코멘트는 그대로)
--
-- SELECT id, scope, title FROM worklog_sections ORDER BY sort_order;
-- → fixed_* (global) 4개만 남았는지
-- ============================================================================
