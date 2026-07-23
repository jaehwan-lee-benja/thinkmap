-- ============================================================================
-- pages 확장 — page_type='crmboard' 허용 (CRM 운영 보드 P1)
--
-- ⚠ CRM 운영 보드는 마스터 전용이다 (dashboard/payroll 과 동일 모델).
--   따라서 worklog 공개 절(pages_*_worklog)에 'crmboard' 를 넣지 않는다.
--   CRM 보드 진입 페이지(마스터 소유)는 pages 기본 정책
--   ("Users can ... pages" — is_master() OR self OR linked)으로 이미 보호된다
--   (dashboard 와 같은 판단 — migrate-pages-allow-dashboard.sql 주석 참조).
--   → 이 마이그레이션은 CHECK 제약에 'crmboard' 만 추가한다.
--   실제 지표/링크 데이터는 crm_metrics·board_todo_links 의 is_master() 전용
--   RLS 로 보호된다(후속 마이그, CRM-BOARD-SPEC §4·§7).
--
-- 기존 허용값(normal/daily/calendar/frame/engine/schedule/payroll/dashboard/
--   members/goal/inventory/seat/backoffice)은 전부 보존.
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전.
-- 전제: is_master() 존재 + pages 기본 정책에 is_master() 바이패스 존재.
--
-- ★적용 규율: tmcrm 은 직접 적용하지 않는다. supabase-guardian 검수 → 유저 승인
--   → 기존 thinkmap 통합 세션이 적용(도메인 마이그 단일 창구). CRM-BOARD-SPEC §8·§10.
--
-- ★★적용 전 필수(dry-run): 멀티 worktree/세션 구조라 다른 브랜치가 값을 먼저 추가했을 수 있다.
--   라이브 허용값을 먼저 확인해 아래 IN 목록이 정확히 일치하는지 대조하고, 라이브에 이 14개
--   외 값이 있으면 그 값도 IN 목록에 포함해 보정한 뒤 적용한다(backoffice 마이그 선례):
--     SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'pages_page_type_chk';
--   (DROP+ADD 는 기존 행 전체를 재검증하므로, 누락 시 트랜잭션이 안전하게 롤백된다 — 데이터
--    파손은 없으나 재작업이 생긴다.) pages 는 ACCESS EXCLUSIVE 락이 걸리니 트래픽 적은 시점 권장.
-- ============================================================================

BEGIN;

-- ── CHECK 제약 재정의 (기존 전체 보존 + crmboard 추가) ──────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_page_type_chk') THEN
    ALTER TABLE pages DROP CONSTRAINT pages_page_type_chk;
  END IF;
END $$;

ALTER TABLE pages
  ADD CONSTRAINT pages_page_type_chk
  CHECK (page_type IN (
    'normal','daily','calendar','frame','engine','schedule',
    'payroll','dashboard','members','goal','inventory','seat',
    'backoffice','crmboard'
  ));

-- worklog 공개 정책(pages_*_worklog)은 의도적으로 건드리지 않는다 (마스터 전용).
-- 마스터의 crmboard 페이지 INSERT/SELECT 는 "Users can insert/view ... pages"
-- 기본 정책의 is_master() 분기로 통과한다.

COMMIT;
