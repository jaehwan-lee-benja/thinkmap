-- ============================================================================
-- daily_blocks 테이블 생성 + worklog_sections.scope 추가
-- WORKLOG-SPEC.md v2 — Phase v2.1 step 3
-- ============================================================================
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행.
-- 실행 전 사전 폐기 SQL (§5.1) 이 먼저 실행되어 있어야 함.
--
-- 결정 근거:
--   §3.2.1 daily_blocks 컬럼/인덱스
--   §3.2.3 + §9.4 worklog_sections.scope 추가
--   §3.3 + §9.5 blockId = uuid v4
--   §3.2.2 + §9.3 _dismissed = soft delete (별도 테이블 없음)
--   §3.4 섹션 row 의 textContent = denormalized cache
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. 의존 extension
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. worklog_sections 확장 (§9.4)
--    자유 섹션도 row 등록. scope 'global' = 고정, 'user' = 자유.
-- ----------------------------------------------------------------------------
ALTER TABLE worklog_sections
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'global'
    CHECK (scope IN ('global', 'user'));

-- 기존 시드 (fixed_*) 는 모두 global. ADD COLUMN DEFAULT 로 자동 채워짐.
-- 자유 섹션은 INSERT 시 created_by 필수 — application 단에서 강제.

-- ----------------------------------------------------------------------------
-- 2. daily_blocks 테이블
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_blocks (
  block_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id           uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  page_date         date NOT NULL,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 구조
  block_type        text NOT NULL CHECK (block_type IN (
                      'paragraph','heading','toggle','section',
                      'quote','code','image','table'
                    )),
  parent_block_id   uuid REFERENCES daily_blocks(block_id) ON DELETE CASCADE,
  section_id        text NOT NULL REFERENCES worklog_sections(id),
  position          numeric NOT NULL,

  -- 본문
  text_content      text,
  rich_content      jsonb,

  -- todo 속성 (block_type='toggle' && is_todo 일 때만 의미 있음)
  is_todo           boolean NOT NULL DEFAULT false,
  todo_checked      boolean NOT NULL DEFAULT false,
  todo_status       text NOT NULL DEFAULT 'open'
                      CHECK (todo_status IN ('open','done','hold')),

  -- 이월
  is_carry_over     boolean NOT NULL DEFAULT false,
  carry_over_from   date,
  origin_block_id   uuid,

  -- 메타
  is_pinned         boolean NOT NULL DEFAULT false,
  visibility        text NOT NULL DEFAULT 'all'
                      CHECK (visibility IN ('all','master')),
  is_fixed_section  boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- ----------------------------------------------------------------------------
-- 3. 인덱스 (§3.2.1)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_daily_blocks_page
  ON daily_blocks (page_id, position)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_blocks_section
  ON daily_blocks (page_id, section_id, position)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_blocks_origin
  ON daily_blocks (origin_block_id)
  WHERE origin_block_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_blocks_todo_open
  ON daily_blocks (page_date, section_id)
  WHERE is_todo = true AND todo_checked = false AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_blocks_pinned
  ON daily_blocks (user_id, page_date)
  WHERE is_pinned = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_blocks_text_trgm
  ON daily_blocks USING gin (text_content gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 4. updated_at 자동 갱신 trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_blocks_updated_at ON daily_blocks;
CREATE TRIGGER trg_daily_blocks_updated_at
  BEFORE UPDATE ON daily_blocks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ----------------------------------------------------------------------------
-- 5. RLS — daily 페이지 통합 접근 (v1 §10-2) 와 동일 정책
--    - 인증 사용자는 모두 SELECT 가능 (단, visibility='master' row 는 master 만)
--    - INSERT: 본인 또는 master, user_id 는 본인으로 강제
--    - UPDATE: 본인 또는 master
--    - DELETE: master 만 (일반 사용자는 deleted_at UPDATE 로 soft delete)
-- ----------------------------------------------------------------------------
ALTER TABLE daily_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_blocks_select  ON daily_blocks;
DROP POLICY IF EXISTS daily_blocks_insert  ON daily_blocks;
DROP POLICY IF EXISTS daily_blocks_update  ON daily_blocks;
DROP POLICY IF EXISTS daily_blocks_delete  ON daily_blocks;

CREATE POLICY daily_blocks_select
  ON daily_blocks FOR SELECT
  TO authenticated
  USING (visibility = 'all' OR is_master());

CREATE POLICY daily_blocks_insert
  ON daily_blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR is_master());

CREATE POLICY daily_blocks_update
  ON daily_blocks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR is_master())
  WITH CHECK (auth.uid() = user_id OR is_master());

CREATE POLICY daily_blocks_delete
  ON daily_blocks FOR DELETE
  TO authenticated
  USING (is_master());

-- ----------------------------------------------------------------------------
-- 6. worklog_sections 의 'user' scope row 에 대한 RLS 보강
--    기존 정책은 모든 인증 사용자 SELECT / master 만 UPDATE.
--    자유 섹션이 추가됐으니 본인 user 섹션은 본인이 INSERT/UPDATE/DELETE 가능.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS worklog_sections_user_insert ON worklog_sections;
DROP POLICY IF EXISTS worklog_sections_user_update ON worklog_sections;
DROP POLICY IF EXISTS worklog_sections_user_delete ON worklog_sections;

CREATE POLICY worklog_sections_user_insert
  ON worklog_sections FOR INSERT
  TO authenticated
  WITH CHECK (
    (scope = 'user' AND created_by = auth.uid())
    OR is_master()
  );

CREATE POLICY worklog_sections_user_update
  ON worklog_sections FOR UPDATE
  TO authenticated
  USING (
    (scope = 'user' AND created_by = auth.uid())
    OR is_master()
  )
  WITH CHECK (
    (scope = 'user' AND created_by = auth.uid())
    OR is_master()
  );

CREATE POLICY worklog_sections_user_delete
  ON worklog_sections FOR DELETE
  TO authenticated
  USING (
    (scope = 'user' AND created_by = auth.uid())
    OR is_master()
  );

COMMIT;

-- ============================================================================
-- 검증 쿼리 (실행 후 확인)
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'daily_blocks' ORDER BY ordinal_position;
--
-- SELECT indexname FROM pg_indexes WHERE tablename = 'daily_blocks';
--
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'daily_blocks';
--
-- SELECT id, scope, title FROM worklog_sections ORDER BY sort_order;
-- ============================================================================
