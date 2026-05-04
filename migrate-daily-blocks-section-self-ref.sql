-- ============================================================================
-- daily_blocks.section_id 를 self-reference 로 + section_master_id 분리
-- WORKLOG-SPEC.md v2 — §9.9 옵션 A (2026-04-30 결정)
-- ============================================================================
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행.
--
-- 전제: daily_blocks 테이블에 운영 데이터가 없거나 더미만 있음.
-- (v2 출범 전이라 안전. 데이터 있으면 변환 정책이 별도 필요 — 본 스크립트는 데이터 0 가정.)
--
-- 변경 요지:
--   - section_id  (text, → worklog_sections) 제거 후 (uuid, → daily_blocks self-ref) 로 재정의
--   - section_master_id (text, → worklog_sections) 신규 추가. section row 만 채움
--
-- 결정 근거:
--   §3.7.3 R6: section row 의 sectionId === blockId (UUID 자기참조)
--   §3.4: 섹션 마스터 메타 (제목/권한) 는 worklog_sections 단일 소스
-- ============================================================================

BEGIN;

-- 안전 가드: daily_blocks 가 비어있는지 확인. 데이터가 있으면 ROLLBACK.
DO $$
DECLARE
  cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt FROM daily_blocks;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'daily_blocks 에 % 행 존재. 본 마이그레이션은 빈 테이블 가정. 운영 데이터가 있으면 별도 변환 정책 필요.', cnt;
  END IF;
END $$;

-- 1. 기존 section_id FK 제거
ALTER TABLE daily_blocks
  DROP CONSTRAINT IF EXISTS daily_blocks_section_id_fkey;

-- 2. section_id 타입 변경 text → uuid (데이터 0 이라 단순 변환)
ALTER TABLE daily_blocks
  ALTER COLUMN section_id TYPE uuid USING NULL::uuid;

-- 3. self-reference FK 추가
ALTER TABLE daily_blocks
  ADD CONSTRAINT daily_blocks_section_id_fkey
  FOREIGN KEY (section_id) REFERENCES daily_blocks(block_id) ON DELETE CASCADE;

-- 4. section_master_id 컬럼 추가 (section row 만 채움)
ALTER TABLE daily_blocks
  ADD COLUMN IF NOT EXISTS section_master_id text
    REFERENCES worklog_sections(id);

-- 5. master 별 조회 / 통계 가속용 인덱스
CREATE INDEX IF NOT EXISTS idx_daily_blocks_section_master
  ON daily_blocks (section_master_id)
  WHERE section_master_id IS NOT NULL AND deleted_at IS NULL;

COMMIT;

-- ============================================================================
-- 검증 쿼리 (실행 후 확인)
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'daily_blocks' AND column_name IN ('section_id', 'section_master_id');
-- → section_id = uuid, section_master_id = text
--
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'daily_blocks'::regclass AND conname LIKE '%section%';
-- → section_id 가 daily_blocks(block_id) self-ref, master 가 worklog_sections(id)
-- ============================================================================
