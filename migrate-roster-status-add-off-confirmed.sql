-- roster_assignments.status CHECK 확장 — '오프'(off, 휴가)·'확정'(confirmed) 추가.
-- 그날 인원 구성 워크플로우(PLAN-roster-visual-board.md §12). 재실행 안전.
-- 전제: migrate-create-members.sql 선적용(roster_assignments 존재).
--
-- 주의: 기존 CHECK는 CREATE TABLE 인라인 정의라 이름이 환경마다 다를 수 있다
-- (보통 roster_assignments_status_check, 그러나 보장 못 함). 이름에 의존하면
-- DROP이 조용히 실패해 옛 제약이 남고 'off'/'confirmed' 삽입이 계속 거부될 위험.
-- → pg_constraint에서 status 관련 CHECK를 "이름 무관"하게 찾아 모두 드롭한 뒤 재생성.

BEGIN;

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'roster_assignments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE roster_assignments DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE roster_assignments
  ADD CONSTRAINT roster_assignments_status_check
  CHECK (status IN (
    'planned','worked','requested','accepted','declined','tentative',
    'off','confirmed'
  ));

COMMIT;
