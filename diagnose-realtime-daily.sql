-- ============================================================================
-- 데일리 업무일지 실시간 동기화 진단 (READ-ONLY · 단일 쿼리)
--
-- 전체를 한 번에 복붙해서 실행 → 하나의 결과표에 모든 항목이 나옵니다.
-- (Supabase SQL Editor 는 여러 문을 실행하면 마지막 결과만 보여주므로,
--  의도적으로 UNION ALL 단일 쿼리로 합쳐 두었습니다.)
--
-- 결과 읽는 법:
--   section = 'A. publication'      → result 가 'NO ★문제' 인 행이 있으면 그게 원인.
--                                      daily_blocks 가 NO 면 = 구독은 되지만 이벤트가 안 옴.
--   section = 'B. replica_identity' → result 가 'd DEFAULT...' 면 UPDATE/DELETE 누락 가능.
--                                      'f FULL (OK)' 이어야 정상.
--   section = 'C. rls_enabled'      → 참고용.
--   section = 'C2. select_policy'   → 마스터(is_master())가 포함돼 있으면 마스터 간 수신 OK.
-- ============================================================================

WITH pub AS (
  SELECT tablename
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
),
checks AS (
  -- [A] 대상 테이블이 supabase_realtime publication 에 등록됐는지  ★핵심
  SELECT
    'A. publication'::text AS section,
    t                       AS item,
    CASE WHEN t IN (SELECT tablename FROM pub)
         THEN 'YES (등록됨)'
         ELSE 'NO ★문제 — 실시간 이벤트 안 옴'
    END                     AS result
  FROM unnest(ARRAY['daily_blocks','worklog_sections','worklog_comments','pages']) AS t

  UNION ALL
  -- [B] REPLICA IDENTITY ('f' FULL 이어야 UPDATE/DELETE 실시간 정상)
  SELECT
    'B. replica_identity',
    c.relname,
    CASE c.relreplident
      WHEN 'd' THEN 'd DEFAULT — UPDATE/DELETE 이벤트 불완전 가능'
      WHEN 'f' THEN 'f FULL (OK)'
      WHEN 'i' THEN 'i INDEX'
      WHEN 'n' THEN 'n NOTHING — 실시간 불가'
    END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('daily_blocks','worklog_sections','worklog_comments')

  UNION ALL
  -- [C] RLS 활성화 여부 (참고)
  SELECT
    'C. rls_enabled',
    c.relname,
    CASE WHEN c.relrowsecurity THEN 'ON' ELSE 'OFF' END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('daily_blocks','worklog_sections','worklog_comments')

  UNION ALL
  -- [C-2] SELECT 정책 요약 (수신자가 row 를 볼 수 있어야 실시간 이벤트 전달됨)
  SELECT
    'C2. select_policy(' || tablename || ')',
    policyname,
    COALESCE(qual, '(no using expr)')
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd = 'SELECT'
    AND tablename IN ('daily_blocks','worklog_sections','worklog_comments')
)
SELECT section, item, result
FROM checks
ORDER BY section, item;
