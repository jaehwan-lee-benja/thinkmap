-- ============================================================================
-- 보드-스코프 섹션 마이그레이션 (PLAN-board-scope-sections.md)
-- 작성: 2026-05-29
-- ============================================================================
--
-- 목적: worklog_sections 의 소유 단위를 user → board(parent_id) 로 옮김.
--       2026-05-29 진단에서 드러난 단위 불일치 (kbl0226 의 5/28 사고) 의 구조 해결.
--
-- 실행 방법:
--   각 STEP 을 위→아래 순서로 한 블록씩 실행. STEP 5 (검증) 통과 후에만 다음 STEP 진행.
--   코드 (src/utils/createDailyPageV2.js) 변경은 STEP 4 까지 통과한 뒤 별도 배포.
--   STEP 6 (정리) 은 코드 배포가 prod 에서 정상 동작 확인된 뒤 며칠 뒤 실행.
--
-- 롤백:
--   각 STEP 종료 후 commit. 문제 시 backup 테이블 (`*_backup_2026_05_29`) 에서 복원.
--   STEP 1, 2, 3 까지는 신규 컬럼/테이블만 추가하므로 backup 만 있으면 손쉽게 원복.
--   STEP 6 실행 전까지는 user-scope 도 살아있어 코드를 끄면 정상.
--
-- 디폴트 가정 (PLAN §8 의 Q1~Q5):
--   Q1: pages.is_board 컬럼 추가
--   Q2: user-scope 섹션은 가장 많이 쓴 보드 1개로 통합
--   Q3: app_users.role='master' → 보드 master 자동 시드
--   Q4: 임퍼소네이션 동작 그대로
--   Q5: 다른 깨진 daily 페이지 전수 스캔은 별도 파일 (diagnose-other-broken-dailies.sql)
-- ============================================================================


-- ============================================================================
-- STEP 0: 백업
-- ============================================================================
-- 마이그 대상 테이블 2 개를 통째로 복제. row 수 적으니 안전.
BEGIN;

CREATE TABLE IF NOT EXISTS worklog_sections_backup_2026_05_29 AS
  SELECT * FROM worklog_sections;

CREATE TABLE IF NOT EXISTS worklog_user_settings_backup_2026_05_29 AS
  SELECT * FROM worklog_user_settings;

COMMIT;

-- 백업 확인
SELECT 'sections backup' AS label, COUNT(*) AS rows FROM worklog_sections_backup_2026_05_29
UNION ALL
SELECT 'user_settings backup', COUNT(*) FROM worklog_user_settings_backup_2026_05_29;


-- ============================================================================
-- STEP 1: 스키마 확장
-- ============================================================================
BEGIN;

-- 1-a. worklog_sections.board_id 추가 (NULL 허용 — 'global' 은 NULL 유지)
ALTER TABLE worklog_sections
  ADD COLUMN IF NOT EXISTS board_id uuid REFERENCES pages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_worklog_sections_board
  ON worklog_sections(board_id, sort_order)
  WHERE deleted_at IS NULL;

-- 1-b. pages.is_board 추가
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS is_board boolean NOT NULL DEFAULT false;

-- daily 페이지의 parent 는 모두 보드로 표시
UPDATE pages SET is_board = true
WHERE id IN (
  SELECT DISTINCT parent_id
  FROM pages
  WHERE page_type = 'daily' AND parent_id IS NOT NULL
);

-- 1-c. worklog_board_members
CREATE TABLE IF NOT EXISTS worklog_board_members (
  board_id    uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('master','member')),
  invited_by  uuid REFERENCES auth.users(id),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_worklog_board_members_user
  ON worklog_board_members(user_id);

-- 1-d. worklog_board_user_settings (구 worklog_user_settings 의 보드-분해 버전)
CREATE TABLE IF NOT EXISTS worklog_board_user_settings (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id       uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  section_order  jsonb NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, board_id)
);

-- RLS (자기 행만)
ALTER TABLE worklog_board_user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_user_settings_self" ON worklog_board_user_settings;
CREATE POLICY "board_user_settings_self" ON worklog_board_user_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS for board_members
ALTER TABLE worklog_board_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_members_select_self" ON worklog_board_members;
CREATE POLICY "board_members_select_self" ON worklog_board_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- 같은 보드 멤버 전체 조회는 master 만
DROP POLICY IF EXISTS "board_members_select_master" ON worklog_board_members;
CREATE POLICY "board_members_select_master" ON worklog_board_members
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM worklog_board_members m
      WHERE m.board_id = worklog_board_members.board_id
        AND m.user_id = auth.uid()
        AND m.role = 'master'
    )
  );
