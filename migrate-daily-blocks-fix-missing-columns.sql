-- ============================================================================
-- daily_blocks 누락 컬럼 보강 (origin_block_id 등)
-- 2026-05-01: 첫 마이그레이션 실행 시 일부 컬럼이 누락된 케이스 회복용.
-- ============================================================================
--
-- ADD COLUMN IF NOT EXISTS 라 이미 있어도 안전. 누락된 것만 추가.
-- ============================================================================

BEGIN;

-- 핵심 누락 컬럼: 이월 thread 추적
ALTER TABLE daily_blocks
  ADD COLUMN IF NOT EXISTS origin_block_id uuid;

-- 인덱스도 IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_daily_blocks_origin
  ON daily_blocks (origin_block_id)
  WHERE origin_block_id IS NOT NULL;

-- 다른 컬럼들도 IF NOT EXISTS 로 한 번 더 보강 (안전망)
ALTER TABLE daily_blocks
  ADD COLUMN IF NOT EXISTS carry_over_from date,
  ADD COLUMN IF NOT EXISTS is_carry_over boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fixed_section boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS todo_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS todo_checked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_todo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS section_master_id text REFERENCES worklog_sections(id),
  ADD COLUMN IF NOT EXISTS rich_content jsonb,
  ADD COLUMN IF NOT EXISTS text_content text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMIT;

-- ============================================================================
-- 검증 쿼리
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'daily_blocks' ORDER BY ordinal_position;
-- → origin_block_id 가 있는지, section_master_id 가 있는지 확인
-- ============================================================================
