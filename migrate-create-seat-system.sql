-- ============================================================================
-- 자리후 시스템(Seat / 자리후·올리기) — DB 마이그레이션
--
--   카페 주방 4역할(자리안내·제조매니저·카이막·커피) 실시간 협업.
--   seat_orders(주문 행) + seat_station_status(스테이션별 진행) + queue_no 자동부여.
--
-- 명세: docs/SEAT-SPEC.md  (§6 데이터모델 · §7 RLS · §8 실시간)
-- 권한 모델: 워크스페이스 grant (docs/ACCESS-TIERS-SPEC.md / ACCESS-TIERS-MIGRATION-PLAN.md, main)
-- 전제(먼저 존재해야 함 — Phase A 토대, 프로덕션 라이브. 2026-06-25 pg_proc 조회로 존재 확인):
--   - auth.users
--   - current_workspace()                       → uuid  (단일 테넌트: 사루루팜)
--   - can_in_workspace(p_workspace uuid, p_need text) → bool  (서열 owner>editor>viewer)
--
-- ★ 권한 설계 원칙(통합 세션 합의):
--   - orders / station_status 는 "워크스페이스 자산" → 읽기·쓰기 모두 워크스페이스 editor 기준.
--   - 4역할(자리안내/매니저/카이막/커피)은 권한 등급이 아니라 운영 역할/기기 모드다.
--     RLS로 역할을 가르지 않는다(역할 가드는 앱 레벨 — 예: 메뉴나감=매니저만).
--   - 공용 파트너 계정(sarurufarm.partner)·멤버는 이미 워크스페이스 editor grant 보유 → 그대로 동작.
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전(멱등).
-- ★ 합의 없이 프로덕션에 적용하지 말 것 — supabase-guardian 검수 → 사용자 승인 → 통합 세션 적용.
-- ============================================================================

-- ── [0] page_type='seat' 진입 허용 (★ 라이브 제약 확인 후 적용 — 트랜잭션 밖) ──────
--   pages.page_type 에 CHECK 제약이 걸려 있으면 'seat' 를 허용 목록에 추가해야 한다.
--   라이브 제약명·목록을 모르므로(조회 차단) 통합 세션이 적용 시 아래로 확인 후 처리한다.
--
--   (1) 현재 제약 확인:
--       SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--         WHERE conrelid = 'public.pages'::regclass AND contype = 'c';
--   (2-a) page_type CHECK 가 없으면(자유 text) → 추가 작업 불필요.
--   (2-b) page_type CHECK 가 있으면 → 기존 목록 전체 + 'seat' 로 교체:
--       ALTER TABLE pages DROP CONSTRAINT <conname>;
--       ALTER TABLE pages ADD CONSTRAINT <conname>
--         CHECK (page_type IN ( ...기존 값 전부..., 'seat' ));

BEGIN;

-- ── [1] seat_orders — 주문 행 (워크스페이스 자산) ───────────────────────────
CREATE TABLE IF NOT EXISTS seat_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL DEFAULT current_workspace(),               -- 테넌시(워크스페이스 자산)
  business_date   date NOT NULL DEFAULT current_date,
  queue_no        int  NOT NULL DEFAULT 0,                                 -- 트리거가 (ws,date)별 1,2,3… 부여
  order_no        text,                                                    -- 주문번호(수기)
  seat_status     text NOT NULL DEFAULT 'pending'
                    CHECK (seat_status IN ('pending','raised','canceled')),
  review_flag     text NOT NULL DEFAULT 'none'                             -- R3: 기본 '-'(=none)
                    CHECK (review_flag IN ('none','확인필요','주문중','차후주문')),
  opt_outdoor          boolean NOT NULL DEFAULT false,                     -- 야외
  opt_takeout          boolean NOT NULL DEFAULT false,                     -- 포장
  opt_outdoor_parallel boolean NOT NULL DEFAULT false,                     -- 야외병행
  seat_order_alive     boolean NOT NULL DEFAULT true,                      -- R4: 살아있음 / false=순서없이(취소)
  seated          boolean NOT NULL DEFAULT false,                          -- 자리앉음
  raised          boolean NOT NULL DEFAULT false,                          -- 올리기 전달
  raised_at       timestamptz,                                             -- 올림 시각(후속 소요시간 분석)
  menu_out        boolean NOT NULL DEFAULT false,                          -- R5: 제조매니저만(앱 가드)
  confirm_flag    boolean NOT NULL DEFAULT false,                          -- 확인필요(상태선택과 별개 플래그)
  notes           text,                                                    -- 특이사항
  created_by_role text,                                                    -- 입력 주체 역할 key(스냅샷, 운영용)
  created_by      uuid DEFAULT auth.uid(),                                 -- 작성자(감사용; 공용계정 운영이라 보조)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- ── [2] seat_station_status — 스테이션별 진행 (카이막/커피 독립, R6) ─────────
CREATE TABLE IF NOT EXISTS seat_station_status (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES seat_orders(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL DEFAULT current_workspace(),                 -- 테넌시(부모 order 와 동일 워크스페이스)
  business_date date NOT NULL DEFAULT current_date,                        -- Realtime 필터용 비정규화
  station       text NOT NULL,                                             -- 'kaymak' | 'coffee' | 확장
  received      boolean NOT NULL DEFAULT false,                            -- 올라감
  completed     boolean NOT NULL DEFAULT false,                            -- 제조 완료함(독립)
  change_note   text,                                                      -- 변동사항 "포장으로 변경" 등
  completed_at  timestamptz,                                               -- 완료 시각(후속 소요시간 분석)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, station)
);

