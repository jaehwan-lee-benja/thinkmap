-- ============================================================================
-- 캘린더(schedule) Phase 1 스키마
--   schedule_events            — 일정 마스터 (단발 + 루틴 템플릿)
--   schedule_event_instances   — 루틴 인스턴스별 override (체크/이동/취소)
--   schedule_event_links       — 일정 ↔ todo/page/block 양방향 참조
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행.
-- linked_accounts / is_master() 가 먼저 존재해야 함.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) schedule_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 표시
  title               text NOT NULL DEFAULT '',
  description         text,
  color               text NOT NULL DEFAULT '#3b82f6',

  -- 시간 (UTC 저장, timezone 은 표시/RRULE 해석용)
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  all_day             boolean NOT NULL DEFAULT false,
  timezone            text NOT NULL DEFAULT 'Asia/Seoul',

  -- 공유 — true 면 모든 linked 계정에서 합쳐 표시 (업무일지 동일 패턴)
  is_shared           boolean NOT NULL DEFAULT false,

  -- 루틴 (Phase 2 에서 사용)
  is_routine          boolean NOT NULL DEFAULT false,
  rrule               text,            -- iCalendar RFC 5545
  routine_until       timestamptz,     -- UNTIL 의 검색 가속용 캐시 (NULL=무한)

  -- Google Calendar 동기 (Phase 5 — 컬럼만 미리 깔아둠)
  google_event_id     text,
  google_calendar_id  text,
  google_etag         text,
  google_synced_at    timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  CONSTRAINT schedule_events_time_ok CHECK (all_day = true OR end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_schedule_events_owner
  ON schedule_events(owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_events_owner_range
  ON schedule_events(owner_user_id, start_at, end_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_events_shared
  ON schedule_events(is_shared, start_at) WHERE deleted_at IS NULL AND is_shared = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_events_google
  ON schedule_events(google_calendar_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

-- updated_at 자동 갱신 (재사용 가능한 일반 함수)
CREATE OR REPLACE FUNCTION schedule_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_schedule_events_touch ON schedule_events;
CREATE TRIGGER trg_schedule_events_touch
  BEFORE UPDATE ON schedule_events
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2) schedule_event_instances  (루틴 1회 발생당 1행, 필요할 때만 생성)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_event_instances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,

  -- RRULE 펼침 결과 중 어느 발생인지 (원본 시작 시각, override 전)
  instance_start_at   timestamptz NOT NULL,

  -- 인스턴스 override (NULL = 원본 그대로)
  moved_start_at      timestamptz,
  moved_end_at        timestamptz,
  cancelled           boolean NOT NULL DEFAULT false,

  -- 체크 (루틴 박스 체크용)
  completed           boolean NOT NULL DEFAULT false,
  completed_at        timestamptz,

  notes               text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (event_id, instance_start_at)
);

CREATE INDEX IF NOT EXISTS idx_schedule_instances_event
  ON schedule_event_instances(event_id);
CREATE INDEX IF NOT EXISTS idx_schedule_instances_when
  ON schedule_event_instances(instance_start_at);

DROP TRIGGER IF EXISTS trg_schedule_instances_touch ON schedule_event_instances;
CREATE TRIGGER trg_schedule_instances_touch
  BEFORE UPDATE ON schedule_event_instances
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3) schedule_event_links  (이벤트 또는 인스턴스 ↔ 외부 엔티티)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_event_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  instance_id         uuid REFERENCES schedule_event_instances(id) ON DELETE CASCADE,

  target_type         text NOT NULL CHECK (target_type IN ('todo','page','block')),
  target_id           uuid NOT NULL,           -- todo = daily_blocks.block_id, page = pages.id, block = daily_blocks.block_id
  sync_check          boolean NOT NULL DEFAULT true,  -- 체크 양방향 동기 여부

  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (event_id, instance_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_links_event
  ON schedule_event_links(event_id);
CREATE INDEX IF NOT EXISTS idx_schedule_links_target
  ON schedule_event_links(target_type, target_id);

-- ----------------------------------------------------------------------------
-- 4) RLS 헬퍼 — linked_accounts 조회를 한 곳에 모음
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_view_schedule_owner(p_owner uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_master() THEN RETURN true; END IF;
  IF auth.uid() = p_owner THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1
    FROM linked_accounts la
    JOIN auth.users u ON LOWER(u.email) = LOWER(la.linked_email)
    WHERE LOWER(la.primary_email) = LOWER(auth.jwt() ->> 'email')
      AND u.id = p_owner
  );
END;
$$;

CREATE OR REPLACE FUNCTION can_edit_schedule_owner(p_owner uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_master() THEN RETURN true; END IF;
  IF auth.uid() = p_owner THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1
    FROM linked_accounts la
    JOIN auth.users u ON LOWER(u.email) = LOWER(la.linked_email)
    WHERE LOWER(la.primary_email) = LOWER(auth.jwt() ->> 'email')
      AND u.id = p_owner
      AND la.permission = 'editor'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) RLS 정책
-- ----------------------------------------------------------------------------
ALTER TABLE schedule_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_event_instances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_event_links       ENABLE ROW LEVEL SECURITY;

-- schedule_events
DROP POLICY IF EXISTS schedule_events_select ON schedule_events;
CREATE POLICY schedule_events_select ON schedule_events
  FOR SELECT TO authenticated
  USING (can_view_schedule_owner(owner_user_id));

DROP POLICY IF EXISTS schedule_events_insert ON schedule_events;
CREATE POLICY schedule_events_insert ON schedule_events
  FOR INSERT TO authenticated
  WITH CHECK (can_edit_schedule_owner(owner_user_id));

DROP POLICY IF EXISTS schedule_events_update ON schedule_events;
CREATE POLICY schedule_events_update ON schedule_events
  FOR UPDATE TO authenticated
  USING (can_edit_schedule_owner(owner_user_id))
  WITH CHECK (can_edit_schedule_owner(owner_user_id));

DROP POLICY IF EXISTS schedule_events_delete ON schedule_events;
CREATE POLICY schedule_events_delete ON schedule_events
  FOR DELETE TO authenticated
  USING (can_edit_schedule_owner(owner_user_id));

-- schedule_event_instances — 부모 event 의 권한에 위임
DROP POLICY IF EXISTS schedule_instances_select ON schedule_event_instances;
CREATE POLICY schedule_instances_select ON schedule_event_instances
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM schedule_events e
    WHERE e.id = schedule_event_instances.event_id
      AND can_view_schedule_owner(e.owner_user_id)
  ));

