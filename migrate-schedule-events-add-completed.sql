-- ============================================================================
-- schedule_events.completed / completed_at 추가
--
-- 단발 이벤트(루틴 아닌) 도 박스 체크 가능하도록.
-- 루틴은 schedule_event_instances 의 completed 사용 (변경 없음).
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행.
-- ============================================================================

BEGIN;

ALTER TABLE schedule_events
  ADD COLUMN IF NOT EXISTS completed     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at  timestamptz;

-- (인덱스는 현재 미체크 조회 빈도 낮아 추가하지 않음. 필요시 후속.)

COMMIT;
