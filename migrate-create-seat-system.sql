-- ============================================================================
-- 자리후 시스템(Seat / 자리후·올리기) — DB 마이그레이션
--
--   카페 주방 4역할(자리안내·제조매니저·카이막·커피) 실시간 협업.
--   seat_orders(주문 행) + seat_station_status(스테이션별 진행) + queue_no 자동부여.
--
-- 명세: docs/SEAT-SPEC.md  (§6 데이터모델 · §7 RLS · §8 실시간)
-- 전제(먼저 존재해야 함):
--   - auth.users
--   - pages                          (board_id 테넌시 참조)
--   - is_master()                    (migrate-dynamic-master.sql)
--   - is_board_member(board_id uuid) (migrate-create-members.sql)
--   - worklog_board_members          (is_board_member 가 참조)
--
-- ⚠ 이 파일은 'pages' CHECK 제약(page_type)을 건드리지 않는다(안전). 자리후 *페이지*
--   진입(page_type='seat')을 코드로 붙이는 단계에서, 라이브 제약 확인 후 'seat'를
--   추가한다. → 파일 맨 아래 [STEP B] 주석 참조.
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전(멱등).
-- ★ 합의 없이 프로덕션에 적용하지 말 것 — 통합 세션 승인 후 적용.
-- ============================================================================

BEGIN;

-- ── 1) seat_orders — 주문 행 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seat_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,   -- 테넌시(매장)
  business_date   date NOT NULL DEFAULT current_date,
  queue_no        int  NOT NULL DEFAULT 0,                                -- 트리거가 (board,date)별 1,2,3… 부여
  order_no        text,                                                   -- 주문번호(수기)
  seat_status     text NOT NULL DEFAULT 'pending'
                    CHECK (seat_status IN ('pending','raised','canceled')),
  review_flag     text NOT NULL DEFAULT 'none'                            -- R3: 기본 '-'(=none)
                    CHECK (review_flag IN ('none','확인필요','주문중','차후주문')),
  opt_outdoor          boolean NOT NULL DEFAULT false,                    -- 야외
  opt_takeout          boolean NOT NULL DEFAULT false,                    -- 포장
  opt_outdoor_parallel boolean NOT NULL DEFAULT false,                    -- 야외병행
  seat_order_alive     boolean NOT NULL DEFAULT true,                     -- R4: 살아있음 / false=순서없이(취소)
  seated          boolean NOT NULL DEFAULT false,                         -- 자리앉음
  raised          boolean NOT NULL DEFAULT false,                         -- 올리기 전달
  menu_out        boolean NOT NULL DEFAULT false,                         -- R5: 제조매니저만
  notes           text,                                                   -- 특이사항
  created_by_role text,                                                   -- 입력 주체 역할 key(스냅샷)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- ── 2) seat_station_status — 스테이션별 진행 (카이막/커피 독립, R6) ──────────
CREATE TABLE IF NOT EXISTS seat_station_status (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES seat_orders(id) ON DELETE CASCADE,
  board_id      uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  business_date date NOT NULL DEFAULT current_date,                       -- Realtime 필터용 비정규화
  station       text NOT NULL,                                            -- 'kaymak' | 'coffee' | 확장
  received      boolean NOT NULL DEFAULT false,                           -- 올림을 그 스테이션이 받음
  completed     boolean NOT NULL DEFAULT false,                           -- 그 스테이션 완료(독립)
  change_note   text,                                                     -- 변동사항 "포장으로 변경" 등
  completed_at  timestamptz,                                              -- 완료 시각(후속 소요시간 분석)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, station)
);

-- ── 3) queue_no 자동부여 — (board, business_date)별 순번 ─────────────────────
--   동시 insert 시 클라 max+1 경쟁을 피하려 DB에서 부여. queue_no 미지정(0/NULL)일 때만.
CREATE OR REPLACE FUNCTION seat_orders_assign_queue_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.queue_no IS NULL OR NEW.queue_no = 0 THEN
    SELECT COALESCE(MAX(queue_no), 0) + 1 INTO NEW.queue_no
    FROM seat_orders
    WHERE board_id = NEW.board_id AND business_date = NEW.business_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seat_orders_queue_no ON seat_orders;
