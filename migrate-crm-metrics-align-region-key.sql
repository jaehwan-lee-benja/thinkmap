-- ============================================================================
-- crm_metrics — region_key 키셋 정렬 (v1 'visitor' → v2 'unregistered', R8/R9)
--
-- 목적: crm engine-metrics 가 v2(R8/R9)로 개정되며 region key 'visitor'(방문)가
--   'unregistered'(미등록)로 바뀌었다. crm_metrics 가 **이미 구 CHECK('visitor')로
--   적용된 환경**에서는 migrate-create-crm-metrics.sql 의 CREATE TABLE IF NOT EXISTS
--   가 조용히 no-op 라 CHECK 가 갱신되지 않는다(supabase-guardian §4 지적).
--   → 이 마이그가 그 경우를 안전하게 정렬한다.
--
-- ★멱등·상태무관 안전: 테이블이 없으면 no-op. 있으면 (1) 잔존 'visitor' 행을
--   'unregistered' 로 이관 후 (2) CHECK 를 v2 키셋으로 교체. 재실행해도 안전.
--   기존 유효한 v1 행(visitor 포함)은 전부 v2 키셋 안으로 수렴하므로 CHECK 위반 없음.
--
-- 적용 순서(seat): 아래 §dry-run 확인 → migrate-create-crm-metrics.sql(신규 생성) →
--   이 파일(기존 적용본 정렬). 둘 다 순서대로 돌려도 모든 DB 상태에서 안전.
--
-- ★적용 규율: tmcrm 직접 적용 금지. supabase-guardian 검수(완료) → 유저 승인 →
--   thinkmap 통합 세션(seat) 적용. CRM-BOARD-SPEC §8·§10.
--
-- ── dry-run(적용 전 상태 확인, 실행만·변경 없음) ────────────────────────────
--   SELECT EXISTS (SELECT 1 FROM information_schema.tables
--                  WHERE table_name='crm_metrics') AS table_exists;
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'crm_metrics_region_key_chk';
--   -- table_exists=false            → create 마이그만으로 충분(이 파일 no-op).
--   -- constraint 에 'unregistered'  → 이미 정렬됨(이 파일 no-op).
--   -- constraint 에 'visitor'       → 이 파일이 이관+교체 수행.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_metrics'
  ) THEN
    -- (1) 잔존 구 키 이관: 'visitor'(방문) → 'unregistered'(미등록).
    --     PK(ym, region_key) 충돌 방지: 동일 ym 에 이미 unregistered 가 있으면 구 visitor 행 폐기.
    DELETE FROM crm_metrics v
     WHERE v.region_key = 'visitor'
       AND EXISTS (SELECT 1 FROM crm_metrics u
                    WHERE u.ym = v.ym AND u.region_key = 'unregistered');
    UPDATE crm_metrics SET region_key = 'unregistered' WHERE region_key = 'visitor';

    -- (2) CHECK 를 v2(R8/R9) 키셋으로 교체.
    ALTER TABLE crm_metrics DROP CONSTRAINT IF EXISTS crm_metrics_region_key_chk;
    ALTER TABLE crm_metrics ADD CONSTRAINT crm_metrics_region_key_chk CHECK (region_key IN (
      'unregistered','experience','decision','retention','fan_pool',
      'application','target_pool','business'
    ));
  END IF;
END $$;

COMMIT;
