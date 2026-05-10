-- ============================================================================
-- pages: 같은 (parent_id, page_date) 에 daily 페이지 중복 생성 차단
-- partial unique index — 살아있는 daily row 만 대상.
-- soft-deleted 된 row 는 무시 (재생성 가능).
--
-- 효과:
--   - createDailyPageV2 의 race condition (동시 INSERT 두 개) 시 두 번째 INSERT 가 23505 에러
--   - 코드에서 catch 후 fallback SELECT 로 기존 page_id 반환
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_page_per_date
    ON pages (parent_id, page_date)
 WHERE page_type = 'daily' AND deleted_at IS NULL;
