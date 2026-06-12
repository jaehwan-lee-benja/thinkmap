-- ============================================================================
-- goals — 영역별 목표 정의 (통합 대시보드 D1)
--
--   goals 는 진행률을 저장하지 않는다. metric_source + metric_filter 로
--   기존 도메인 데이터(루틴 인스턴스 / 투두 / 수동값)를 "가리키기만" 하고,
--   진행률은 조회 시점에 클라이언트(goalUtils.js)에서 계산한다.
--   → 기존 테이블이 single source of truth, 데이터 복사 없음.
--
-- 전제(먼저 존재해야 함):
--   - auth.users
--   - is_master()                       (migrate-dynamic-master.sql)
--   - schedule_touch_updated_at()       (migrate-create-schedule-events.sql)
--
-- ⚠ 접근 제어 = 마스터 전용 (payroll 과 동일 모델).
--   이 버전의 대시보드/목표는 "마스터가 운영하는 큰 사이트 + 초대된 멤버는 일부
--   기능만" 구조이므로, goals 는 마스터만 조회/생성/편집/삭제한다.
--   → can_view/can_edit_schedule_owner(self/linked 허용) 재사용을 *철회*하고
--     payroll_sheets 와 동일하게 is_master() 단일 게이트를 쓴다.
--   owner_user_id 컬럼은 귀속/후속 확장(D5)용으로 유지하되 접근 제어엔 쓰지 않는다.
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) goals 테이블
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  domain          text NOT NULL CHECK (domain IN (
                    'routine','asset','fitness','business','general'
                  )),
  title           text NOT NULL DEFAULT '',
  description     text,

  -- 측정 방식 — 어느 도메인 데이터를 집계할지
  metric_source   text NOT NULL CHECK (metric_source IN (
                    'routine_completion',  -- schedule_event_instances.completed 집계
                    'todo_completion',     -- daily_blocks(is_todo) 집계
                    'manual'               -- current_value 수동 입력
                  )),
  -- metric_source 별 집계 대상 지정:
  --   routine_completion: {"event_id": "<uuid>"}
  --   todo_completion:    {"page_id": "<uuid>"}  (생략 시 전체 투두)
  --   manual:             {}
  metric_filter   jsonb NOT NULL DEFAULT '{}'::jsonb,

  target_value    numeric NOT NULL,
  current_value   numeric,               -- metric_source='manual' 일 때만 사용
  unit            text,                  -- 표시용. 예: '회','원','kg'

  period          text NOT NULL DEFAULT 'weekly' CHECK (period IN (
                    'daily','weekly','monthly','quarterly','yearly','once'
                  )),
  deadline        date,                  -- period='once' 일 때 주로 사용

  is_shared       boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_goals_owner
  ON goals (owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goals_shared
  ON goals (is_shared) WHERE deleted_at IS NULL AND is_shared = true;

-- updated_at 자동 갱신 — schedule 과 동일한 일반 트리거 함수 재사용
DROP TRIGGER IF EXISTS trg_goals_touch ON goals;
CREATE TRIGGER trg_goals_touch
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2) RLS — 마스터 전용 (payroll_sheets_master_all 과 동일 패턴)
-- ----------------------------------------------------------------------------
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- 과거(헬퍼 기반) 정책이 있었다면 정리
DROP POLICY IF EXISTS goals_select ON goals;
DROP POLICY IF EXISTS goals_insert ON goals;
DROP POLICY IF EXISTS goals_update ON goals;
DROP POLICY IF EXISTS goals_delete ON goals;

DROP POLICY IF EXISTS goals_master_all ON goals;
CREATE POLICY goals_master_all ON goals
  FOR ALL
  USING (is_master())
  WITH CHECK (is_master());

COMMIT;
