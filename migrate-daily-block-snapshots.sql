-- ============================================================================
-- daily_block_snapshots: daily 페이지 안전 스냅샷
--
-- 목적: 2026-05-13 사고처럼 mass softDelete / doc 손상 사고 시 직전 상태 복원.
--   - 변경 시 5분 throttle (활발한 편집도 시간당 12건 상한)
--   - softDelete >= 5 인 위험 diff 직전엔 무조건 (mandatory)
--   - 페이지당 최근 24건만 유지 (그 이상은 자동 삭제)
--
-- 스토리지: 페이지당 평균 ~16KB × 24 ≈ 400KB. 사용자 수 늘어도 무시 가능.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS daily_block_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_date       date NOT NULL,
  reason          text NOT NULL DEFAULT 'change'
                    CHECK (reason IN ('change','mass_delete','session_end','manual')),
  blocks          jsonb NOT NULL,    -- DailyBlock[] (camelCase) 그대로
  block_count     int  NOT NULL,    -- 빠른 조회용
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 페이지별 최신 순회 — 복구 / 정리에 사용
CREATE INDEX IF NOT EXISTS idx_daily_block_snapshots_page
  ON daily_block_snapshots (page_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_block_snapshots_user_date
  ON daily_block_snapshots (user_id, page_date, created_at DESC);

-- RLS — 본인 페이지의 스냅샷만 read/write, master 는 모두
ALTER TABLE daily_block_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dbs_select ON daily_block_snapshots;
DROP POLICY IF EXISTS dbs_insert ON daily_block_snapshots;
DROP POLICY IF EXISTS dbs_delete ON daily_block_snapshots;

CREATE POLICY dbs_select
  ON daily_block_snapshots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_master());

CREATE POLICY dbs_insert
  ON daily_block_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR is_master());

CREATE POLICY dbs_delete
  ON daily_block_snapshots FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR is_master());

-- 페이지당 24건 유지 — INSERT 직후 trigger 로 오래된 row 정리
CREATE OR REPLACE FUNCTION trim_daily_block_snapshots()
RETURNS trigger AS $$
BEGIN
  DELETE FROM daily_block_snapshots
   WHERE page_id = NEW.page_id
     AND id NOT IN (
       SELECT id FROM daily_block_snapshots
        WHERE page_id = NEW.page_id
        ORDER BY created_at DESC
        LIMIT 24
     );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trim_daily_block_snapshots ON daily_block_snapshots;
CREATE TRIGGER trg_trim_daily_block_snapshots
  AFTER INSERT ON daily_block_snapshots
  FOR EACH ROW EXECUTE FUNCTION trim_daily_block_snapshots();

COMMIT;

-- ============================================================================
-- 검증
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name='daily_block_snapshots';
-- SELECT indexname FROM pg_indexes WHERE tablename='daily_block_snapshots';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='daily_block_snapshots';
