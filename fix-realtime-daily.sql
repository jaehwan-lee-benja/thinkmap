-- ============================================================================
-- 데일리 업무일지 실시간 동기화 수정
--
-- 진단 결과 (diagnose-realtime-daily.sql):
--   - daily_blocks / worklog_sections / worklog_comments 가 supabase_realtime
--     publication 에 미등록 → 변경 이벤트가 실시간 스트림에 안 실림 (근본 원인)
--   - REPLICA IDENTITY 가 전부 DEFAULT → DELETE 이벤트가 page_id 필터에 안 걸려 누락
--
-- 이 스크립트가 하는 일:
--   1) 세 테이블을 supabase_realtime publication 에 추가 (이미 있으면 건너뜀)
--   2) REPLICA IDENTITY FULL 로 변경 → UPDATE/DELETE 시 old row 전체가 payload 에 실림
--      (useDailyBlocks 의 filter `page_id=eq.PID` 가 DELETE 에도 매칭되도록)
--
-- 코드 변경 불필요. 이 SQL 만 적용하면 즉시 실시간 반영됨.
-- 안전: 데이터 변경 없음 (DDL 메타데이터만). 멱등(idempotent) — 여러 번 실행해도 OK.
--
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 실행.
-- ============================================================================

-- ── 1) publication 등록 (이미 등록돼 있으면 조용히 건너뜀) ──────────────────
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['daily_blocks', 'worklog_sections', 'worklog_comments'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      RAISE NOTICE 'added % to supabase_realtime', tbl;
    ELSE
      RAISE NOTICE '% already in supabase_realtime — skip', tbl;
    END IF;
  END LOOP;
END $$;

-- ── 2) REPLICA IDENTITY FULL (UPDATE/DELETE 이벤트 완전성) ──────────────────
ALTER TABLE public.daily_blocks      REPLICA IDENTITY FULL;
ALTER TABLE public.worklog_sections  REPLICA IDENTITY FULL;
ALTER TABLE public.worklog_comments  REPLICA IDENTITY FULL;

-- ── 3) 검증 — 적용 후 아래가 모두 'YES' / 'f FULL' 이어야 함 ─────────────────
WITH pub AS (
  SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
)
SELECT
  'publication' AS check_type,
  t             AS table_name,
  CASE WHEN t IN (SELECT tablename FROM pub) THEN 'YES (등록됨)' ELSE 'NO ★아직 미등록' END AS result
FROM unnest(ARRAY['daily_blocks','worklog_sections','worklog_comments']) AS t
UNION ALL
SELECT
  'replica_identity',
  c.relname,
  CASE c.relreplident WHEN 'f' THEN 'f FULL (OK)' WHEN 'd' THEN 'd DEFAULT ★아직' ELSE c.relreplident::text END
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('daily_blocks','worklog_sections','worklog_comments')
ORDER BY check_type, table_name;
