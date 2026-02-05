-- ===================================================
-- 프로젝트 백업 테이블
-- ===================================================

-- 1. backups 테이블 생성
CREATE TABLE IF NOT EXISTS backups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  backup_data JSONB NOT NULL, -- 페이지와 블록 데이터
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_backups_user_id ON backups(user_id);
CREATE INDEX IF NOT EXISTS idx_backups_project_id ON backups(project_id);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);

-- 3. RLS 정책
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own backups" ON backups;
CREATE POLICY "Users can view own backups"
  ON backups FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own backups" ON backups;
CREATE POLICY "Users can insert own backups"
  ON backups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own backups" ON backups;
CREATE POLICY "Users can delete own backups"
  ON backups FOR DELETE
  USING (auth.uid() = user_id);

-- 4. 프로젝트당 백업 개수 제한 함수 (최대 10개 유지)
CREATE OR REPLACE FUNCTION limit_backups_per_project()
RETURNS TRIGGER AS $$
BEGIN
  -- 해당 프로젝트의 백업이 10개를 초과하면 가장 오래된 것 삭제
  DELETE FROM backups
  WHERE id IN (
    SELECT id FROM backups
    WHERE user_id = NEW.user_id AND project_id = NEW.project_id
    ORDER BY created_at DESC
    OFFSET 10
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. 트리거 생성
DROP TRIGGER IF EXISTS trigger_limit_backups ON backups;
CREATE TRIGGER trigger_limit_backups
  AFTER INSERT ON backups
  FOR EACH ROW
  EXECUTE FUNCTION limit_backups_per_project();

-- 6. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE 'backups 테이블이 생성되었습니다.';
END $$;
