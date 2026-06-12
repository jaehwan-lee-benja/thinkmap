-- ============================================================================
-- pages 확장 — page_type='dashboard' 허용 (통합 대시보드 D1)
--
-- ⚠ 대시보드는 마스터 전용이다 (payroll 과 동일 모델).
--   따라서 schedule 처럼 worklog 공개 절(pages_*_worklog)에 'dashboard' 를 넣지
--   않는다. 대시보드 진입 페이지(마스터 소유)는 pages 의 기본 정책
--   ("Users can ... pages" — is_master() OR self OR linked)으로 이미 보호된다
--   (payroll 과 같은 판단 — migrate-create-payroll.sql 주석 참조).
--   → 이 마이그레이션은 CHECK 제약에 'dashboard' 만 추가한다.
--   실제 목표 데이터는 goals 테이블의 is_master() 전용 RLS 로 보호된다.
--
-- 기존 허용값(normal/daily/calendar/frame/engine/schedule/payroll)은 전부 보존.
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전.
-- 전제: is_master() 존재 + pages 기본 정책에 is_master() 바이패스 존재
--       (migrate-dynamic-master.sql).
-- ============================================================================

BEGIN;

-- ── CHECK 제약 재정의 (기존 전체 보존 + dashboard 추가) ─────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_page_type_chk') THEN
    ALTER TABLE pages DROP CONSTRAINT pages_page_type_chk;
  END IF;
END $$;

ALTER TABLE pages
  ADD CONSTRAINT pages_page_type_chk
  CHECK (page_type IN (
    'normal','daily','calendar','frame','engine','schedule','payroll','dashboard'
  ));

-- worklog 공개 정책(pages_*_worklog)은 의도적으로 건드리지 않는다 (마스터 전용).
-- 마스터의 dashboard 페이지 INSERT/SELECT 는 "Users can insert/view ... pages"
-- 기본 정책의 is_master() 분기로 통과한다.

COMMIT;
