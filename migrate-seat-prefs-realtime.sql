-- ══════════════════════════════════════════════════════════════════════════
-- 자리후(seat) — seat_workspace_prefs 를 Realtime publication 에 등록
-- ══════════════════════════════════════════════════════════════════════════
-- 목적: 스테이션(카이막/커피) 카드 수동 순서를 '워크스페이스(매장) 공유'로 만들면서,
--       한 태블릿에서 바꾼 순서가 같은 매장의 다른 태블릿에도 즉시 반영되게 한다(유저 지시 2026-08-02).
--       저장 위치 = seat_workspace_prefs.prefs.stationOrder (스키마 변경 없음 — 기존 jsonb 재사용).
--
-- 현재 상태: seat_orders·seat_station_status 는 이미 publication 등록 + REPLICA IDENTITY FULL
--            (migrate-create-seat-system.sql [6][7]). seat_workspace_prefs 만 빠져 있어
--            다른 기기는 새로고침해야 순서가 보인다.
--
-- ★안전성:
--   - 스키마·정책 무변경. publication 등록 + REPLICA IDENTITY 설정뿐.
--   - RLS 무변경: Realtime 도 RLS 를 거치므로 다른 매장 행은 여전히 안 보인다
--     (정책 seat_workspace_prefs_rw = can_in_workspace(workspace_id,'editor')).
--   - 재실행 안전: 이미 등록돼 있으면 조용히 건너뛴다(아래 DO 블록).
--   - 미적용이어도 앱은 정상 동작한다(순서 저장·읽기는 되고, 다른 기기 반영이 새로고침 시점으로 늦어질 뿐).
--     → 앱 배포와 순서 의존성 없음(이 마이그만 나중에 적용해도 무방).
--
-- 적용: supabase-guardian 검수 → 유저 승인 후 → thinkmap 통합세션이 적용(tmseat 직접적용 금지).
-- ══════════════════════════════════════════════════════════════════════════

-- 변경 전 행 전체를 payload 에 담아 클라이언트가 prefs 를 즉시 반영할 수 있게 한다.
ALTER TABLE seat_workspace_prefs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'seat_workspace_prefs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seat_workspace_prefs;
    RAISE NOTICE 'added seat_workspace_prefs to supabase_realtime';
  ELSE
    RAISE NOTICE 'seat_workspace_prefs already in supabase_realtime — skip';
  END IF;
END $$;

-- 확인용(적용 후):
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename LIKE 'seat%';
