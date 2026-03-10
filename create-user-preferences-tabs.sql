-- ===================================================
-- user_preferences 테이블에 탭 기능 컬럼 추가
-- ===================================================

-- 탭 배열 (JSONB): 각 탭의 프로젝트/페이지/임퍼소네이션 상태
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS tabs JSONB DEFAULT NULL;

-- 활성 탭 ID
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS active_tab_id TEXT DEFAULT NULL;

-- 완료 메시지
DO $$
BEGIN
  RAISE NOTICE 'user_preferences 테이블에 tabs, active_tab_id 컬럼이 추가되었습니다.';
END $$;
