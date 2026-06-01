-- ============================================================================
-- 일반 페이지 실시간 동기화 (Option 1: 문서 전체 동기화 + 충돌 배너)
--
-- 일반 페이지는 content_tiptap (단일 JSONB) 에 통째로 저장된다.
-- TipTapTestPage 에 pages UPDATE 실시간 구독을 붙여 다른 탭/사용자의 저장을
-- ~1초 내 화면에 반영한다. 충돌(내가 편집 중인데 상대도 저장)은 코드 측 배너로 처리.
--
-- 이 스크립트가 하는 일:
--   1) pages 를 supabase_realtime publication 에 추가 (이미 있으면 건너뜀)
--   2) "수정자 이름" 표시용 컬럼 추가 (last_edited_by, last_edited_by_email)
--      → 저장 시 기록되고, 실시간 payload(new) 에 실려와 추가 조회 없이 'OOO님이 수정' 표시.
--
-- ★ REPLICA IDENTITY 는 DEFAULT 유지 (FULL 로 바꾸지 않음):
--   - 실시간 처리는 UPDATE 의 new(전체 행) 만 필요하고, 필터 id=eq.PID 는 PK 라 DEFAULT 로 충분.
--   - content_tiptap 이 큰 JSONB 라서 FULL 로 두면 매 저장마다 old 행 전체가 WAL 에 실려 비용 큼.
--
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 실행. 멱등(여러 번 실행 OK).
-- ============================================================================

-- ── 1) 수정자 표시용 컬럼 (먼저 추가해야 코드 저장이 동작) ───────────────────
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS last_edited_by       uuid,
  ADD COLUMN IF NOT EXISTS last_edited_by_email text;

-- ── 2) pages 를 realtime publication 에 추가 (이미 있으면 조용히 건너뜀) ──────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pages;
    RAISE NOTICE 'added pages to supabase_realtime';
  ELSE
    RAISE NOTICE 'pages already in supabase_realtime — skip';
  END IF;
END $$;

-- ── 3) 검증 — publication 에 pages 가 YES 로 보이면 성공 ──────────────────────
SELECT
  'publication' AS check_type,
  'pages'       AS table_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pages'
  ) THEN 'YES (등록됨)' ELSE 'NO ★아직 미등록' END AS result
UNION ALL
SELECT 'column', 'pages.last_edited_by',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pages' AND column_name='last_edited_by')
  THEN 'YES' ELSE 'NO ★' END
UNION ALL
SELECT 'column', 'pages.last_edited_by_email',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pages' AND column_name='last_edited_by_email')
  THEN 'YES' ELSE 'NO ★' END
ORDER BY check_type, table_name;
