-- ══════════════════════════════════════════════════════════════════════════
-- 자리후(seat) — seat_workspace_prefs : 워크스페이스(매장) 귀속 표 설정(우선 = 열 너비)
-- ══════════════════════════════════════════════════════════════════════════
-- 목적: 열 너비 조절값을 **워크스페이스(매장) 귀속** 으로 저장(유저 확정 2026-08-01).
--   운영: 자리후 태블릿은 마스터 계정들 또는 스토어 공용 계정(sarurufarm.partner)으로 로그인 →
--   ★어느 계정으로 들어와도 그 매장의 **같은 기준치(열 너비)** 를 본다.
--   ※ 계정(user_id) 귀속이 아니라 워크스페이스 귀속 — seat_orders 등과 동일한 테넌시(can_in_workspace).
--   ※ prefs jsonb 한 컬럼 — 나중에 다른 워크스페이스 표 설정을 추가해도 마이그 재발 없음.
--     현재 담는 것: { "columnWidths": { "landscape": {...}, "portrait": {...} } }.
--     (hiddenColumns·cameraEnabled 는 태블릿마다 역할이 달라 계속 기기별 localStorage 유지.)
--
-- ★안전성:
--   - 신규 테이블(additive) — 기존 객체 무변, 회귀 0.
--   - RLS: seat_orders_rw 와 동일 패턴 — can_in_workspace(workspace_id,'editor') READ/WRITE.
--     자리후 4역할은 editor grant 보유 → 정상 접근. 타 워크스페이스·비인가 접근 불가.
--   - 저장 RPC(seat_save_workspace_prefs): current_workspace() 로 upsert. SECURITY INVOKER →
--     호출자 권한/RLS 그대로 적용(우회 없음). 앱이 workspace_id 를 직접 안 보내도 서버가 결정.
--   - GRANT: authenticated 에 SELECT/INSERT/UPDATE(anon 제외). 함수 EXECUTE authenticated.
--   - updated_at: 기존 함수 seat_touch_updated_at() 재사용. Realtime 미등록(설정, 실시간 불요).
--   - 재실행 안전: IF NOT EXISTS / DROP POLICY|TRIGGER IF EXISTS / CREATE OR REPLACE.
--
-- 적용: supabase-guardian 검수 → 유저 최종승인 → thinkmap 통합세션 적용(tmseat 직접적용 금지).
--       ★운영순서 무관: 테이블 부재 시 앱은 조용히 localStorage 폴백(에러 없음).
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS seat_workspace_prefs (
  workspace_id uuid PRIMARY KEY DEFAULT current_workspace(),
  prefs        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE seat_workspace_prefs IS
  '자리후 워크스페이스(매장) 귀속 표 설정. prefs.columnWidths = 열 너비(landscape/portrait). 매장 내 모든 계정이 공유.';

ALTER TABLE seat_workspace_prefs ENABLE ROW LEVEL SECURITY;

-- seat_orders 와 동일 테넌시: 그 워크스페이스 editor 만 읽고 쓴다.
DROP POLICY IF EXISTS seat_workspace_prefs_rw ON seat_workspace_prefs;
CREATE POLICY seat_workspace_prefs_rw ON seat_workspace_prefs
  FOR ALL
  USING (can_in_workspace(workspace_id, 'editor'))
  WITH CHECK (can_in_workspace(workspace_id, 'editor'));

-- updated_at 자동 갱신(기존 함수 재사용).
DROP TRIGGER IF EXISTS trg_seat_workspace_prefs_touch ON seat_workspace_prefs;
CREATE TRIGGER trg_seat_workspace_prefs_touch
  BEFORE UPDATE ON seat_workspace_prefs
  FOR EACH ROW EXECUTE FUNCTION seat_touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON seat_workspace_prefs TO authenticated;

-- 저장 RPC: 앱은 workspace_id 를 모르므로 서버가 current_workspace() 로 upsert.
-- SECURITY INVOKER → 호출자의 RLS(can_in_workspace) 가 그대로 적용된다(권한 우회 없음).
CREATE OR REPLACE FUNCTION seat_save_workspace_prefs(p_prefs jsonb)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public   -- 위생: 프로젝트 관례(향후 DEFINER 전환 시 실수 방지)
AS $$
  -- shallow merge(||): 기존 prefs 위에 p_prefs 키만 덮어씀 → 나중에 다른 설정을 추가해도
  -- 서로의 값이 통째로 날아가지 않는다(현재 유일 키 columnWidths 에선 결과 동일).
  INSERT INTO seat_workspace_prefs (workspace_id, prefs)
  VALUES (current_workspace(), p_prefs)
  ON CONFLICT (workspace_id) DO UPDATE SET prefs = seat_workspace_prefs.prefs || EXCLUDED.prefs;
$$;

GRANT EXECUTE ON FUNCTION seat_save_workspace_prefs(jsonb) TO authenticated;
