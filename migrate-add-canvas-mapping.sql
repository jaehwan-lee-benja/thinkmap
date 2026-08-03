-- =============================================================================
-- 마케팅 캔버스 매핑 (Marketing Canvas Mapping) — 마이그레이션
-- =============================================================================
-- 관련 명세: docs/MARKETING-CANVAS-MAPPING-PLAN.md (v0.3)
--           docs/MARKETING-CANVAS-WIREFRAMES.md
-- 작성일: 2026-05-10
-- 적용 범위: Phase 1 + Phase 2 데이터 모델 (UI는 Phase 1만 활성)
--
-- 변경 요약:
--   1. pages.page_type 에 'frame', 'engine' 허용
--   2. canvas_pairs       — frame ↔ engine 1:1 페어
--   3. canvas_schemas     — 영역/노드 좌표 (DB 저장, 관리자 편집)
--   4. canvas_workflows   — 사용자 정의 워크플로우 (시드: 대기/진행/완료/막힘)
--   5. canvas_mappings    — 핵심 매핑 테이블 (블록·페이지 둘 다 출처)
--   6. canvas_region_stats VIEW — 영역 진단 통계
--   7. RLS — is_linked_account / is_linked_account_viewer 패턴
--
-- 결정 로그: 9가지 결정사항 표 — 기획서 §1 참조
-- =============================================================================


-- =============================================================================
-- STEP 1. pages.page_type 확장
-- =============================================================================
-- 기존 page_type 값: 'normal','daily','calendar' (사전 점검으로 확인)
-- 추가 허용: 'frame','engine'
-- (기존 CHECK 제약이 있다면 DROP 후 재생성)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pages_page_type_chk'
  ) THEN
    ALTER TABLE pages DROP CONSTRAINT pages_page_type_chk;
  END IF;
END $$;

ALTER TABLE pages
  ADD CONSTRAINT pages_page_type_chk
  CHECK (page_type IN ('normal','daily','calendar','frame','engine'));


-- =============================================================================
-- STEP 2. canvas_pairs — frame ↔ engine 페어
-- =============================================================================

CREATE TABLE IF NOT EXISTS canvas_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  master_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Marketing Canvas',
  description TEXT,
  frame_page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  engine_page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL DEFAULT 'v7.44',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(frame_page_id),
  UNIQUE(engine_page_id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_pairs_master ON canvas_pairs(master_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_canvas_pairs_user ON canvas_pairs(user_id) WHERE deleted_at IS NULL;


-- =============================================================================
-- STEP 3. canvas_schemas — 영역/노드 좌표
-- =============================================================================
-- regions JSONB 형식:
-- [
--   {
--     "key": "company",
--     "label": "회사",
--     "bbox": [x, y, width, height],
--     "nodes": [{"key":"core_value","label":"핵심역량","cx":640,"cy":480}]
--   }, ...
-- ]

CREATE TABLE IF NOT EXISTS canvas_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canvas_type TEXT NOT NULL CHECK (canvas_type IN ('frame','engine')),
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  background_url TEXT,
  viewbox TEXT NOT NULL DEFAULT '0 0 1280 960',
  regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(master_id, canvas_type, version)
);

CREATE INDEX IF NOT EXISTS idx_canvas_schemas_master ON canvas_schemas(master_id, canvas_type);


-- =============================================================================
-- STEP 4. canvas_workflows — 사용자 정의 워크플로우
-- =============================================================================
-- steps JSONB 형식:
-- [{"key":"todo","label":"대기","color":"#9ca3af","order":0}, ...]

CREATE TABLE IF NOT EXISTS canvas_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '기본 워크플로우',
  steps JSONB NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_workflows_master ON canvas_workflows(master_id);


-- =============================================================================
-- STEP 5. canvas_mappings — 핵심 매핑 테이블
-- =============================================================================

CREATE TABLE IF NOT EXISTS canvas_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  master_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 출처 (둘 중 하나만)
  source_block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  source_page_id  UUID REFERENCES pages(id)  ON DELETE CASCADE,
  include_descendants BOOLEAN NOT NULL DEFAULT FALSE,

  -- 대상
  target_pair_id UUID NOT NULL REFERENCES canvas_pairs(id) ON DELETE CASCADE,
  target_page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  region_key TEXT NOT NULL,
  node_key TEXT,

  -- 카드 메타
  workflow_id UUID REFERENCES canvas_workflows(id),
  status TEXT NOT NULL DEFAULT 'todo',
  priority SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 3),
  due_date DATE,
  assignee_id UUID REFERENCES auth.users(id),
  tags TEXT[] DEFAULT '{}',
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT canvas_mapping_source_chk CHECK (
    (source_block_id IS NOT NULL AND source_page_id IS NULL) OR
    (source_block_id IS NULL AND source_page_id IS NOT NULL)
  )
);

