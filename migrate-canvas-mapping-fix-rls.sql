-- =============================================================================
-- 마케팅 캔버스 매핑 — RLS 보강 (시드/페어 생성 함수의 권한 처리)
-- =============================================================================
-- 문제: create_canvas_pair RPC 가 canvas_workflows / canvas_schemas / pages 에
--       INSERT 할 때, 호출자(SECURITY INVOKER) 권한으로 RLS 가 작동.
--       canvas_workflows.write 정책이 auth.uid() = master_id 만 허용하므로,
--       엣지 케이스(임퍼소네이션 등)에서 INSERT 가 차단됨.
--
-- 해결: 시드/페어 생성 함수를 SECURITY DEFINER 로 전환.
--       다만 임의 user_id 로 페어를 생성하는 권한 상승을 막기 위해,
--       함수 내부에서 auth.uid() 검증을 명시한다.
-- =============================================================================

-- 1) seed_default_workflow_for_master --------------------------------------
DROP FUNCTION IF EXISTS seed_default_workflow_for_master(UUID);

CREATE OR REPLACE FUNCTION seed_default_workflow_for_master(p_master_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

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
$$;

-- 2) seed_frame_schema_for_master -----------------------------------------
DROP FUNCTION IF EXISTS seed_frame_schema_for_master(UUID);

CREATE OR REPLACE FUNCTION seed_frame_schema_for_master(p_master_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

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
      {"key":"action","label":"행동 (Action / Mission)","bbox":[460,60,360,240],
        "nodes":[
          {"key":"mission_1","label":"미션 1","cx":640,"cy":140},
          {"key":"mission_2","label":"미션 2","cx":640,"cy":190},
          {"key":"mission_3","label":"미션 3","cx":640,"cy":240}
        ]},
      {"key":"vision","label":"비전 (Vision)","bbox":[200,160,220,140],
        "nodes":[{"key":"vision_keyword","label":"비전 키워드","cx":310,"cy":230}]},
      {"key":"company","label":"회사 (Company)","bbox":[60,380,240,200],
        "nodes":[{"key":"product","label":"제품/서비스","cx":180,"cy":480}]},
      {"key":"target","label":"고객 (Target)","bbox":[980,380,240,200],
        "nodes":[
          {"key":"persona_a","label":"페르소나 A","cx":1100,"cy":430},
          {"key":"persona_b","label":"페르소나 B","cx":1100,"cy":480},
          {"key":"persona_c","label":"페르소나 C","cx":1100,"cy":530}
        ]},
      {"key":"core","label":"핵심역량 (Core Value)","bbox":[460,420,360,100],
        "nodes":[{"key":"core_keyword","label":"핵심역량 키워드","cx":640,"cy":470}]},
      {"key":"value","label":"가치 (Value)","bbox":[400,620,480,280],
        "nodes":[
          {"key":"value_a","label":"가치 단어 A","cx":540,"cy":700},
          {"key":"value_b","label":"가치 단어 B","cx":640,"cy":700},
          {"key":"value_c","label":"가치 단어 C","cx":740,"cy":700},
          {"key":"value_phrase","label":"통합 가치 문구","cx":640,"cy":820}
        ]}
    ]'::jsonb,
    TRUE
  )
  ON CONFLICT (master_id, canvas_type, version) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 3) seed_engine_schema_for_master ----------------------------------------
DROP FUNCTION IF EXISTS seed_engine_schema_for_master(UUID);

CREATE OR REPLACE FUNCTION seed_engine_schema_for_master(p_master_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

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
      {"key":"retention", "label":"단골 (Retention)", "bbox":[380,400,260,200],
        "nodes":[{"key":"core_interaction","label":"핵심상호작용","cx":510,"cy":500}]},
      {"key":"application","label":"신청 (Application)","bbox":[640,400,260,200],"nodes":[]},
      {"key":"target_pool","label":"타겟풀 (Target Pool)","bbox":[1000,820,240,80],"nodes":[]},
      {"key":"fan_pool",   "label":"단골풀 (Fan Pool)",  "bbox":[40,820,240,80],
        "nodes":[
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
$$;

-- 4) create_canvas_pair (트랜잭션) ----------------------------------------
DROP FUNCTION IF EXISTS create_canvas_pair(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION create_canvas_pair(
  p_user_id UUID,
  p_master_id UUID,
  p_name TEXT DEFAULT 'Marketing Canvas'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_frame_page_id UUID;
  v_engine_page_id UUID;
  v_pair_id UUID;
BEGIN
  -- 인증 + 권한 검증 (임의 user_id 로 페어 생성 불가)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF auth.uid() <> p_user_id AND NOT is_linked_account(p_user_id) THEN
    RAISE EXCEPTION 'unauthorized: cannot create canvas pair for user %', p_user_id;
  END IF;

  -- 시드 보장 (master_id 기준)
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
$$;

-- 5) 검증 ------------------------------------------------------------------
-- SELECT proname, prosecdef AS is_security_definer FROM pg_proc
--  WHERE proname IN (
--    'create_canvas_pair',
--    'seed_default_workflow_for_master',
--    'seed_frame_schema_for_master',
--    'seed_engine_schema_for_master'
--  );
-- 기대: 4개 모두 is_security_definer = true
