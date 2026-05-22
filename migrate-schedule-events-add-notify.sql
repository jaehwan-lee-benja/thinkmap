-- ============================================================================
-- schedule_events.notify_minutes_before 추가
--
-- 이벤트 시작 N분 전 브라우저 알림 (Notification API).
-- NULL = 알림 없음. 0 = 시작 시점. 5 = 5분 전. 등.
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행.
-- ============================================================================

BEGIN;

ALTER TABLE schedule_events
  ADD COLUMN IF NOT EXISTS notify_minutes_before integer;

-- 음수 거부 (0 = 시작 시점, 양수 = N분 전만 허용)
ALTER TABLE schedule_events
  DROP CONSTRAINT IF EXISTS schedule_events_notify_chk;

ALTER TABLE schedule_events
  ADD CONSTRAINT schedule_events_notify_chk
  CHECK (notify_minutes_before IS NULL OR notify_minutes_before >= 0);

COMMIT;