DROP POLICY IF EXISTS schedule_instances_write ON schedule_event_instances;
CREATE POLICY schedule_instances_write ON schedule_event_instances
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM schedule_events e
    WHERE e.id = schedule_event_instances.event_id
      AND can_edit_schedule_owner(e.owner_user_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM schedule_events e
    WHERE e.id = schedule_event_instances.event_id
      AND can_edit_schedule_owner(e.owner_user_id)
  ));

-- schedule_event_links — 부모 event 의 권한에 위임
DROP POLICY IF EXISTS schedule_links_select ON schedule_event_links;
CREATE POLICY schedule_links_select ON schedule_event_links
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM schedule_events e
    WHERE e.id = schedule_event_links.event_id
      AND can_view_schedule_owner(e.owner_user_id)
  ));

DROP POLICY IF EXISTS schedule_links_write ON schedule_event_links;
CREATE POLICY schedule_links_write ON schedule_event_links
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM schedule_events e
    WHERE e.id = schedule_event_links.event_id
      AND can_edit_schedule_owner(e.owner_user_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM schedule_events e
    WHERE e.id = schedule_event_links.event_id
      AND can_edit_schedule_owner(e.owner_user_id)
  ));

-- ----------------------------------------------------------------------------
-- 6) 주간 범위 조회 RPC — 한 번에 events + 펼친 instance override 같이 받음
--    Phase 1 은 단발만 다루지만, 클라이언트가 한 가지 모양으로 fetch 하도록
--    미리 RPC 로 추상화. owner_ids 빈 배열이면 "내가 볼 수 있는 모든 owner".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_schedule_events_in_range(
  p_from        timestamptz,
  p_to          timestamptz,
  p_owner_ids   uuid[] DEFAULT NULL,
  p_shared_only boolean DEFAULT false
)
RETURNS SETOF schedule_events
LANGUAGE sql STABLE
AS $$
  SELECT e.*
  FROM schedule_events e
  WHERE e.deleted_at IS NULL
    AND (p_owner_ids IS NULL OR e.owner_user_id = ANY(p_owner_ids) OR (p_shared_only AND e.is_shared))
    AND (
      -- 단발: 범위와 시간 겹침
      (e.is_routine = false AND e.start_at < p_to AND e.end_at > p_from)
      -- 루틴: 범위 안에 인스턴스가 있을 수 있는 후보 (정확한 펼침은 클라이언트)
      OR (e.is_routine = true
          AND e.start_at < p_to
          AND (e.routine_until IS NULL OR e.routine_until > p_from))
    );
$$;

COMMIT;
