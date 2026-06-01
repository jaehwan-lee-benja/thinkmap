-- ============================================================================
-- 급여명세서(Payroll) — DB 마이그레이션
--
-- 1) pages_page_type_chk CHECK 제약에 'payroll' 추가 (급여 진입 페이지 1개)
-- 2) payroll_sheets 테이블 생성 (월별 1행, 명세서 전체 상태 jsonb) + RLS 마스터 전용
--
-- 급여는 마스터 전용 민감 데이터다. pages 의 일반 소유자/마스터 정책이
-- payroll 페이지(마스터 소유)를 이미 보호하므로, 공개 worklog 절에는 넣지 않는다.
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전.
-- 전제: is_master() 함수 존재 (migrate-dynamic-master.sql).
-- ============================================================================

BEGIN;

-- ── 1. pages.page_type 에 'payroll' 허용 ──────────────────────────────────
-- 기존 허용값(normal/daily/calendar/frame/engine/schedule) + payroll
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_page_type_chk') THEN
    ALTER TABLE pages DROP CONSTRAINT pages_page_type_chk;
  END IF;
END $$;

ALTER TABLE pages
  ADD CONSTRAINT pages_page_type_chk
  CHECK (page_type IN ('normal','daily','calendar','frame','engine','schedule','payroll'));

-- ── 2. payroll_sheets 테이블 ───────────────────────────────────────────────
-- 한 페이지(payroll 진입점) 아래 월별 1행. data 에 설정·인원별 명세 전체를 담는다.
--   data = {
--     config:    { rates:{weekday,weekend}, standardDailyHours, employmentInsuranceRate },
--     overrides: { [이름]: { weekday?, weekend?, standardDailyHours? } },
--     rows:      [ { name, payments{}, deductions{}, grossTotal, deductionTotal, netPay, ... } ],
--     attendanceRaw?: string  -- 업로드 원본 스냅샷(선택)
--   }
CREATE TABLE IF NOT EXISTS payroll_sheets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  pay_month   text NOT NULL,                        -- 'YYYY-MM' (예: '2026-04')
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, pay_month)
);

CREATE INDEX IF NOT EXISTS payroll_sheets_page_month_idx
  ON payroll_sheets (page_id, pay_month);

-- ── 3. RLS — 마스터 전용 (select/insert/update/delete 전부) ─────────────────
ALTER TABLE payroll_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_sheets_master_all" ON payroll_sheets;
CREATE POLICY "payroll_sheets_master_all" ON payroll_sheets
  FOR ALL
  USING (is_master())
  WITH CHECK (is_master());

COMMIT;
