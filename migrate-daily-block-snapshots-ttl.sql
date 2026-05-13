-- ============================================================================
-- daily_block_snapshots: 14일 TTL 추가
--
-- 기존 trim trigger 에 "14일 지난 row 자동 삭제" 로직 추가.
-- 매 INSERT 마다 global TTL DELETE 실행 (5분 throttle 덕에 빈도 낮음, cost 무시).
--
-- 결과:
--   - 페이지당 24건 cap (기존 유지)
--   - 14일 이상 오래된 스냅샷 자동 삭제 (신규)
--   - 4유저 × 365일 × 24건 × 16KB ≈ 561MB → 14일 cap 적용 시 ~22MB/유저, 90MB 총
-- ============================================================================

BEGIN;

-- created_at 단독 인덱스 — TTL DELETE 의 효율 보장
CREATE INDEX IF NOT EXISTS idx_daily_block_snapshots_created_at
  ON daily_block_snapshots (created_at);

-- trim trigger 확장 — 페이지당 24건 cap + 14일 TTL
CREATE OR REPLACE FUNCTION trim_daily_block_snapshots()
RETURNS trigger AS $$
BEGIN
  -- (1) 같은 페이지의 25번째 이상 오래된 row 정리
  DELETE FROM daily_block_snapshots
   WHERE page_id = NEW.page_id
     AND id NOT IN (
       SELECT id FROM daily_block_snapshots
        WHERE page_id = NEW.page_id
        ORDER BY created_at DESC
        LIMIT 24
     );

  -- (2) 14일 이상 오래된 모든 row 정리 (글로벌 TTL)
  --     5분 throttle 덕에 매 INSERT 비싸지 않음. created_at 인덱스로 빠른 range scan.
  DELETE FROM daily_block_snapshots
   WHERE created_at < NOW() - INTERVAL '14 days';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- 검증
-- ============================================================================
-- 1) 인덱스 확인
-- SELECT indexname FROM pg_indexes WHERE tablename='daily_block_snapshots';
--
-- 2) 함수 본문 확인
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='trim_daily_block_snapshots';
--
-- 3) 수동 정리 (안전한 dry-run 후 실제 삭제)
-- SELECT COUNT(*), MIN(created_at), MAX(created_at)
--   FROM daily_block_snapshots
--  WHERE created_at < NOW() - INTERVAL '14 days';
