-- ===================================================
-- 프로젝트/페이지 계층 구조 생성 (Projects > Pages > Blocks)
-- ===================================================

-- 1. projects 테이블 생성
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Project',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. projects 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_position ON projects(user_id, position);

-- 3. projects RLS 정책
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own projects" ON projects;
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- 4. pages 테이블에 project_id 추가
ALTER TABLE pages ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- 5. pages 테이블 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id);

-- 6. 기존 데이터 마이그레이션
-- 기존 pages를 projects로 변환하고, 각 project에 "Main" 페이지 생성
DO $$
DECLARE
  v_page RECORD;
  v_project_id UUID;
  v_new_page_id UUID;
BEGIN
  -- 기존 각 page를 project로 변환
  FOR v_page IN
    SELECT id, user_id, name, position, created_at
    FROM pages
    WHERE project_id IS NULL
  LOOP
    -- 1) 새로운 project 생성 (기존 page 이름 사용)
    INSERT INTO projects (user_id, name, position, created_at)
    VALUES (v_page.user_id, v_page.name, v_page.position, v_page.created_at)
    RETURNING id INTO v_project_id;

    -- 2) 해당 project의 "Main" 페이지 생성
    INSERT INTO pages (user_id, project_id, name, position)
    VALUES (v_page.user_id, v_project_id, 'Main', 0)
    RETURNING id INTO v_new_page_id;

    -- 3) 기존 page의 모든 블록을 새 페이지로 이동
    UPDATE blocks
    SET page_id = v_new_page_id
    WHERE page_id = v_page.id;

    -- 4) 기존 page 삭제
    DELETE FROM pages WHERE id = v_page.id;
  END LOOP;
END $$;

-- 7. pages 테이블의 project_id를 NOT NULL로 설정
-- (마이그레이션 후 모든 pages가 project_id를 가지므로)
ALTER TABLE pages ALTER COLUMN project_id SET NOT NULL;

-- 8. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ Projects/Pages 계층 구조가 생성되었습니다.';
  RAISE NOTICE '   - Projects 테이블 생성됨';
  RAISE NOTICE '   - Pages에 project_id 추가됨';
  RAISE NOTICE '   - 기존 데이터가 마이그레이션됨';
END $$;
