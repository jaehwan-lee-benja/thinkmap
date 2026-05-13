-- ============================================================================
-- 2026-05-13 업무일지 복구
--
-- 진단 결과:
--   12:10:26 한 트랜잭션으로 페이지의 거의 모든 row 가 일괄 soft-delete 됨.
--   (deleted_at = '2026-05-13T12:10:26.519+00:00') — 명백한 버그.
--   이전 시점의 개별 deletion 은 사용자 의도일 가능성이 있어 보존.
--
-- 전략: deleted_at = '2026-05-13T12:10:26.519+00:00' 인 row 만 undelete.
--
-- ⚠️ 이 스크립트는 ROLLBACK 으로 잠겨 있습니다.
-- ⚠️ VERIFY 결과 (단일 JSON) 를 보고 OK 면 마지막 줄을 COMMIT 으로 바꿔 다시 Run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Undelete
-- ----------------------------------------------------------------------------
UPDATE daily_blocks
   SET deleted_at = NULL,
       updated_at = NOW()
 WHERE page_date = '2026-05-13'
   AND deleted_at = '2026-05-13T12:10:26.519+00:00';

-- ----------------------------------------------------------------------------
-- 2) 검증 — 모든 결과를 하나의 JSON 으로 묶어 result 컬럼에 반환
-- ----------------------------------------------------------------------------
WITH
recovered AS (
  SELECT COUNT(*)::int AS cnt
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND deleted_at IS NULL
),
active_by_type AS (
  SELECT block_type, COUNT(*)::int AS cnt
    FROM daily_blocks
   WHERE page_date = '2026-05-13' AND deleted_at IS NULL
   GROUP BY block_type
),
dup_section_per_master AS (
  SELECT section_master_id, COUNT(*)::int AS cnt
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND block_type = 'section'
     AND section_master_id IS NOT NULL
     AND deleted_at IS NULL
   GROUP BY section_master_id
  HAVING COUNT(*) > 1
),
dup_children AS (
  SELECT section_id, parent_block_id, text_content, COUNT(*)::int AS cnt
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND block_type <> 'section'
     AND deleted_at IS NULL
     AND text_content IS NOT NULL AND text_content <> ''
   GROUP BY section_id, parent_block_id, text_content
  HAVING COUNT(*) > 1
),
user_content_preview AS (
  SELECT LEFT(COALESCE(text_content,''), 80) AS text_preview,
         block_type, is_carry_over, created_at
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND deleted_at IS NULL
     AND created_at >= '2026-05-13T12:00:00+00:00'
     AND created_at <  '2026-05-13T12:10:30+00:00'
   ORDER BY created_at
),
carry_over_active AS (
  SELECT COUNT(*)::int AS cnt
    FROM daily_blocks
   WHERE page_date = '2026-05-13'
     AND deleted_at IS NULL
     AND is_carry_over = true
)
SELECT jsonb_build_object(
  'v1_total_active_rows',     (SELECT cnt FROM recovered),
  'v2_active_by_type',        (SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM active_by_type a),
  'v3_dup_section_per_master',(SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM dup_section_per_master d),
  'v4_dup_children',          (SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM dup_children d),
  'v5_user_content_preview',  (SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb) FROM user_content_preview u),
  'v6_active_carry_over',     (SELECT cnt FROM carry_over_active)
) AS result;

-- ⚠️ 검증 완료. 실제 반영을 위해 COMMIT 으로 변경됨.
COMMIT;
