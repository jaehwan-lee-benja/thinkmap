-- ============================================================================
-- schedule_events — "종료 없이"(포인트 이벤트) 허용
--
-- 기존 CHECK 제약 schedule_events_time_ok 가 end_at > start_at 로 strict 비교라
-- end_at = start_at (= 시간 길이 0, 한 줄 마커 형태 이벤트) 를 거부함.
-- >= 로 완화하여 0-duration 이벤트 허용.
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행.
-- ============================================================================

BEGIN;

ALTER TABLE schedule_events
  DROP CONSTRAINT IF EXISTS schedule_events_time_ok;

ALTER TABLE schedule_events
  ADD CONSTRAINT schedule_events_time_ok
  CHECK (all_day = true OR end_at >= start_at);

COMMIT;
