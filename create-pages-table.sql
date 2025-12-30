-- Pages 테이블 생성 (프로젝트/페이지 단위 관리)
CREATE TABLE IF NOT EXISTS pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책 설정
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- 본인의 페이지만 조회
CREATE POLICY "Users can view own pages"
  ON pages FOR SELECT
  USING (auth.uid() = user_id);

-- 본인의 페이지만 삽입
CREATE POLICY "Users can insert own pages"
  ON pages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 본인의 페이지만 업데이트
CREATE POLICY "Users can update own pages"
  ON pages FOR UPDATE
  USING (auth.uid() = user_id);

-- 본인의 페이지만 삭제
CREATE POLICY "Users can delete own pages"
  ON pages FOR DELETE
  USING (auth.uid() = user_id);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_pages_user_id ON pages(user_id);
CREATE INDEX IF NOT EXISTS idx_pages_position ON pages(user_id, position);

-- blocks 테이블에 page_id 추가
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS page_id UUID REFERENCES pages(id) ON DELETE CASCADE;

-- page_id 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_blocks_page_id ON blocks(page_id);
CREATE INDEX IF NOT EXISTS idx_blocks_user_page ON blocks(user_id, page_id);

-- 기존 블록들을 위한 기본 페이지 생성 및 연결
DO $$
DECLARE
  v_user_id UUID;
  v_page_id UUID;
BEGIN
  -- 기존 블록이 있는 모든 사용자에 대해
  FOR v_user_id IN
    SELECT DISTINCT user_id FROM blocks WHERE page_id IS NULL
  LOOP
    -- 기본 페이지 생성
    INSERT INTO pages (user_id, name, position)
    VALUES (v_user_id, 'Main', 0)
    RETURNING id INTO v_page_id;

    -- 해당 사용자의 모든 블록을 기본 페이지에 연결
    UPDATE blocks
    SET page_id = v_page_id
    WHERE user_id = v_user_id AND page_id IS NULL;
  END LOOP;
END $$;

-- 향후 page_id를 NOT NULL로 변경하려면 (선택사항):
-- ALTER TABLE blocks ALTER COLUMN page_id SET NOT NULL;

-- 업데이트 트리거 (updated_at 자동 갱신)
CREATE OR REPLACE FUNCTION update_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION update_pages_updated_at();
