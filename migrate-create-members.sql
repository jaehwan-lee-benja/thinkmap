-- ============================================================================
-- 멤버 & 배치도(Member / Roster) — DB 마이그레이션
--
--   인사 마스터(members) + 민감정보(member_private) + 인사 이력 허브(member_records)
--   + 날짜별 배치(roster_assignments) + 보드멤버 헬퍼(is_board_member).
--
-- 명세: docs/MEMBER-SPEC.md · 청사진: PLAN-member-roster.md
-- 전제(먼저 존재해야 함):
--   - auth.users
--   - is_master()                  (migrate-dynamic-master.sql)
--   - schedule_touch_updated_at()  (migrate-create-schedule-events.sql)
--   - worklog_board_members        (migrate-step2-members.sql)
--
-- ⚠ 이 파일은 'pages' CHECK 제약을 건드리지 않는다(안전). 멤버 *페이지* 진입(page_type
--   ='members')을 코드로 붙이는 단계에서, 라이브 제약 확인 후 'members'를 추가한다.
--   → 파일 맨 아래 [STEP B] 주석 참조.
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전.
-- ============================================================================

BEGIN;

-- ── 0) 헬퍼: 이 board(업무일지 캘린더)의 멤버인가? ───────────────────────────
--   is_board_member_of_page(page_id) 의 board_id 직접판. SECURITY DEFINER로 RLS 재귀 회피.
CREATE OR REPLACE FUNCTION is_board_member(p_board_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM worklog_board_members m
    WHERE m.board_id = p_board_id AND m.user_id = auth.uid()
  );
$$;

-- ── 1) members — 인사 마스터 (기본정보) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  display_order int  NOT NULL DEFAULT 0,
  work_days     text[] NOT NULL DEFAULT '{}',
  seniority     text,
  phone         text,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','resigned')),
  auth_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_members_active
  ON members (display_order) WHERE deleted_at IS NULL AND status='active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_members_name_alive
  ON members (name) WHERE deleted_at IS NULL;   -- 살아있는 동명 방지(시드 dedup 겸용)

DROP TRIGGER IF EXISTS trg_members_touch ON members;
CREATE TRIGGER trg_members_touch BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 2) member_private — 민감 개인정보 1:1 (마스터 전용) ─────────────────────
CREATE TABLE IF NOT EXISTS member_private (
  member_id     uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  birth         text,
  resident_no   text,
  bank_account  text,
  email_gmail   text,
  payslip_email text,
  hire_date     date,
  resign_date   date,
  memo          text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_member_private_touch ON member_private;
CREATE TRIGGER trg_member_private_touch BEFORE UPDATE ON member_private
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 3) member_records — 인사 이력 허브 1:N (마스터 전용) ────────────────────
CREATE TABLE IF NOT EXISTS member_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN
                ('health_cert','contract','training','counseling','other')),
  title       text,
  body        text,
  doc_date    date,
  expires_at  date,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_member_records_member
  ON member_records (member_id, record_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_member_records_expiry
  ON member_records (expires_at) WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
DROP TRIGGER IF EXISTS trg_member_records_touch ON member_records;
CREATE TRIGGER trg_member_records_touch BEFORE UPDATE ON member_records
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 4) roster_assignments — 날짜별 배치 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS roster_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  page_id      uuid REFERENCES pages(id) ON DELETE SET NULL,
  work_date    date NOT NULL,
  member_id    uuid REFERENCES members(id) ON DELETE SET NULL,
  member_name  text NOT NULL,
  role         text,
  shift        text,
  status       text NOT NULL DEFAULT 'planned' CHECK (status IN
                 ('planned','worked','requested','accepted','declined','tentative')),
  position     numeric NOT NULL DEFAULT 0,
  note         text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_roster_board_date
  ON roster_assignments (board_id, work_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_roster_member_date
  ON roster_assignments (member_id, work_date) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_roster_board_date_member_alive
  ON roster_assignments (board_id, work_date, member_id)
  WHERE deleted_at IS NULL AND member_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_roster_touch ON roster_assignments;
CREATE TRIGGER trg_roster_touch BEFORE UPDATE ON roster_assignments
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 5) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_private     ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_assignments ENABLE ROW LEVEL SECURITY;

-- members: 로그인 사용자 SELECT(기본정보 공개) / 쓰기 마스터.
--   FOR ALL(master) + FOR SELECT(authenticated) 공존 → SELECT는 OR로 합쳐져 비마스터도 읽기 가능,
--   쓰기는 FOR ALL 정책만 적용되어 마스터로 제한된다.
DROP POLICY IF EXISTS members_select ON members;
CREATE POLICY members_select ON members FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS members_write ON members;
CREATE POLICY members_write ON members FOR ALL
  USING (is_master()) WITH CHECK (is_master());

-- member_private / member_records: 마스터 전용 (payroll_sheets / goals 패턴)
DROP POLICY IF EXISTS member_private_master_all ON member_private;
CREATE POLICY member_private_master_all ON member_private FOR ALL
  USING (is_master()) WITH CHECK (is_master());
DROP POLICY IF EXISTS member_records_master_all ON member_records;
CREATE POLICY member_records_master_all ON member_records FOR ALL
  USING (is_master()) WITH CHECK (is_master());

-- roster: 로그인 SELECT 공개 / 쓰기 마스터 OR 보드멤버
DROP POLICY IF EXISTS roster_select ON roster_assignments;
CREATE POLICY roster_select ON roster_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS roster_write ON roster_assignments;
CREATE POLICY roster_write ON roster_assignments FOR ALL
  USING (is_master() OR is_board_member(board_id))
  WITH CHECK (is_master() OR is_board_member(board_id));

COMMIT;

-- ── 검증 (선택 실행) ────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE schemaname='public'
--    AND tablename IN ('members','member_private','member_records','roster_assignments')
--  ORDER BY tablename, policyname;

-- ============================================================================
-- [STEP B] — 코드 구현(멤버 페이지 진입) 단계에서만 실행. ★ 지금은 실행하지 말 것 ★
--   pages.page_type 에 'members' 를 추가한다. 통째 교체 전, 라이브 허용값을 먼저 확인:
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='pages_page_type_chk';
--
--   위 출력에 들어 있는 모든 값 + 'members' 로 아래 IN(...) 을 조정해 실행한다.
--   (다른 세션/브랜치가 'dashboard' 등을 추가했을 수 있으므로 누락 금지.)
--
-- BEGIN;
--   ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_page_type_chk;
--   ALTER TABLE pages ADD CONSTRAINT pages_page_type_chk
--     CHECK (page_type IN ('normal','daily','calendar','frame','engine','schedule','payroll','members'));
-- COMMIT;
-- ============================================================================
