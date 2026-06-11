-- ============================================================================
-- Phase 0.7 STEP 2 — board-membership 협업편집 RLS (daily_blocks UPDATE 에만)
-- 작성: 2026-06-11 · PLAN-daily-carryover-authority.md Phase 0.7
-- ★ 회귀표(PHASE07-regression.md) "안 깨짐" 확인 전에는 실행 금지 ★
-- 선행: STEP 1(멤버 등록) 완료, 회귀표 검토 통과.
--
-- 변경 범위(최소):
--   - daily_blocks UPDATE 정책에만 OR (visibility='all' AND is_board_member_of_page) 추가
--   - SELECT/INSERT/DELETE, pages, worklog_sections 전부 무변경
-- 마스터 보호: visibility='master' 블록은 멤버가 SELECT 도 UPDATE 도 불가(아래 근거).
--   · SELECT 정책(미변경): visibility='all' OR is_master() → master 블록은 마스터만.
--   · UPDATE USING: visibility='all' 조건 → master 블록은 멤버 경로 진입 불가.
--   · UPDATE WITH CHECK: 결과도 visibility='all' 강제 → 멤버가 'all'→'master' 승격 불가.
-- 회귀 위험: additive(OR). 기존 author/master 경로 그대로 → 접근 손실 0.
-- ============================================================================

-- 1) 헬퍼: 이 페이지가 속한 보드의 멤버인가? (SECURITY DEFINER로 RLS 우회 → 재귀 회피)
CREATE OR REPLACE FUNCTION is_board_member_of_page(p_page_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pages pg
    JOIN worklog_board_members m ON m.board_id = pg.parent_id
    WHERE pg.id = p_page_id
      AND m.user_id = auth.uid()
  );
$$;

-- 2) daily_blocks UPDATE 정책 재정의 (additive 절 추가)
DROP POLICY IF EXISTS daily_blocks_update ON daily_blocks;
CREATE POLICY daily_blocks_update
  ON daily_blocks FOR UPDATE
  USING (
    auth.uid() = user_id
    OR is_master()
    OR (visibility = 'all' AND is_board_member_of_page(page_id))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR is_master()
    OR (visibility = 'all' AND is_board_member_of_page(page_id))
  );

-- 3) 검증: 정책이 의도대로 들어갔는지 확인
SELECT policyname, cmd, qual AS using_expr, with_check AS check_expr
FROM pg_policies
WHERE schemaname='public' AND tablename='daily_blocks' AND policyname='daily_blocks_update';

-- ── 롤백(STEP2-ROLLBACK, 회귀 발견 시) ────────────────────────────────────────
-- DROP POLICY IF EXISTS daily_blocks_update ON daily_blocks;
-- CREATE POLICY daily_blocks_update ON daily_blocks FOR UPDATE
--   USING  ((auth.uid() = user_id) OR is_master())
--   WITH CHECK ((auth.uid() = user_id) OR is_master());
-- DROP FUNCTION IF EXISTS is_board_member_of_page(uuid);
