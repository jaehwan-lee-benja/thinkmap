-- ============================================================================
-- pages 확장 — page_type='goal' 허용 (목표 페이지 = 최상위 레이어)
--
-- '목표'는 일반 페이지(normal)와 동일하게 자유 텍스트로 동작하는 독립 엔티티
-- (project_id=NULL) 페이지다. 목표값/진행률/별도 테이블 없음 — 렌더·편집은
-- TipTapEditor 를 그대로 재사용한다 (App.jsx 기본 분기로 통과).
--
-- 권한: 개인 소유자 기반(패러다임 A). 별도 RLS 정책 불필요 —
--   pages 기본 정책의 `auth.uid() = user_id` 분기로 SELECT/INSERT/UPDATE/DELETE
--   모두 통과한다 (worklog 공개 절에는 넣지 않음 — 공개 대상 아님).
--   → 이 마이그레이션은 CHECK 제약에 'goal' 만 추가한다.
--
-- 기존 허용값(normal/daily/calendar/frame/engine/schedule/payroll/dashboard/members)
-- 은 전부 보존.
--
-- 단일 트랜잭션. 재실행 안전.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_page_type_chk') THEN
    ALTER TABLE pages DROP CONSTRAINT pages_page_type_chk;
  END IF;
END $$;

ALTER TABLE pages
  ADD CONSTRAINT pages_page_type_chk
  CHECK (page_type IN (
    'normal','daily','calendar','frame','engine','schedule','payroll','dashboard','members','goal'
  ));

COMMIT;
