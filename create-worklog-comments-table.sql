-- ===================================================
-- 업무일지 코멘트 테이블 및 RLS 정책
-- ===================================================

-- 1. worklog_comments 테이블 생성
CREATE TABLE IF NOT EXISTS worklog_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 코멘트 위치
  target_type TEXT NOT NULL DEFAULT 'page' CHECK (target_type IN ('section', 'todo', 'page')),
  target_id TEXT,

  -- 내용
  content TEXT NOT NULL,
  mentions JSONB DEFAULT '[]',

  -- 상태
  resolved BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_worklog_comments_page ON worklog_comments(page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worklog_comments_user ON worklog_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_worklog_comments_mentions ON worklog_comments USING GIN(mentions);

-- 3. RLS 정책
ALTER TABLE worklog_comments ENABLE ROW LEVEL SECURITY;

-- 같은 프로젝트 멤버는 코멘트 조회 가능
-- (page → project 경로로 접근 확인)
DROP POLICY IF EXISTS "Project members can view comments" ON worklog_comments;
CREATE POLICY "Project members can view comments"
  ON worklog_comments FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM pages p
      WHERE p.id = worklog_comments.page_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM shares s
            WHERE s.resource_type = 'project'
              AND s.resource_id = p.project_id
              AND s.shared_with_user_id = auth.uid()
          )
        )
    )
  );

-- 본인 코멘트 작성 (마스터 bypass 포함)
DROP POLICY IF EXISTS "Users can insert own comments" ON worklog_comments;
CREATE POLICY "Users can insert own comments"
  ON worklog_comments FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

-- 본인 코멘트 수정 (마스터 bypass 포함)
DROP POLICY IF EXISTS "Users can update own comments" ON worklog_comments;
CREATE POLICY "Users can update own comments"
  ON worklog_comments FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

-- 본인 코멘트 삭제 (마스터 bypass 포함)
DROP POLICY IF EXISTS "Users can delete own comments" ON worklog_comments;
CREATE POLICY "Users can delete own comments"
  ON worklog_comments FOR DELETE
  USING (
    auth.jwt() ->> 'email' = 'designerbenja@gmail.com'
    OR auth.uid() = user_id
  );

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_worklog_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_worklog_comments_updated_at ON worklog_comments;
CREATE TRIGGER set_worklog_comments_updated_at
  BEFORE UPDATE ON worklog_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_worklog_comments_updated_at();
