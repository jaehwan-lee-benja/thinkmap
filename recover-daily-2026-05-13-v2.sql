-- ============================================================================
-- 2026-05-13 2차 복구
--
-- 이전 복구 직후 페이지를 다시 열어 동일 버그로 또 일괄 softDelete 됨.
-- 이번엔: 가장 최근 일괄 deletion 그룹을 자동 식별해서 undelete.
--
-- ⚠️ 페이지를 브라우저에서 닫은 상태에서 Run 할 것. 열어두면 또 지워질 수 있음.
-- ⚠️ ROLLBACK 으로 잠금. 검증 후 COMMIT 으로 바꿔 다시 Run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) 진단: 5/13 의 deleted_at 별 row 수 (큰 그룹부터)
-- ----------------------------------------------------------------------------
SELECT 'DIAG: deleted_at groups (top 10 by size)' AS step,
       deleted_at, COUNT(*)::int AS rows
  FROM daily_blocks
 WHERE page_date = '2026-05-13'
   AND deleted_at IS NOT NULL
 GROUP BY deleted_at
 ORDER BY COUNT(*) DESC, deleted_at DESC
 LIMIT 10;

-- ----------------------------------------------------------------------------
-- 1) 가장 큰 deletion 그룹을 자동 선정해서 undelete
--    (12:10:26 그룹은 이미 한 번 복구됐다가 또 deleted 됐으니 가장 최근/가장 큰 그룹 = 새 batch)
-- ----------------------------------------------------------------------------
WITH biggest AS (
  SELECT deleted_at
    FROM daily_blocks
   WHERE page_date = '2026-05-13' AND deleted_at IS NOT NULL
   GROUP BY deleted_at
   ORDER BY COUNT(*) DESC
   LIMIT 1
)
UPDATE daily_blocks
   SET deleted_at = NULL,
       updated_at = NOW()
 WHERE page_date = '2026-05-13'
   AND deleted_at = (SELECT deleted_at FROM biggest);

-- ----------------------------------------------------------------------------
-- 2) 검증
-- ----------------------------------------------------------------------------
WITH
active AS (
  SELECT COUNT(*)::int AS cnt
    FROM daily_blocks
   WHERE page_date = '2026-05-13' AND deleted_at IS NULL
),
by_type AS (
  SELECT block_type, COUNT(*)::int AS cnt
    FROM daily_blocks
   WHERE page_date = '2026-05-13' AND deleted_at IS NULL
   GROUP BY block_type
),
sample_active AS (
  SELECT LEFT(COALESCE(text_content,''), 60) AS text_preview,
         block_type, is_carry_over, created_at
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND deleted_at IS NULL
     AND text_content IS NOT NULL AND text_content <> ''
   ORDER BY created_at
)
SELECT jsonb_build_object(
  'total_active', (SELECT cnt FROM active),
  'by_type',      (SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) FROM by_type b),
  'rows_with_text', (SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM sample_active s)
) AS result;

-- ⚠️ 검증 완료. 실제 반영을 위해 COMMIT 으로 변경됨.
COMMIT;
