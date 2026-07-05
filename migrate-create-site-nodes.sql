-- ============================================================================
-- 사이트 구조도(Site Map) — site_nodes 테이블 + RLS + 시드
--
--   백오피스(page_type='backoffice') 마스터 전용 페이지의 데이터 저장소.
--   모선(Hub) + 위성(Satellite) 노드를 런타임 편집한다. 이 노드가 곧 "위성 런처"의 소스.
--
-- 명세: docs/SITE-SPLIT-PLAN.md §4/§5/§10(위성 런처 레지스트리 = DB 테이블 채택).
-- 전제(먼저 존재해야 함):
--   - is_master()                  (migrate-dynamic-master.sql)
--   - schedule_touch_updated_at()  (migrate-create-schedule-events.sql)
--
-- ⚠ 이 파일은 'pages' CHECK 제약을 건드리지 않는다(안전 분리).
--   백오피스 *페이지* 진입(page_type='backoffice')은 별도 파일
--   migrate-pages-allow-backoffice.sql 로 라이브 제약 확인 후 추가한다.
--
-- 권한 모델: goals/payroll_sheets 와 동일하게 마스터 전용(is_master()).
--   (사이트 구조 관리 = 백오피스 관리자 기능. 향후 런처 노출을 위해 SELECT 를
--    required_role 기반으로 넓힐 수 있으나, MVP 는 마스터 전용으로 단순화.)
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전.
-- ============================================================================

BEGIN;

-- ── 1) site_nodes — 사이트 구조 노드 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_nodes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  kind          text NOT NULL DEFAULT 'satellite'
                  CHECK (kind IN ('hub','satellite')),
  domain        text,                          -- 현 모놀리스 page_type 또는 위성 도메인 키
  url           text,                           -- 런처 링크 타깃(비면 내부 page_type 진입)
  required_role text NOT NULL DEFAULT 'master'
                  CHECK (required_role IN ('public','member','viewer','editor','master')),
  status        text NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('live','dev','planned')),
  sort_order    int  NOT NULL DEFAULT 0,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_site_nodes_order
  ON site_nodes (sort_order) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_site_nodes_touch ON site_nodes;
CREATE TRIGGER trg_site_nodes_touch BEFORE UPDATE ON site_nodes
  FOR EACH ROW EXECUTE FUNCTION schedule_touch_updated_at();

-- ── 2) RLS — 마스터 전용 (goals/payroll_sheets 패턴) ────────────────────────
ALTER TABLE site_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_nodes_master_all ON site_nodes;
CREATE POLICY site_nodes_master_all ON site_nodes FOR ALL
  USING (is_master()) WITH CHECK (is_master());

-- ── 3) 시드 (SITE-SPLIT-PLAN §4 · src/utils/siteNodesSeed.js 와 동일 값) ─────
--   재실행 안전: 살아있는 동명 노드가 있으면 건너뛴다.
INSERT INTO site_nodes (name, kind, domain, url, required_role, status, sort_order, note)
SELECT * FROM (VALUES
  ('모선 (ThinkMap 본체)', 'hub', 'hub', '/thinkmap/', 'member', 'live', 0,
    '직원 공유 페이지·업무일지·캘린더·목표. TipTap 에디터+셸+인증 코어가 사는 곳. 절대 쪼개지 않는다.'),
  ('급여 (Payroll)', 'satellite', 'payroll', '', 'master', 'live', 1,
    '결합도 0·에디터 불필요 = 위성화 1순위 파일럿(§8 Phase 1). 현재 모놀리스 내 page_type=payroll.'),
  ('자리/인사 (Roster + Members)', 'satellite', 'members', '', 'master', 'live', 2,
    '둘이 한 쌍 → 쌍으로 분리(§8 Phase 2). 현재 page_type=members.'),
  ('마케팅 엔진 (Canvas)', 'satellite', 'engine', '', 'master', 'live', 3,
    'daily_blocks 읽기 의존만 정리하면 분리(§8 Phase 3). 현재 page_type=engine.'),
  ('통합 대시보드 (Dashboard)', 'satellite', 'dashboard', '', 'master', 'live', 4,
    '목표(goals) 집계. 마스터 전용. 현재 page_type=dashboard.'),
  ('자리후 (Seat, 주방 실시간)', 'satellite', 'seat', '', 'editor', 'live', 5,
    '완전 독립 서브트리 → 즉시 분리 가능(§8 Phase 4). 워크스페이스 editor면 진입.'),
  ('재고 (Inventory)', 'satellite', 'inventory', '', 'editor', 'dev', 6,
    '없음·독립. 권한(파트너 레벨) 확정 전. 즉시 분리 가능(§8 Phase 4).')
) AS v(name, kind, domain, url, required_role, status, sort_order, note)
WHERE NOT EXISTS (
  SELECT 1 FROM site_nodes s WHERE s.name = v.name AND s.deleted_at IS NULL
);

COMMIT;

-- ── 검증 (선택 실행) ────────────────────────────────────────────────────────
-- SELECT name, kind, domain, status, sort_order FROM site_nodes
--  WHERE deleted_at IS NULL ORDER BY sort_order;
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='site_nodes';