-- master 만 INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "board_members_write_master" ON worklog_board_members;
CREATE POLICY "board_members_write_master" ON worklog_board_members
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM worklog_board_members m
      WHERE m.board_id = worklog_board_members.board_id
        AND m.user_id = auth.uid()
        AND m.role = 'master'
    )
  );

COMMIT;


-- ============================================================================
-- STEP 2: 보드 멤버십 시드
-- ============================================================================
-- 그 보드 아래 daily 를 만든 적이 있는 user 는 자동 멤버.
-- app_users.role='master' 인 사람은 보드 master 로 시드 (Q3 디폴트).
BEGIN;

INSERT INTO worklog_board_members (board_id, user_id, role, joined_at)
SELECT DISTINCT
  p.parent_id,
  p.user_id,
  CASE WHEN au.role = 'master' THEN 'master' ELSE 'member' END,
  now()
FROM pages p
LEFT JOIN app_users au ON au.auth_uid = p.user_id
WHERE p.page_type = 'daily'
  AND p.parent_id IS NOT NULL
  AND p.user_id IS NOT NULL
ON CONFLICT (board_id, user_id) DO NOTHING;

COMMIT;

-- 시드 결과 확인
SELECT 'members seeded' AS label, COUNT(*) AS rows FROM worklog_board_members;
SELECT role, COUNT(*) AS rows FROM worklog_board_members GROUP BY role;


-- ============================================================================
-- STEP 3: user-scope 섹션 → board-scope 으로 이전
-- ============================================================================
-- 각 user-scope 섹션의 "기본 보드" = 그 created_by user 가 가장 많이 daily 를 만든 parent_id.
-- 같은 보드에 같은 title 의 섹션이 둘이면 sort_order 가 작은 것을 살리고 나머지 deleted_at 처리 + 자식 row 재매핑.
BEGIN;

-- 3-a. 각 user-scope 섹션에 1차 board_id 매핑
WITH primary_board AS (
  SELECT
    ws.id AS section_id,
    (SELECT p.parent_id
     FROM pages p
     WHERE p.user_id = ws.created_by
       AND p.page_type = 'daily'
       AND p.parent_id IS NOT NULL
     GROUP BY p.parent_id
     ORDER BY COUNT(*) DESC
     LIMIT 1) AS board_id
  FROM worklog_sections ws
  WHERE ws.scope = 'user' AND ws.deleted_at IS NULL
)
UPDATE worklog_sections ws
SET board_id = pb.board_id
FROM primary_board pb
WHERE ws.id = pb.section_id AND pb.board_id IS NOT NULL;

-- 3-b. 보드 매핑이 안 된 user-scope row (그 created_by 가 daily 를 만든 적 없는 경우) 는 일단 그대로.
--      STEP 5 검증에서 잡힘. 운영자가 수동 정리 (지정 or hard delete).

-- 3-c. CHECK constraint 갱신 — 'board' 추가. 'user' 는 STEP 6 에서 제거.
ALTER TABLE worklog_sections
  DROP CONSTRAINT IF EXISTS worklog_sections_scope_check;
ALTER TABLE worklog_sections
  ADD CONSTRAINT worklog_sections_scope_check
  CHECK (scope IN ('global','user','board'));

-- 3-d. board_id 가 채워진 user-scope row 의 scope 를 'board' 로 전환.
UPDATE worklog_sections
SET scope = 'board'
WHERE scope = 'user'
  AND deleted_at IS NULL
  AND board_id IS NOT NULL;

-- 3-e. 보드 내부 중복 (같은 title) 정리
--      같은 board_id 안에서 동명 섹션 둘 이상이면, 가장 오래된 것 (created_at min) 만 살림.
--      나머지는 deleted_at = now() 찍고, daily_blocks 의 section_master_id 를 살아남은 것으로 재매핑.
WITH ranked AS (
  SELECT
    id,
    board_id,
    title,
    ROW_NUMBER() OVER (PARTITION BY board_id, title ORDER BY created_at ASC, id ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY board_id, title ORDER BY created_at ASC, id ASC) AS keep_id
  FROM worklog_sections
  WHERE scope = 'board' AND deleted_at IS NULL
),
duplicates AS (
  SELECT id AS dup_id, keep_id FROM ranked WHERE rn > 1
)
UPDATE daily_blocks db
SET section_master_id = d.keep_id
FROM duplicates d
WHERE db.section_master_id = d.dup_id;

