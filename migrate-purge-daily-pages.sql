-- ============================================================================
-- 사전 폐기 SQL — 기존 daily/calendar 페이지 + 관련 데이터 모두 삭제
-- WORKLOG-SPEC.md v2 — §5.1
-- ============================================================================
--
-- ⛔⛔ 실행 완료·재실행 금지 (봉인 2026-08-02) — 아래 4번 전제는 **이미 만료됐다**
-- ----------------------------------------------------------------------------
-- 4번의 "모든 daily/calendar 데이터가 더미"라는 2026-04-28 합의는 그 시점의 사실이고,
-- 오늘은 거짓이다. 2026-08-02 라이브 실측(sqisntxippjzcekyhqyo) — 재실행 시 삭제되는 양:
--   · pages(page_type in 'daily','calendar')  = 43행 (daily 42 + calendar 1, 4월 이후 실사용)
--   · daily_blocks (위 페이지에 cascade)       = 6,937행
--   · worklog_comments                         = 2행
--   · worklog_user_settings.section_order      = 1행이 [] 로 강제 리셋
--   · worklog_sections(scope='user')           = 7행 하드삭제(이미 소프트삭제분, 이력 영구소실)
-- ★전부 hard delete(soft delete 아님)이고 조건이 날짜가 아니라 **page_type 전체**라
--   범위가 daily 도메인 전량이다. 스크립트에 하드가드(빈 테이블 체크 등)는 **없다**.
-- ★재실행 규칙: 실행하지 마라. 이 파일은 1회용 컷오버 스크립트이며 그 1회는 끝났다.
--   ※본받을 대조군 = migrate-daily-blocks-section-self-ref.sql — 비어있지 않으면
--     `RAISE EXCEPTION`으로 스스로 중단하는 가드를 내장했다. 1회용 파괴 스크립트는 그렇게 써야 한다.
--
-- ⚠️  (원 주의사항 — 보존)
--   1. 이 스크립트는 v2 출범 직전에 한 번만 실행한다.
--   2. 운영 데이터가 쌓인 후 절대 재실행 금지.
--   3. 사용자 (jaehwan-lee-benja) 의 명시적 승인 후에만 실행.
--   4. 현재는 모든 daily/calendar 데이터가 더미라는 합의 (2026-04-28) 하에 안전.
--      ★↑이 전제는 만료됨(위 봉인 배너 참조).
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
