-- user_favorites: 사용자별 즐겨찾기 (user_id + page_id 조합)
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  page_name TEXT,
  project_name TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 같은 사용자가 같은 페이지를 중복 즐겨찾기 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_favorites_unique
  ON user_favorites(user_id, page_id);

-- 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id
  ON user_favorites(user_id);

-- RLS 활성화
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

-- 본인 즐겨찾기만 조회
CREATE POLICY "Users can view own favorites"
  ON user_favorites FOR SELECT
  USING (auth.uid() = user_id);

-- 본인 즐겨찾기만 추가
CREATE POLICY "Users can insert own favorites"
  ON user_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 본인 즐겨찾기만 삭제
CREATE POLICY "Users can delete own favorites"
  ON user_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- 본인 즐겨찾기만 수정 (position 변경 등)
CREATE POLICY "Users can update own favorites"
  ON user_favorites FOR UPDATE
  USING (auth.uid() = user_id);