-- ── [3] 트리거 — workspace_id 강제 + queue_no 자동부여 + updated_at 갱신 ─────
--   workspace_id 를 서버에서 강제(클라 위조·크로스테넌트 차단). queue_no 는 advisory lock 으로
--   (workspace, business_date) 단위 직렬화 → MAX+1 동시성 경쟁 제거. (supabase-guardian #3·#4·#5)
CREATE OR REPLACE FUNCTION seat_orders_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.workspace_id := current_workspace();   -- 위조 방지: 항상 현재 워크스페이스
  IF NEW.queue_no IS NULL OR NEW.queue_no = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id::text || ':' || NEW.business_date::text, 0));
    SELECT COALESCE(MAX(queue_no), 0) + 1 INTO NEW.queue_no
    FROM seat_orders
    WHERE workspace_id = NEW.workspace_id AND business_date = NEW.business_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seat_orders_before_insert ON seat_orders;
CREATE TRIGGER trg_seat_orders_before_insert
  BEFORE INSERT ON seat_orders
  FOR EACH ROW EXECUTE FUNCTION seat_orders_before_insert();

-- station_status: workspace_id 를 부모 order 에서 강제(부모와 불일치·오염 차단)
CREATE OR REPLACE FUNCTION seat_station_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT workspace_id INTO NEW.workspace_id FROM seat_orders WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seat_station_before_insert ON seat_station_status;
CREATE TRIGGER trg_seat_station_before_insert
  BEFORE INSERT ON seat_station_status
  FOR EACH ROW EXECUTE FUNCTION seat_station_before_insert();

-- updated_at 자동 갱신(양 테이블; 클라 의존 제거)
CREATE OR REPLACE FUNCTION seat_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seat_orders_touch ON seat_orders;
CREATE TRIGGER trg_seat_orders_touch
  BEFORE UPDATE ON seat_orders FOR EACH ROW EXECUTE FUNCTION seat_touch_updated_at();
DROP TRIGGER IF EXISTS trg_seat_station_touch ON seat_station_status;
CREATE TRIGGER trg_seat_station_touch
  BEFORE UPDATE ON seat_station_status FOR EACH ROW EXECUTE FUNCTION seat_touch_updated_at();

-- ── [4] 인덱스 ───────────────────────────────────────────────────────────────
-- queue_no 중복 차단(동시성 안전망 — advisory lock 과 이중 방어). (supabase-guardian #5)
CREATE UNIQUE INDEX IF NOT EXISTS uq_seat_orders_ws_date_queue
  ON seat_orders (workspace_id, business_date, queue_no);
CREATE INDEX IF NOT EXISTS idx_seat_station_ws_date
  ON seat_station_status (workspace_id, business_date);
CREATE INDEX IF NOT EXISTS idx_seat_station_order
  ON seat_station_status (order_id);

-- ── [5] RLS — 워크스페이스 editor 단일 기준(역할 구분 없음) ─────────────────
--   읽기·쓰기 모두 "그 행의 워크스페이스에서 editor 이상" 이면 허용.
--   owner(마스터)는 서열상 editor 체크를 자동 통과. 4역할은 RLS로 가르지 않는다.
ALTER TABLE seat_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_station_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seat_orders_rw ON seat_orders;
CREATE POLICY seat_orders_rw ON seat_orders FOR ALL
  USING      (can_in_workspace(workspace_id, 'editor'))
  WITH CHECK (can_in_workspace(workspace_id, 'editor'));

DROP POLICY IF EXISTS seat_station_rw ON seat_station_status;
CREATE POLICY seat_station_rw ON seat_station_status FOR ALL
  USING      (can_in_workspace(workspace_id, 'editor'))
  WITH CHECK (can_in_workspace(workspace_id, 'editor'));

-- ── [6] REPLICA IDENTITY FULL ────────────────────────────────────────────────
--   UPDATE/DELETE 시 old row 전체가 payload 에 실려야 클라 filter `business_date=eq.…` 가
--   DELETE 이벤트에도 매칭됨(useDailyBlocks 선례).
ALTER TABLE seat_orders         REPLICA IDENTITY FULL;
ALTER TABLE seat_station_status REPLICA IDENTITY FULL;

-- ── [7] Realtime publication 등록 (이미 등록돼 있으면 조용히 건너뜀) ──────────
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['seat_orders', 'seat_station_status'];
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

COMMIT;

-- ── [8] 검증 — 적용 후 아래가 모두 'YES' / 'f FULL' 이어야 함 ─────────────────
WITH pub AS (
  SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
)
SELECT
  'publication' AS check_type,
  t             AS table_name,
  CASE WHEN t IN (SELECT tablename FROM pub) THEN 'YES (등록됨)' ELSE 'NO ★아직 미등록' END AS result
FROM unnest(ARRAY['seat_orders','seat_station_status']) AS t
UNION ALL
SELECT
  'replica_identity',
  c.relname,
  CASE c.relreplident WHEN 'f' THEN 'f FULL (OK)' WHEN 'd' THEN 'd DEFAULT ★아직' ELSE c.relreplident::text END
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('seat_orders','seat_station_status')
UNION ALL
SELECT
  'rls_enabled',
  c.relname,
  CASE WHEN c.relrowsecurity THEN 'YES (RLS on)' ELSE 'NO ★RLS off' END
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('seat_orders','seat_station_status')
ORDER BY check_type, table_name;