CREATE TRIGGER trg_seat_orders_queue_no
  BEFORE INSERT ON seat_orders
  FOR EACH ROW EXECUTE FUNCTION seat_orders_assign_queue_no();

-- ── 4) 인덱스 ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seat_orders_board_date_queue
  ON seat_orders (board_id, business_date, queue_no);
CREATE INDEX IF NOT EXISTS idx_seat_station_board_date
  ON seat_station_status (board_id, business_date);
CREATE INDEX IF NOT EXISTS idx_seat_station_order
  ON seat_station_status (order_id);

-- ── 5) RLS — roster_assignments 와 동일 패턴 ────────────────────────────────
--   SELECT: 로그인 사용자 누구나 / 쓰기: 마스터 OR 같은 보드 멤버.
ALTER TABLE seat_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_station_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seat_orders_select ON seat_orders;
CREATE POLICY seat_orders_select ON seat_orders FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS seat_orders_write ON seat_orders;
CREATE POLICY seat_orders_write ON seat_orders FOR ALL
  USING      (is_master() OR is_board_member(board_id))
  WITH CHECK (is_master() OR is_board_member(board_id));

DROP POLICY IF EXISTS seat_station_select ON seat_station_status;
CREATE POLICY seat_station_select ON seat_station_status FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS seat_station_write ON seat_station_status;
CREATE POLICY seat_station_write ON seat_station_status FOR ALL
  USING      (is_master() OR is_board_member(board_id))
  WITH CHECK (is_master() OR is_board_member(board_id));

-- ── 6) REPLICA IDENTITY FULL ────────────────────────────────────────────────
--   UPDATE/DELETE 시 old row 전체가 payload 에 실려야 클라이언트 filter
--   `business_date=eq.…` 가 DELETE 이벤트에도 매칭됨(useDailyBlocks 선례 참조).
ALTER TABLE seat_orders         REPLICA IDENTITY FULL;
ALTER TABLE seat_station_status REPLICA IDENTITY FULL;

-- ── 7) Realtime publication 등록 (이미 등록돼 있으면 조용히 건너뜀) ──────────
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

-- ── 8) 검증 — 적용 후 아래가 모두 'YES' / 'f FULL' 이어야 함 ─────────────────
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
WHERE n.nspname = 'public'
  AND c.relname IN ('seat_orders','seat_station_status')
UNION ALL
SELECT
  'rls_enabled',
  c.relname,
  CASE WHEN c.relrowsecurity THEN 'YES (RLS on)' ELSE 'NO ★RLS off' END
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('seat_orders','seat_station_status')
ORDER BY check_type, table_name;

-- ============================================================================
-- [STEP B] 자리후 페이지 진입(page_type='seat') — 코드 배선 단계에서 별도 적용
-- ----------------------------------------------------------------------------
--   pages.page_type 에 CHECK 제약이 걸려 있다면 'seat'를 허용 목록에 추가해야 한다.
--   라이브 제약을 먼저 확인(아래)하고, 필요 시에만 ALTER 한다. members 선례와 동일.
--
--   -- (1) 현재 제약 확인:
--   --   SELECT conname, pg_get_constraintdef(oid)
--   --   FROM pg_constraint
--   --   WHERE conrelid = 'pages'::regclass AND contype = 'c';
--   --
--   -- (2) page_type CHECK 가 있으면, 기존 목록 + 'seat' 로 교체(예시 — 실제 목록 확인 후):
--   --   ALTER TABLE pages DROP CONSTRAINT <제약명>;
--   --   ALTER TABLE pages ADD CONSTRAINT <제약명>
--   --     CHECK (page_type IN (..기존값들.., 'seat'));
-- ============================================================================
