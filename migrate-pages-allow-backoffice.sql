-- ============================================================================
-- pages 확장 — page_type='backoffice' 허용 (사이트 구조도 백오피스)
--
-- ⚠ 백오피스는 마스터 전용이다 (payroll/dashboard/members 와 동일 모델).
--   따라서 worklog 공개 절(pages_*_worklog)에 'backoffice' 를 넣지 않는다.
--   백오피스 진입 페이지(마스터 소유)는 pages 기본 정책의 is_master() 바이패스로 보호된다.
--   실제 노드 데이터는 site_nodes 의 is_master() 전용 RLS 로 보호된다
--   (migrate-create-site-nodes.sql).
--   → 이 마이그레이션은 CHECK 제약에 'backoffice' 만 추가한다.
--
-- ★ 실행 전 필수: 라이브 허용값을 먼저 확인해 누락 방지(다른 세션/브랜치가 값을
--   추가했을 수 있음):
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='pages_page_type_chk';
--
--   위 출력의 모든 값 + 'backoffice' 로 아래 IN(...) 을 조정해 실행한다.
--   (아래 목록은 src/utils/pageTypes.js 기준 스냅샷 — 라이브와 대조할 것.)
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행. 재실행 안전.
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
    'normal','daily','calendar','frame','engine','schedule',
    'payroll','dashboard','members','goal','inventory','seat',
    'backoffice'
  ));

-- worklog 공개 정책(pages_*_worklog)은 의도적으로 건드리지 않는다 (마스터 전용).
-- 마스터의 backoffice 페이지 INSERT/SELECT 는 pages 기본 정책 is_master() 분기로 통과.

COMMIT;
