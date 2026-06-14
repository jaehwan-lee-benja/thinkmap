-- ============================================================================
-- 배치도 체제 템플릿(Roster Templates) — DB 마이그레이션
--
--   요일×인원수(체제)별 공간형 슬롯 레이아웃을 저장한다.
--   roster_templates(체제) 1:N roster_template_slots(자리 슬롯, 격자 좌표).
--   배치(roster_assignments)는 (role, shift)로 슬롯과 매핑 — 배치 테이블은 건드리지 않는다.
--
-- 명세: PLAN-roster-visual-board.md §4·§7 · 상위: docs/MEMBER-SPEC.md
-- 전제(먼저 존재해야 함):
--   - is_master()                  (migrate-dynamic-master.sql)
--   - is_board_member(uuid)        (migrate-create-members.sql)  ★ 선적용 필수
--   - schedule_touch_updated_at()  (migrate-create-schedule-events.sql)
--   - pages                        (board_id 참조)
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전.
-- 시드(기본 체제)는 별도 파일 seed-roster-templates.sql 로 분리.
-- ============================================================================

BEGIN;

-- ── 1) roster_templates — 체제(요일×인원수) 레이아웃 ────────────────────────
--   board_id IS NULL = 전역 기본(시드) / board_id 지정 = 보드별 커스텀 버전
CREATE TABLE IF NOT EXISTS roster_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id      uuid REFERENCES pages(id) ON DELETE CASCADE,   -- NULL = 전역 기본
  weekday       text,                 -- '평일'|'토'|'일'|null. 자동 추천 키
  headcount     int,                  -- 기준 인원수(4~8). 자동 추천 키. null = 가변
  name          text NOT NULL,        -- 예: "토 6명", "일 7명 일반"
  is_default    boolean NOT NULL DEFAULT false,
  display_order int  NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_roster_templates_lookup
  ON roster_templates (board_id, weekday, headcount) WHERE deleted_at IS NULL;
-- 같은 스코프(board_id) 내 동일 이름 중복 방지(시드 dedup 겸용). NULL board_id 도 한 그룹.
CREATE UNIQUE INDEX IF NOT EXISTS uq_roster_templates_name_alive
  ON roster_templates (COALESCE(board_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_roster_templates_touch ON roster_templates;
CREATE TRIGGER trg_roster_templates_touch BEFORE UPDATE ON roster_templates
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 2) roster_template_slots — 자리 슬롯(격자 스냅 좌표) ─────────────────────
CREATE TABLE IF NOT EXISTS roster_template_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES roster_templates(id) ON DELETE CASCADE,
  grid_row    int  NOT NULL DEFAULT 0,   -- 0=오픈조, 1=마감조, 2=상시
  grid_col    int  NOT NULL DEFAULT 0,   -- 가로 위치
  role        text NOT NULL,             -- 커피/아이스크림/서포트/…
  tasks       text,                      -- 세부 업무 (예: "샷, 스팀, 컵준비")
  shift       text,                      -- '오픈'|'마감'|'종일'|null (배치 매핑 키)
  label       text,                      -- 슬롯 별칭(선택)
  capacity    int  NOT NULL DEFAULT 1,   -- 한 슬롯 정원
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_roster_template_slots_tpl
  ON roster_template_slots (template_id, grid_row, grid_col);

DROP TRIGGER IF EXISTS trg_roster_template_slots_touch ON roster_template_slots;
CREATE TRIGGER trg_roster_template_slots_touch BEFORE UPDATE ON roster_template_slots
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 3) RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE roster_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_template_slots ENABLE ROW LEVEL SECURITY;

-- templates: 로그인 SELECT 공개 / 쓰기 = 전역은 마스터, 보드별은 마스터·보드멤버
DROP POLICY IF EXISTS roster_templates_select ON roster_templates;
CREATE POLICY roster_templates_select ON roster_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS roster_templates_write ON roster_templates;
CREATE POLICY roster_templates_write ON roster_templates FOR ALL
  USING (CASE WHEN board_id IS NULL THEN is_master()
              ELSE is_master() OR is_board_member(board_id) END)
  WITH CHECK (CASE WHEN board_id IS NULL THEN is_master()
                   ELSE is_master() OR is_board_member(board_id) END);

-- slots: 로그인 SELECT 공개 / 쓰기 = 부모 template 권한 위임
--   subquery 가 참조하는 roster_templates 의 SELECT 정책은 비재귀(auth.uid()만) → RLS 재귀 없음.
DROP POLICY IF EXISTS roster_template_slots_select ON roster_template_slots;
CREATE POLICY roster_template_slots_select ON roster_template_slots FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS roster_template_slots_write ON roster_template_slots;
CREATE POLICY roster_template_slots_write ON roster_template_slots FOR ALL
  USING (EXISTS (
    SELECT 1 FROM roster_templates t WHERE t.id = roster_template_slots.template_id
      AND (CASE WHEN t.board_id IS NULL THEN is_master()
                ELSE is_master() OR is_board_member(t.board_id) END)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM roster_templates t WHERE t.id = roster_template_slots.template_id
      AND (CASE WHEN t.board_id IS NULL THEN is_master()
                ELSE is_master() OR is_board_member(t.board_id) END)));

COMMIT;

-- ── 검증 (선택 실행) ────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('roster_templates','roster_template_slots')
--  ORDER BY tablename, policyname;
