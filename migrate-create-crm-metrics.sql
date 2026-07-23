-- ============================================================================
-- crm_metrics — CRM 월별 지표 스냅샷 (engine-metrics/v2 raw 적재)
--
-- 목적: crm 이 배포한 engine-metrics Edge(비밀키 게이트)의 월별 지표를 thinkmap DB 에
--   단일 적재한다. "원천 1개 공유" — 캔버스(apps/canvas)는 region 매핑해 읽고, CRM 운영
--   보드는 직접 읽는다(단일 적재·다중 뷰). CRM-BOARD-SPEC §4.1·§8, ENGINE-HANDOFF.md.
--
-- 적재자: Edge Function `engine-metrics-sync`(service_role, RLS 우회). 브라우저는 로그인한
--   마스터만 읽기(is_master()). ★재무 데이터라 마스터 전용(dashboard/goals/payroll 선례).
--
-- 데이터 모델(seat 회신으로 채택): (ym, region_key) 한 행 = 그 월 그 region 의 값.
--   region_key ∈ {unregistered, experience, decision, retention, fan_pool,
--                 application, target_pool, business}
--     ★R8/R9 정렬(2026-07-23): v1 'visitor'(방문) → 'unregistered'(미등록)로 개명.
--   - value : 그 region 의 월값(series[i]). series:null(target_pool) → NULL.
--   - extra : 부가값 jsonb.
--       retention → {"총단골":…, "활성단골율":…}
--       business  → {"매출":…, "객단가":…, "단골총마진":…,
--                    "관리비":…, "임대료":…, "원재료율":…}   (v2: 퍼널이익 폐기)
--       target_pool → {"note":"POS 밖"}
--
-- 단일 트랜잭션. 재실행 안전(멱등). 전제: is_master() 존재(migrate-dynamic-master.sql).
--
-- ★적용 규율: tmcrm 은 직접 적용하지 않는다. supabase-guardian 검수 → 유저 승인
--   → 기존 thinkmap 통합 세션(seat)이 적용(도메인 마이그 단일 창구). CRM-BOARD-SPEC §8·§10.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS crm_metrics (
  ym              text        NOT NULL,          -- 'YYYY-MM'
  region_key      text        NOT NULL,
  metric          text,                          -- 표시용 라벨
  value           numeric,                       -- 월값 (NULL = 데이터 없음)
  extra           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  generated_month text,                          -- 이 스냅샷 payload 의 최신월(generated_month)
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ym, region_key),
  CONSTRAINT crm_metrics_region_key_chk CHECK (region_key IN (
    'unregistered','experience','decision','retention','fan_pool',
    'application','target_pool','business'
  ))
);

COMMENT ON TABLE crm_metrics IS
  'CRM 월별 지표 스냅샷(engine-metrics/v2, R8/R9 키셋). engine-metrics-sync Edge 가 service_role 로 upsert. 마스터 전용 읽기.';

-- ── RLS — 마스터 전용 (재무 데이터, dashboard/goals 선례와 동일 게이트) ──────
ALTER TABLE crm_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_metrics_master_all ON crm_metrics;
CREATE POLICY crm_metrics_master_all ON crm_metrics
  FOR ALL
  USING (is_master())
  WITH CHECK (is_master());

-- service_role(Edge 적재자)은 RLS 를 우회하므로 별도 정책 불필요.

COMMIT;
