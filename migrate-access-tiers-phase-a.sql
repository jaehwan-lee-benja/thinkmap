-- =============================================================================
-- ⚠️ 재실행 순서 의존 — RLS 하드닝 적용 **후**에는 재실행 금지 (2026-08-02 감사)
-- -----------------------------------------------------------------------------
-- 오늘 재실행은 안전하다(라이브 정책과 문자 그대로 일치 = 멱등). 그러나 승인 대기 중인
-- `migrate-rls-harden-unconditional-select.sql`이 적용되면 이 파일은 **되돌리는 파일**이 된다:
--   · 하드닝은 `workspaces_select` / `page_type_access(pta_select)` 를
--     `using(true)` → `is_staff() and can_in_workspace(…)` 로 조인다.
--   · 이 파일은 그 두 정책을 **`using(true)` 로 재생성**한다 ⇒ 하드닝 무효화.
-- ★"ADDITIVE ONLY" 라는 이 파일의 자기 라벨은 **객체 추가 축**에서만 참이다 —
--   정책 축에서는 drop+create 재정의라 additive가 아니다. 라벨을 판정 근거로 쓰지 마라.
-- ★재실행 규칙: 하드닝 적용 후에는 돌리지 말고, 필요하면 하드닝판 술어를 반영해 새로 써라.
-- =============================================================================
-- ACCESS-TIERS Phase A — 권한 등급 모델 토대 (추가 전용 / ADDITIVE ONLY)
-- =============================================================================
-- 합의안: docs/ACCESS-TIERS-SPEC.md
-- 모델  : grant = (주체, 노드[조직>매장>항목], 능력[owner>editor>viewer]) + can()
--
-- ★ 이 파일은 "추가만" 한다. 기존 정책(is_master·shares·pages·linked …)을
--   단 하나도 수정하지 않는다. 따라서 적용 후에도 앱 동작은 100% 동일하다.
--   새 테이블·헬퍼·시드는 만들어지되, 아직 어떤 기존 RLS도 이것에 의존하지 않는다.
--   실제 cutover(기존 정책을 can()으로 교체, shares 이관)는 Phase C(별도, 검증 게이트).
--
-- ★ 적용 절차: supabase-guardian 검수 → 승인 → 통합 세션이 적용. 직접 적용 금지.
-- ★ 재실행 안전(idempotent): IF NOT EXISTS / NOT EXISTS 가드.
-- =============================================================================

-- 단일 조직 워크스페이스의 고정 ID = '11111111-1111-1111-1111-111111111111'.
-- 단일 테넌트 동안 current_workspace()가 이 리터럴을 반환한다(아래 §5).
-- 멀티테넌트 전환 시 current_workspace() 본문만 컨텍스트 기반으로 교체한다.

