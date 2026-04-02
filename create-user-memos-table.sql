-- ===================================================
-- 사용자 메모 테이블
-- 각 사용자당 하나의 간단 메모를 저장
-- ===================================================

-- 1. user_memos 테이블 생성
CREATE TABLE IF NOT EXISTS user_memos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_user_memos_user_id ON user_memos(user_id);

-- 3. RLS 정책
ALTER TABLE user_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own memos" ON user_memos;
CREATE POLICY "Users can view own memos"
  ON user_memos FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own memos" ON user_memos;
CREATE POLICY "Users can insert own memos"
  ON user_memos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own memos" ON user_memos;
CREATE POLICY "Users can update own memos"
  ON user_memos FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own memos" ON user_memos;
CREATE POLICY "Users can delete own memos"
  ON user_memos FOR DELETE
  USING (auth.uid() = user_id);

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_user_memos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_memos_updated_at ON user_memos;
CREATE TRIGGER trigger_update_user_memos_updated_at
  BEFORE UPDATE ON user_memos
  FOR EACH ROW
  EXECUTE FUNCTION update_user_memos_updated_at();

-- 5. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE 'user_memos 테이블이 생성되었습니다.';
END $$;
