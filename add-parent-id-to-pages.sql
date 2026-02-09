-- 하위 페이지 기능을 위한 parent_id 컬럼 추가
-- parent_id = NULL → 최상위 페이지 (기존 페이지는 모두 자동으로 최상위)
-- ON DELETE CASCADE → DB 레벨에서 부모 삭제 시 자식 자동 삭제

ALTER TABLE pages ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES pages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id);
