-- ============================================================================
-- 진단: 레거시 루틴 instance override 고아화 위험군
--
-- 배경: commit 28ca5dd "루틴 요일 +1일 시프트 해결 — event.timezone 정규화" 로
--   RRULE 펼침 기준 프레임이 (UTC) → (event.timezone floating) 으로 바뀌었다.
--   그 수정 *이전* 에 생성된 schedule_event_instances row 는 구(UTC) 프레임의
--   instant 로 instance_start_at 이 저장돼, 새 펼침 instant 와 매칭 안 될 수 있다.
--   (SCHEDULE-SPEC §6.x "레거시 instance 고아화" 참조)
--
-- 위험 조건(모두 충족) — 시프트가 실제로 회차를 다른 날로 밀어내는 케이스:
--   1) is_routine 루틴 + rrule 의 BYDAY 가 1~2개 요일만 지정
--      (요일을 적게 고를수록 +1일 밀림이 "제외 요일"을 바꿔 어긋남이 커짐)
--   2) 시작 시각이 event.timezone 기준 오전 09:00 미만(아침 루틴)
--      → KST 09:00 이전은 UTC 로는 전날이라 +1 로컬일로 밀리는 구간
--   3) 해당 event 에 "의미 있는" instance override 존재
--      (moved_start_at / cancelled / completed 중 하나 — 단순 빈 row 제외)
--
-- 결과 risk_count = 0 → 마이그레이션 불필요(기존 override 가 없거나 안전 패턴뿐).
-- > 0 → §6 의 event 별 tz 델타 재계산 마이그레이션 검토.
--
-- 전부 SELECT (읽기 전용). Supabase SQL Editor 에서 블록별 실행.
-- ============================================================================

-- ── A) 위험군 개수 (이 값이 0 이면 끝) ──────────────────────────────────────
WITH routines AS (
  SELECT
    e.id, e.owner_user_id, e.title, e.start_at, e.timezone, e.rrule,
    (e.start_at AT TIME ZONE e.timezone)::time AS local_start_time,
    substring(e.rrule FROM 'BYDAY=([^;]*)')    AS byday_raw
  FROM schedule_events e
  WHERE e.is_routine = true
    AND e.rrule IS NOT NULL
    AND e.deleted_at IS NULL
),
classified AS (
  SELECT r.*,
    CASE WHEN r.byday_raw IS NULL OR r.byday_raw = '' THEN 0
         ELSE array_length(string_to_array(r.byday_raw, ','), 1) END AS byday_count
  FROM routines r
)
SELECT count(*) AS risk_count
FROM classified c
WHERE c.byday_count BETWEEN 1 AND 2
  AND c.local_start_time < TIME '09:00'
  AND EXISTS (
    SELECT 1 FROM schedule_event_instances i
    WHERE i.event_id = c.id
      AND (i.moved_start_at IS NOT NULL OR i.cancelled OR i.completed)
  );

-- ── B) (risk_count > 0 일 때만) 위험군 상세 — 어떤 루틴/회차가 걸리는지 ──────
WITH routines AS (
  SELECT
    e.id, e.owner_user_id, e.title, e.start_at, e.timezone, e.rrule,
    (e.start_at AT TIME ZONE e.timezone)::time AS local_start_time,
    substring(e.rrule FROM 'BYDAY=([^;]*)')    AS byday_raw
  FROM schedule_events e
  WHERE e.is_routine = true
    AND e.rrule IS NOT NULL
    AND e.deleted_at IS NULL
),
classified AS (
  SELECT r.*,
    CASE WHEN r.byday_raw IS NULL OR r.byday_raw = '' THEN 0
         ELSE array_length(string_to_array(r.byday_raw, ','), 1) END AS byday_count
  FROM routines r
)
SELECT
  c.id AS event_id, c.title, c.timezone,
  c.local_start_time, c.byday_raw, c.byday_count,
  count(i.*)                                   AS instance_total,
  count(i.*) FILTER (WHERE i.moved_start_at IS NOT NULL) AS moved_cnt,
  count(i.*) FILTER (WHERE i.cancelled)        AS cancelled_cnt,
  count(i.*) FILTER (WHERE i.completed)        AS completed_cnt
FROM classified c
JOIN schedule_event_instances i ON i.event_id = c.id
WHERE c.byday_count BETWEEN 1 AND 2
  AND c.local_start_time < TIME '09:00'
  AND (i.moved_start_at IS NOT NULL OR i.cancelled OR i.completed)
GROUP BY c.id, c.title, c.timezone, c.local_start_time, c.byday_raw, c.byday_count
ORDER BY instance_total DESC;