WITH ranked AS (
  SELECT
    id,
    board_id,
    title,
    ROW_NUMBER() OVER (PARTITION BY board_id, title ORDER BY created_at ASC, id ASC) AS rn
  FROM worklog_sections
  WHERE scope = 'board' AND deleted_at IS NULL
)
UPDATE worklog_sections ws
SET deleted_at = now()
FROM ranked r
WHERE ws.id = r.id AND r.rn > 1;

COMMIT;


-- ============================================================================
-- STEP 4: section_order (worklog_user_settings → worklog_board_user_settings)
-- ============================================================================
-- 기존 user 의 section_order 를 그 user 의 기본 보드 (가장 많이 쓴 parent_id) 에 복사.
-- 여러 보드를 쓰는 user 는 기본 보드 외에는 보드별로 직접 다시 정렬해야 함 (UI 에서).
BEGIN;

INSERT INTO worklog_board_user_settings (user_id, board_id, section_order)
SELECT
  s.user_id,
  (SELECT p.parent_id FROM pages p
   WHERE p.user_id = s.user_id
     AND p.page_type = 'daily'
     AND p.parent_id IS NOT NULL
   GROUP BY p.parent_id
   ORDER BY COUNT(*) DESC
   LIMIT 1) AS board_id,
  s.section_order
FROM worklog_user_settings s
WHERE s.section_order IS NOT NULL
ON CONFLICT (user_id, board_id) DO NOTHING;

-- 보드 매핑이 안 된 (그 user 가 daily 를 만든 적 없는) row 는 NULL board_id 가 되어 INSERT 가 막힘.
-- → 그런 user 는 section_order 가 어차피 의미가 없으니 스킵.

COMMIT;


-- ============================================================================
-- STEP 5: 검증 — 각각 실행해서 결과 확인
-- ============================================================================

-- 5-a. user-scope 잔존 (board_id 매핑 실패한 row). 0 이어야 정상. 0 아니면 수동 정리.
SELECT '5-a. unresolved user-scope' AS check,
       COUNT(*) AS rows
FROM worklog_sections
WHERE scope = 'user' AND deleted_at IS NULL;

-- 5-b. board-scope row 인데 board_id 가 NULL — 데이터 오류. 0 이어야 정상.
SELECT '5-b. board scope without board_id' AS check,
       COUNT(*) AS rows
FROM worklog_sections
WHERE scope = 'board' AND board_id IS NULL AND deleted_at IS NULL;

-- 5-c. daily_blocks 의 section_master_id 가 살아있는 마스터로 모두 매칭되는지.
--      orphan 카운트. 5/28 처럼 owner 가 다른 페이지의 카리오버는 이미 page soft-delete 됐으면 잡힘.
SELECT '5-c. orphan section_master_id rows' AS check,
       COUNT(*) AS rows
FROM daily_blocks db
LEFT JOIN worklog_sections ws ON ws.id = db.section_master_id
WHERE db.block_type = 'section'
  AND db.deleted_at IS NULL
  AND ws.id IS NULL;

-- 5-d. 보드별 master 최소 1명 확인. 0 row 면 그 보드는 운영 책임자가 없음.
SELECT '5-d. boards without master' AS check,
       p.id AS board_id, p.name AS board_name
FROM pages p
WHERE p.is_board = true
  AND NOT EXISTS (
    SELECT 1 FROM worklog_board_members m
    WHERE m.board_id = p.id AND m.role = 'master'
  );

-- 5-e. 보드 멤버 수 sanity
SELECT '5-e. board_members_count' AS check,
       COUNT(*) AS rows FROM worklog_board_members;

-- 5-f. board_user_settings 옮긴 row 수
SELECT '5-f. board_user_settings' AS check,
       COUNT(*) AS rows FROM worklog_board_user_settings;


-- ============================================================================
-- STEP 6: 정리 (코드 배포 + 운영 안정 확인 후에만 실행)
-- ============================================================================
-- 이 블록은 createDailyPageV2.js 가 board-scope 로 동작하도록 배포되고,
-- 운영에서 신규 daily 가 정상적으로 board-scope 으로 만들어지는 것을 며칠 관찰한 뒤 실행.
-- 그 전에 실행하면 신규 daily 생성이 막힐 수 있음.
--
-- BEGIN;
--
-- -- 6-a. scope CHECK 에서 'user' 제거
-- ALTER TABLE worklog_sections DROP CONSTRAINT IF EXISTS worklog_sections_scope_check;
-- ALTER TABLE worklog_sections
--   ADD CONSTRAINT worklog_sections_scope_check
--   CHECK (scope IN ('global','board'));
--
-- -- 6-b. 구 worklog_user_settings 폐기
-- DROP TABLE worklog_user_settings;
--
-- COMMIT;
