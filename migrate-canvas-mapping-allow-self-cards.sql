-- =============================================================================
-- 마케팅 캔버스 매핑 — '캔버스 자체 작성 카드' 허용
-- =============================================================================
-- 문제: CHECK 제약이 source_block_id / source_page_id 둘 중 하나는 반드시 NOT NULL.
--       그래서 캔버스 사이드 패널에서 직접 작성한 카드(외부 토글/페이지가 출처가
--       아닌 카드)를 표현할 수 없음.
--
--       임시로 source_page_id 에 frame_page_id 자기 자신을 넣었더니
--       UNIQUE(source_page_id, target_page_id, region_key, node_key) 충돌.
--
-- 해결: CHECK 제약을 완화 — 둘 다 NULL 도 허용 (캔버스 자체 작성 카드).
--       UNIQUE 인덱스는 source_*_id IS NOT NULL 조건이 이미 있으므로 그대로 둠.
-- =============================================================================

-- 기존 CHECK 제약 제거
ALTER TABLE canvas_mappings DROP CONSTRAINT IF EXISTS canvas_mapping_source_chk;

-- 완화된 제약: 동시에 둘 다 NOT NULL 만 금지
-- (한쪽만 / 둘 다 NULL 모두 OK)
ALTER TABLE canvas_mappings
  ADD CONSTRAINT canvas_mapping_source_chk CHECK (
    NOT (source_block_id IS NOT NULL AND source_page_id IS NOT NULL)
  );

-- 검증
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'canvas_mappings'::regclass AND conname LIKE '%source%';