-- -----------------------------------------------------------------------------
-- 1. workspaces — 테넌트(조직). 1급 테이블.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 현 조직 1개 시드 (사루루팜) — 고정 ID
INSERT INTO workspaces (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', '사루루팜')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. workspace_groups — 워크스페이스 하위 그룹(매장). 오늘은 비어 있음(노드 1개=조직).
--    2호점 생기면 row 추가. 데이터 테이블은 향후 group_id 로 이 노드를 가리킨다.
--    (이름은 'groups' 예약어 근접·PostgREST 충돌 회피용으로 workspace_groups 사용.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workspace_groups_workspace ON workspace_groups(workspace_id);

-- -----------------------------------------------------------------------------
-- 3. grants — 단일 권한 장부 (결정 B). 마스터·멤버·항목공유·linked 가 모두 이 한 표로.
--    scope_type = 'workspace' | 'group' | 'resource'
--    capability = 'owner' | 'editor' | 'viewer'
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,  -- 테넌시 앵커
  scope_type      text NOT NULL CHECK (scope_type IN ('workspace','group','resource')),
  scope_id        uuid NOT NULL,                 -- workspace.id / group.id / 리소스 PK
  resource_kind   text,                          -- scope_type='resource'일 때 'page'|'project'|… (그 외 NULL)
  capability      text NOT NULL CHECK (capability IN ('owner','editor','viewer')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- 워크스페이스 스코프 grant 는 scope_id 가 곧 그 워크스페이스여야 한다(고아 참조 방지).
  -- 테넌트 무관 불변식 — 멀티테넌트에서도 유효.
  CONSTRAINT grants_workspace_scope_chk
    CHECK (scope_type <> 'workspace' OR scope_id = workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_grants_subject   ON grants(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_grants_scope     ON grants(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_grants_workspace ON grants(workspace_id);
-- 한 주체 × 한 스코프에 능력 1개만 (resource_kind NULL은 ''로 정규화해 중복 차단)
CREATE UNIQUE INDEX IF NOT EXISTS uq_grants_subject_scope
  ON grants(subject_user_id, scope_type, scope_id, COALESCE(resource_kind, ''));

-- -----------------------------------------------------------------------------
-- 4. page_type_access — page_type별 권한 규칙(정책=데이터, 결정 가). 단일 출처(SSOT).
--    RLS의 can()과 프론트 게이팅이 둘 다 이 표를 읽는다.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page_type_access (
  page_type        text PRIMARY KEY,
  default_scope    text NOT NULL CHECK (default_scope IN ('workspace','resource')),
  read_capability  text NOT NULL CHECK (read_capability  IN ('owner','editor','viewer')),
  write_capability text NOT NULL CHECK (write_capability IN ('owner','editor','viewer')),
  row_visibility   boolean NOT NULL DEFAULT false,   -- 행단위 visibility 가림 지원 여부
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 현 규칙 시드 — 실제 page_type(pages_page_type_chk 허용값)과 1:1 대응.
-- ★ 'goal'(개인 목표 *페이지*, 패러다임 A, migrate-pages-allow-goal.sql)과
--   'goals'(마스터 전용 *데이터 테이블*, dashboard 로 진입)는 다른 것이다.
--   'goals'는 page_type 이 아니므로 이 표에 넣지 않는다(데이터 테이블 RLS는 별도).
INSERT INTO page_type_access (page_type, default_scope, read_capability, write_capability, row_visibility) VALUES
  ('normal',    'resource',  'viewer', 'editor', false),
  ('goal',      'resource',  'viewer', 'editor', false),  -- 개인 목표 페이지(소유자 기반)
  ('calendar',  'workspace', 'viewer', 'editor', true),   -- 업무일지
  ('daily',     'workspace', 'viewer', 'editor', true),
  ('schedule',  'resource',  'viewer', 'editor', false),  -- 실제 캘린더(개인 소유 + 공유)
  ('members',   'workspace', 'viewer', 'owner', false),   -- 기본정보 열람 공개 / 마스터 편집
  ('payroll',   'workspace', 'owner',  'owner', false),
  ('dashboard', 'workspace', 'owner',  'owner', false),   -- goals 데이터 진입(마스터 전용)
  ('frame',     'workspace', 'owner',  'owner', false),   -- 캔버스(마스터 전용)
  ('engine',    'workspace', 'owner',  'owner', false)
ON CONFLICT (page_type) DO NOTHING;

-- =============================================================================
-- 5. 헬퍼 — can() 와 부속. 전부 SECURITY DEFINER STABLE (RLS 재귀 회피·캐시).
--    ★ 아직 어떤 기존 정책도 이 함수를 호출하지 않는다(Phase C에서 위임).
-- =============================================================================

-- 능력 서열: owner(3) > editor(2) > viewer(1)
CREATE OR REPLACE FUNCTION access_rank(p_cap text)
RETURNS int AS $$
  SELECT CASE p_cap WHEN 'owner' THEN 3 WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END;
$$ LANGUAGE SQL IMMUTABLE;

-- 단일 테넌트 동안 "현재 워크스페이스" = 조직 1개. (멀티테넌트 시 본문 교체 지점)
CREATE OR REPLACE FUNCTION current_workspace()
RETURNS uuid AS $$
  SELECT '11111111-1111-1111-1111-111111111111'::uuid;
$$ LANGUAGE SQL STABLE
SET search_path = public;

-- 핵심 판정: 현재 사용자가 (워크스페이스 또는 그 리소스)에 대해 필요능력 이상을 가졌나?
--   상위 노드(워크스페이스/그룹) grant 가 하위를 모두 덮는다(계층).
CREATE OR REPLACE FUNCTION access_can(
  p_workspace     uuid,
  p_resource_kind text,   -- 리소스 단위 검사 시 종류, 워크스페이스 단위면 NULL
  p_resource_id   uuid,   -- 리소스 단위 검사 시 PK,  워크스페이스 단위면 NULL
  p_need          text    -- 'owner' | 'editor' | 'viewer'
) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM grants g
    WHERE g.subject_user_id = auth.uid()
      AND access_rank(g.capability) >= access_rank(p_need)
      AND (
        -- 워크스페이스 전체 grant 는 그 안의 모든 것을 덮음
        (g.scope_type = 'workspace' AND g.scope_id = p_workspace)
        -- (그룹 grant 는 향후 group_id 연결 후 추가)
        -- 해당 리소스에 직접 걸린 grant
        OR (p_resource_id IS NOT NULL
            AND g.scope_type = 'resource'
            AND g.scope_id = p_resource_id
            AND (g.resource_kind = p_resource_kind OR g.resource_kind IS NULL))
      )
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public;

-- 워크스페이스 단위 단축형
CREATE OR REPLACE FUNCTION can_in_workspace(p_workspace uuid, p_need text)
RETURNS boolean AS $$
  SELECT access_can(p_workspace, NULL, NULL, p_need);
$$ LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public;

-- =============================================================================
-- 6. 시드 — 현 멤버십을 grants 로 미러링 (현 상태를 그대로 반영, 신규 권한 부여 아님)
--    · app_users.role='master'  → (워크스페이스, owner)
--    · 그 외 active 사용자        → (워크스페이스, editor)
--    · linked_accounts editor 주계정 → (워크스페이스, editor)  (rlawldus0621 등)
--    auth.users 에 로그인 이력이 있는 계정만(주체는 실제 로그인 계정).
--    · status='active' 만 포함. 'pending'/'invited'/'inactive' = grant 없음(기본 deny,
--      SPEC §3 일치). 활성화(승인) 시점에 grant 부여하는 흐름은 Phase C/앱에서 연결.
--    ★ 이 시드는 "장부에 적기만" 한다. 기존 RLS 가 grants 를 안 읽으므로 접근은 안 변한다.
-- =============================================================================

-- 6-1. app_users 기반 멤버십
INSERT INTO grants (subject_user_id, workspace_id, scope_type, scope_id, capability)
SELECT u.id,
       current_workspace(),
       'workspace',
       current_workspace(),
       CASE WHEN au.role = 'master' THEN 'owner' ELSE 'editor' END
FROM app_users au
JOIN auth.users u ON LOWER(u.email) = LOWER(au.email)
WHERE au.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM grants g
    WHERE g.subject_user_id = u.id
      AND g.scope_type = 'workspace'
      AND g.scope_id = current_workspace()
  );

-- 6-2. linked_accounts editor 주계정(app_users 로 안 잡힌 경우 보강)
--      예: rlawldus0621 → partner editor. 주계정이 워크스페이스 편집자가 되게.
--      (partner 의 *개별 데이터* 동등 접근은 §11 데이터 귀속 결정 후 Phase C에서 확정.
--       그 전까지 linked 경로는 그대로 유지 = 무중단.)
INSERT INTO grants (subject_user_id, workspace_id, scope_type, scope_id, capability)
SELECT DISTINCT u.id, current_workspace(), 'workspace', current_workspace(), 'editor'
FROM linked_accounts la
JOIN auth.users u ON LOWER(u.email) = LOWER(la.primary_email)
WHERE la.permission = 'editor'
  AND NOT EXISTS (
    SELECT 1 FROM grants g
    WHERE g.subject_user_id = u.id
      AND g.scope_type = 'workspace'
      AND g.scope_id = current_workspace()
  );

-- =============================================================================
-- 7. 새 테이블 RLS — 새 테이블 자신은 보호한다(추가 전용 원칙은 "기존" 정책 한정).
--    쓰기는 마스터만(기존 is_master() 사용 — 재귀 없음: is_master 는 app_users 만 읽음).
-- =============================================================================
ALTER TABLE workspaces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_type_access ENABLE ROW LEVEL SECURITY;

-- workspaces: 로그인 사용자 열람 / 마스터만 관리
DROP POLICY IF EXISTS workspaces_select ON workspaces;
CREATE POLICY workspaces_select ON workspaces FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS workspaces_write ON workspaces;
CREATE POLICY workspaces_write ON workspaces FOR ALL TO authenticated
  USING (is_master()) WITH CHECK (is_master());

-- workspace_groups: 로그인 사용자 열람 / 마스터만 관리
DROP POLICY IF EXISTS workspace_groups_select ON workspace_groups;
CREATE POLICY workspace_groups_select ON workspace_groups FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS workspace_groups_write ON workspace_groups;
CREATE POLICY workspace_groups_write ON workspace_groups FOR ALL TO authenticated
  USING (is_master()) WITH CHECK (is_master());

-- grants: 본인 grant + 마스터는 전체 열람 / 마스터만 관리
--   (Phase C에서 "스코프 owner 도 관리"로 확장 가능 — access_can 은 DEFINER라 재귀 없음)
DROP POLICY IF EXISTS grants_select ON grants;
CREATE POLICY grants_select ON grants FOR SELECT TO authenticated
  USING (subject_user_id = auth.uid() OR is_master());
DROP POLICY IF EXISTS grants_write ON grants;
CREATE POLICY grants_write ON grants FOR ALL TO authenticated
  USING (is_master()) WITH CHECK (is_master());

-- page_type_access: 정책 메타데이터 — 로그인 열람 / 마스터만 관리
DROP POLICY IF EXISTS pta_select ON page_type_access;
CREATE POLICY pta_select ON page_type_access FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pta_write ON page_type_access;
CREATE POLICY pta_write ON page_type_access FOR ALL TO authenticated
  USING (is_master()) WITH CHECK (is_master());

-- =============================================================================
-- 완료. 이 시점에서: 새 테이블/헬퍼/시드 존재. 기존 동작 변화 0.
-- 다음(Phase C, 별도 파일, 검증 게이트): is_master() shim 화 + shares→grants 이관
--   + pages/daily/payroll … 정책을 can()으로 점진 위임. docs/ACCESS-TIERS-MIGRATION-PLAN.md
-- =============================================================================
DO $$ BEGIN
  RAISE NOTICE '✅ ACCESS-TIERS Phase A 적용: workspaces/workspace_groups/grants/page_type_access + can() 생성. 기존 정책 무변경.';
END $$;
