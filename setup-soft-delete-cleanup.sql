-- soft-delete된 페이지 자동 정리 (30일 경과 시 완전 삭제)
-- Supabase SQL Editor에서 실행

-- 1. 정리 함수 생성
CREATE OR REPLACE FUNCTION purge_deleted_pages()
RETURNS void AS $$
BEGIN
  DELETE FROM pages
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. pg_cron 확장 활성화 (이미 활성화되어 있으면 무시됨)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. 매일 새벽 3시(UTC) 정리 작업 예약
SELECT cron.schedule(
  'purge-deleted-pages',
  '0 3 * * *',
  'SELECT purge_deleted_pages()'
);
