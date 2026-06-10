-- ============================================================================
-- Q3 / STEP 2 (BACKFILL) — master 섹션 아래 'all' → 'master' (백업+검증)
-- 작성: 2026-06-09 · PLAN-daily-carryover-authority.md Phase 0.5
-- 실행: ★ Q3-STEP1-dryrun.sql 로 범위 확인 후 ★ 이 파일 전체 복붙 후 Run.
--
-- 안전성:
--   - 변경 전 backup 테이블에 (block_id, 옛 visibility) 기록 → 롤백 가능.
--   - visibility 만 'all'→'master'. 삭제/이동/내용변경 없음. 멱등(재실행 안전).
--   - 무손실: master 섹션 콘텐츠는 마스터만 보면 되는 것. 비마스터는 원래 못 보던 것.
--   - 맨 아래 검증 2개: backed_up_rows(>0), remaining(=0) 확인.
-- ============================================================================

-- 0) 백업 테이블 (없으면 생성) + RLS 활성화(클라이언트 접근 차단, 정책 없음 = 전면 차단).
--    SQL 에디터는 service_role 이라 RLS 를 우회하므로 이 스크립트 동작엔 영향 없음.
CREATE TABLE IF NOT EXISTS q3_visibility_backup_20260609 (
  block_id   uuid PRIMARY KEY,
  page_id    uuid,
  old_visibility text,
  changed_at timestamptz DEFAULT now()
);
ALTER TABLE q3_visibility_backup_20260609 ENABLE ROW LEVEL SECURITY;

-- 1) 대상 백업 (master 섹션 아래 'all' 비-section 블록 — 살아있는 daily 페이지만)
WITH master_sections AS (
  SELECT block_id FROM daily_blocks
  WHERE block_type='section' AND visibility='master' AND deleted_at IS NULL
)
INSERT INTO q3_visibility_backup_20260609 (block_id, page_id, old_visibility)
SELECT t.block_id, t.page_id, 'all'
FROM daily_blocks t
JOIN master_sections ms ON ms.block_id = t.section_id
JOIN pages p ON p.id = t.page_id AND p.page_type='daily' AND p.deleted_at IS NULL
WHERE t.block_type <> 'section' AND t.visibility='all' AND t.deleted_at IS NULL
ON CONFLICT (block_id) DO NOTHING;

-- 2) 교정 (백업된 block 만 정확히)
UPDATE daily_blocks t
SET visibility = 'master'
FROM q3_visibility_backup_20260609 b
WHERE b.block_id = t.block_id AND t.visibility = 'all';

-- 3) 검증 A — 백업/변경 건수 (>0 이어야 함)
SELECT COUNT(*) AS backed_up_rows FROM q3_visibility_backup_20260609;

-- 4) 검증 B — 살아있는 daily 페이지에 남은 고아 (=0 이어야 정상, P1 불변식 성립)
WITH master_sections AS (
  SELECT block_id FROM daily_blocks
  WHERE block_type='section' AND visibility='master' AND deleted_at IS NULL
)
SELECT COUNT(*) AS remaining_all_under_master_live
FROM daily_blocks t
JOIN master_sections ms ON ms.block_id = t.section_id
JOIN pages p ON p.id = t.page_id AND p.page_type='daily' AND p.deleted_at IS NULL
WHERE t.block_type <> 'section' AND t.visibility='all' AND t.deleted_at IS NULL;

-- ============================================================================
-- 롤백(필요 시):
--   UPDATE daily_blocks t SET visibility = b.old_visibility
--   FROM q3_visibility_backup_20260609 b WHERE b.block_id = t.block_id;
-- ============================================================================
