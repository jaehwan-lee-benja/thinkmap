-- ⚠⚠ 재실행 주의 — 이 파일은 2026-08-03 보안 묶음 A 적용분을 **되돌린다** (배너 2026-08-03)
-- ----------------------------------------------------------------------------
-- 이 파일이 정의/재생성하는 함수: purge_deleted_pages()
-- 라이브는 2026-08-03 에 아래가 적용된 상태다:
--   · secdef 7종 `SET search_path = public, pg_temp` 고정  (migration `pin_secdef_search_path`)
--   · `create_canvas_pair` PUBLIC·anon EXECUTE 회수 + authenticated authored 부여
--                                                    (migration `fix_create_canvas_pair_exposure`)
-- ★이 파일엔 그 설정을 재현하는 줄이 **없다**(authored GRANT 행도 없다 = defacl 상속분 ⓒ)
--   ⇒ 재실행하면 `create or replace` / `drop+create` 로 **고정과 회수가 조용히 사라진다.**
-- ★재실행 규칙: 돌리기 전에 위 두 마이그를 다시 적용할 준비를 해라. 아니면 돌리지 마라.
--   기준선·판정 술어 = `docs/SECURITY-BUNDLE-A-BASELINE-20260803.md`
-- ----------------------------------------------------------------------------
-- soft-delete된 페이지 자동 정리 (30일 경과 시 완전 삭제)
-- Supabase SQL Editor에서 실행

-- 1. 정리 함수 생성
CREATE OR REPLACE FUNCTION purge_deleted_pages()
RETURNS void AS $$
BEGIN
  DELETE FROM pages
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. pg_cron 확장 활성화 (이미 활성화되어 있으면 무시됨)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 3. 매일 새벽 3시(UTC) 정리 작업 예약
SELECT cron.schedule(
  'purge-deleted-pages',
  '0 3 * * *',
  'SELECT purge_deleted_pages()'
);