-- 중복 방지: 블록 출처
CREATE UNIQUE INDEX IF NOT EXISTS uniq_canvas_mapping_block
  ON canvas_mappings (source_block_id, target_page_id, region_key, COALESCE(node_key, ''))
  WHERE source_block_id IS NOT NULL AND deleted_at IS NULL;

-- 중복 방지: 페이지 출처
CREATE UNIQUE INDEX IF NOT EXISTS uniq_canvas_mapping_page
  ON canvas_mappings (source_page_id, target_page_id, region_key, COALESCE(node_key, ''))
  WHERE source_page_id IS NOT NULL AND deleted_at IS NULL;

-- 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_cm_target ON canvas_mappings(target_page_id, region_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_pair   ON canvas_mappings(target_pair_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_block  ON canvas_mappings(source_block_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_page   ON canvas_mappings(source_page_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_assignee ON canvas_mappings(assignee_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_due    ON canvas_mappings(due_date) WHERE due_date IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cm_status ON canvas_mappings(target_page_id, status) WHERE deleted_at IS NULL;


-- =============================================================================
-- STEP 6. canvas_region_stats VIEW — 영역 진단
-- =============================================================================

-- ★2026-08-02 축5(시간) 대응 — `security_invoker`를 **DDL 자체에 박는다**(재생성 내성).
--   이 옵션이 없으면 뷰가 소유자 권한으로 돌아 기반 canvas_mappings 의 RLS 를 우회한다
--   (실측: anon·타인 JWT authenticated 모두 6행 열람 / 기반 테이블은 0행).
--   ★DROP + CREATE 경로로 재생성하면 public 스키마 default ACL(`anon=arwdDxtm`)이 다시 붙고
--     이 옵션은 사라진다 → 하드닝이 조용히 원위치된다. 그래서 운영 조치(ALTER VIEW)와 **별개로**
--     정본 DDL에 고정한다. 상세 = `migrate-revoke-anon-exposure.sql` ★축5 절.
CREATE OR REPLACE VIEW canvas_region_stats
WITH (security_invoker = true) AS
SELECT
  target_pair_id,
  target_page_id,
  region_key,
  count(*)                                                  AS total,
  count(*) FILTER (WHERE status = 'done')                   AS done_n,
  count(*) FILTER (WHERE status = 'doing')                  AS doing_n,
  count(*) FILTER (WHERE status = 'todo')                   AS todo_n,
  count(*) FILTER (WHERE status = 'blocked')                AS blocked_n,
  count(*) FILTER (
    WHERE updated_at < now() - interval '7 days'
      AND status NOT IN ('done')
  )                                                         AS stalled_n,
  max(updated_at)                                           AS last_active
FROM canvas_mappings
WHERE deleted_at IS NULL
GROUP BY target_pair_id, target_page_id, region_key;


-- =============================================================================
-- STEP 7. updated_at 자동 갱신 트리거
-- =============================================================================

CREATE OR REPLACE FUNCTION update_canvas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_canvas_pairs_updated_at ON canvas_pairs;
CREATE TRIGGER trg_canvas_pairs_updated_at
  BEFORE UPDATE ON canvas_pairs
  FOR EACH ROW EXECUTE FUNCTION update_canvas_updated_at();

DROP TRIGGER IF EXISTS trg_canvas_schemas_updated_at ON canvas_schemas;
CREATE TRIGGER trg_canvas_schemas_updated_at
  BEFORE UPDATE ON canvas_schemas
  FOR EACH ROW EXECUTE FUNCTION update_canvas_updated_at();

DROP TRIGGER IF EXISTS trg_canvas_workflows_updated_at ON canvas_workflows;
CREATE TRIGGER trg_canvas_workflows_updated_at
  BEFORE UPDATE ON canvas_workflows
  FOR EACH ROW EXECUTE FUNCTION update_canvas_updated_at();

DROP TRIGGER IF EXISTS trg_canvas_mappings_updated_at ON canvas_mappings;
CREATE TRIGGER trg_canvas_mappings_updated_at
  BEFORE UPDATE ON canvas_mappings
  FOR EACH ROW EXECUTE FUNCTION update_canvas_updated_at();


-- =============================================================================
-- STEP 8. RLS 정책 (impersonation 정합)
-- =============================================================================
-- 패턴: pages/blocks 와 동일.
-- SELECT: 본인 OR is_linked_account_viewer
-- INSERT/UPDATE/DELETE: 본인 OR is_linked_account
-- =============================================================================

-- canvas_pairs ----------------------------------------------------------------
ALTER TABLE canvas_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canvas_pairs_select" ON canvas_pairs;
CREATE POLICY "canvas_pairs_select" ON canvas_pairs FOR SELECT
  USING (auth.uid() = user_id OR is_linked_account_viewer(user_id));

DROP POLICY IF EXISTS "canvas_pairs_insert" ON canvas_pairs;
CREATE POLICY "canvas_pairs_insert" ON canvas_pairs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_linked_account(user_id));

DROP POLICY IF EXISTS "canvas_pairs_update" ON canvas_pairs;
CREATE POLICY "canvas_pairs_update" ON canvas_pairs FOR UPDATE
  USING (auth.uid() = user_id OR is_linked_account(user_id));

DROP POLICY IF EXISTS "canvas_pairs_delete" ON canvas_pairs;
CREATE POLICY "canvas_pairs_delete" ON canvas_pairs FOR DELETE
  USING (auth.uid() = user_id OR is_linked_account(user_id));

-- canvas_schemas --------------------------------------------------------------
ALTER TABLE canvas_schemas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canvas_schemas_select" ON canvas_schemas;
CREATE POLICY "canvas_schemas_select" ON canvas_schemas FOR SELECT
  USING (auth.uid() = master_id OR is_linked_account_viewer(master_id));

-- 양식 편집은 마스터만 (직원 뷰에서는 차단)
DROP POLICY IF EXISTS "canvas_schemas_write" ON canvas_schemas;
CREATE POLICY "canvas_schemas_write" ON canvas_schemas FOR ALL
  USING (auth.uid() = master_id)
  WITH CHECK (auth.uid() = master_id);

-- canvas_workflows ------------------------------------------------------------
ALTER TABLE canvas_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canvas_workflows_select" ON canvas_workflows;
CREATE POLICY "canvas_workflows_select" ON canvas_workflows FOR SELECT
  USING (auth.uid() = master_id OR is_linked_account_viewer(master_id));

-- 워크플로우 편집은 마스터만
DROP POLICY IF EXISTS "canvas_workflows_write" ON canvas_workflows;
CREATE POLICY "canvas_workflows_write" ON canvas_workflows FOR ALL
  USING (auth.uid() = master_id)
  WITH CHECK (auth.uid() = master_id);

-- canvas_mappings -------------------------------------------------------------
ALTER TABLE canvas_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canvas_mappings_select" ON canvas_mappings;
CREATE POLICY "canvas_mappings_select" ON canvas_mappings FOR SELECT
  USING (auth.uid() = user_id OR is_linked_account_viewer(user_id));

DROP POLICY IF EXISTS "canvas_mappings_insert" ON canvas_mappings;
CREATE POLICY "canvas_mappings_insert" ON canvas_mappings FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_linked_account(user_id));

DROP POLICY IF EXISTS "canvas_mappings_update" ON canvas_mappings;
CREATE POLICY "canvas_mappings_update" ON canvas_mappings FOR UPDATE
  USING (auth.uid() = user_id OR is_linked_account(user_id));

DROP POLICY IF EXISTS "canvas_mappings_delete" ON canvas_mappings;
CREATE POLICY "canvas_mappings_delete" ON canvas_mappings FOR DELETE
  USING (auth.uid() = user_id OR is_linked_account(user_id));


-- =============================================================================
-- STEP 9. 시드 데이터 — 기본 워크플로우 (각 마스터마다 하나씩)
-- =============================================================================
-- 이 부분은 마스터 계정 생성 후 실행하거나, 캔버스 첫 생성 시 애플리케이션
-- 레이어에서 INSERT 한다. SQL 단계에서는 시드 함수만 정의.

CREATE OR REPLACE FUNCTION seed_default_workflow_for_master(p_master_id UUID)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO canvas_workflows (master_id, name, steps, is_default)
  VALUES (
    p_master_id,
    '기본 워크플로우',
    '[
      {"key":"todo",   "label":"대기","color":"#9ca3af","order":0},
      {"key":"doing",  "label":"진행","color":"#3b82f6","order":1},
      {"key":"done",   "label":"완료","color":"#10b981","order":2},
      {"key":"blocked","label":"막힘","color":"#ef4444","order":3}
    ]'::jsonb,
    TRUE
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- STEP 10. 시드 데이터 — Marketing Frame v7.44 영역 좌표
-- =============================================================================
-- 좌표는 1280x960 viewBox 기준의 추정값. 실제 SVG 배경에 맞춰 관리자 페이지에서
-- 조정 가능하도록 설계됨 (canvas_schemas.regions 편집).

CREATE OR REPLACE FUNCTION seed_frame_schema_for_master(p_master_id UUID)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO canvas_schemas (
    master_id, canvas_type, version, name, viewbox, regions, is_default
  )
  VALUES (
    p_master_id,
    'frame',
    'v7.44',
    'Marketing Frame v7.44',
    '0 0 1280 960',
    '[
      {
        "key": "action",
        "label": "행동 (Action / Mission)",
        "bbox": [460, 60, 360, 240],
        "nodes": [
          {"key":"mission_1","label":"미션 1","cx":640,"cy":140},
          {"key":"mission_2","label":"미션 2","cx":640,"cy":190},
          {"key":"mission_3","label":"미션 3","cx":640,"cy":240}
        ]
      },
      {
        "key": "vision",
        "label": "비전 (Vision)",
        "bbox": [200, 160, 220, 140],
        "nodes": [
          {"key":"vision_keyword","label":"비전 키워드","cx":310,"cy":230}
        ]
      },
      {
        "key": "company",
        "label": "회사 (Company)",
        "bbox": [60, 380, 240, 200],
        "nodes": [
          {"key":"product","label":"제품/서비스","cx":180,"cy":480}
        ]
      },
      {
        "key": "target",
        "label": "고객 (Target)",
        "bbox": [980, 380, 240, 200],
        "nodes": [
          {"key":"persona_a","label":"페르소나 A","cx":1100,"cy":430},
          {"key":"persona_b","label":"페르소나 B","cx":1100,"cy":480},
          {"key":"persona_c","label":"페르소나 C","cx":1100,"cy":530}
        ]
      },
      {
        "key": "core",
        "label": "핵심역량 (Core Value)",
        "bbox": [460, 420, 360, 100],
        "nodes": [
          {"key":"core_keyword","label":"핵심역량 키워드","cx":640,"cy":470}
        ]
      },
      {
        "key": "value",
        "label": "가치 (Value)",
        "bbox": [400, 620, 480, 280],
        "nodes": [
          {"key":"value_a","label":"가치 단어 A","cx":540,"cy":700},
          {"key":"value_b","label":"가치 단어 B","cx":640,"cy":700},
          {"key":"value_c","label":"가치 단어 C","cx":740,"cy":700},
          {"key":"value_phrase","label":"통합 가치 문구","cx":640,"cy":820}
        ]
      }
    ]'::jsonb,
    TRUE
  )
  ON CONFLICT (master_id, canvas_type, version) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- STEP 11. 시드 데이터 — Marketing Engine v7.44 영역 좌표
-- =============================================================================
-- Phase 1 UI 는 frame 만 노출하지만, 데이터 모델은 Phase 2 까지 준비.

CREATE OR REPLACE FUNCTION seed_engine_schema_for_master(p_master_id UUID)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO canvas_schemas (
    master_id, canvas_type, version, name, viewbox, regions, is_default
  )
  VALUES (
    p_master_id,
    'engine',
    'v7.44',
    'Marketing Engine v7.44',
    '0 0 1280 960',
    '[
      {"key":"experience","label":"경험 (Experience)","bbox":[640,200,260,200],"nodes":[]},
      {"key":"decision",  "label":"결정 (Decision)",  "bbox":[380,200,260,200],"nodes":[]},
      {"key":"retention", "label":"단골 (Retention)", "bbox":[380,400,260,200],"nodes":[
        {"key":"core_interaction","label":"핵심상호작용","cx":510,"cy":500}
      ]},
      {"key":"application","label":"신청 (Application)","bbox":[640,400,260,200],"nodes":[]},
      {"key":"target_pool","label":"타겟풀 (Target Pool)","bbox":[1000,820,240,80],"nodes":[]},
      {"key":"fan_pool",   "label":"단골풀 (Fan Pool)",  "bbox":[40,820,240,80],"nodes":[
        {"key":"fp_communication","label":"소통","cx":80,"cy":880},
        {"key":"fp_visit","label":"방문","cx":140,"cy":880},
        {"key":"fp_purchase","label":"구매","cx":200,"cy":880},
        {"key":"fp_sharing","label":"자랑","cx":260,"cy":880}
      ]},
      {"key":"visitor","label":"방문 (Visitor)","bbox":[560,720,160,80],"nodes":[]}
    ]'::jsonb,
    TRUE
  )
  ON CONFLICT (master_id, canvas_type, version) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- STEP 12. 헬퍼 함수 — 캔버스 페어 생성 (트랜잭션)
-- =============================================================================
-- 호출: SELECT create_canvas_pair(p_user_id, p_master_id, '작마클 캔버스');
-- 동작: pages × 2 + canvas_pairs × 1 + 시드 보장

CREATE OR REPLACE FUNCTION create_canvas_pair(
  p_user_id UUID,
  p_master_id UUID,
  p_name TEXT DEFAULT 'Marketing Canvas'
) RETURNS UUID AS $$
DECLARE
  v_frame_page_id UUID;
  v_engine_page_id UUID;
  v_pair_id UUID;
BEGIN
  -- 시드 보장
  PERFORM seed_default_workflow_for_master(p_master_id);
  PERFORM seed_frame_schema_for_master(p_master_id);
  PERFORM seed_engine_schema_for_master(p_master_id);

  -- frame 페이지
  INSERT INTO pages (user_id, name, page_type, position)
  VALUES (p_user_id, p_name || ' / Frame', 'frame', 0)
  RETURNING id INTO v_frame_page_id;

  -- engine 페이지
  INSERT INTO pages (user_id, name, page_type, position)
  VALUES (p_user_id, p_name || ' / Engine', 'engine', 0)
  RETURNING id INTO v_engine_page_id;

  -- pair
  INSERT INTO canvas_pairs (
    user_id, master_id, name,
    frame_page_id, engine_page_id, schema_version
  )
  VALUES (
    p_user_id, p_master_id, p_name,
    v_frame_page_id, v_engine_page_id, 'v7.44'
  )
  RETURNING id INTO v_pair_id;

  RETURN v_pair_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 검증 쿼리 (수동 실행용)
-- =============================================================================
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'pages'::regclass;
-- SELECT * FROM canvas_pairs LIMIT 5;
-- SELECT * FROM canvas_schemas LIMIT 5;
-- SELECT * FROM canvas_workflows LIMIT 5;
-- SELECT * FROM canvas_region_stats LIMIT 20;

-- =============================================================================
-- 롤백 (필요 시)
-- =============================================================================
-- DROP VIEW IF EXISTS canvas_region_stats;
-- DROP TABLE IF EXISTS canvas_mappings CASCADE;
-- DROP TABLE IF EXISTS canvas_workflows CASCADE;
-- DROP TABLE IF EXISTS canvas_schemas CASCADE;
-- DROP TABLE IF EXISTS canvas_pairs CASCADE;
-- DROP FUNCTION IF EXISTS create_canvas_pair(UUID, UUID, TEXT);
-- DROP FUNCTION IF EXISTS seed_default_workflow_for_master(UUID);
-- DROP FUNCTION IF EXISTS seed_frame_schema_for_master(UUID);
-- DROP FUNCTION IF EXISTS seed_engine_schema_for_master(UUID);
-- DROP FUNCTION IF EXISTS update_canvas_updated_at();
