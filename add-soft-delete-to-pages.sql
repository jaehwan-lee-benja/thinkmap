-- 페이지 soft-delete: 실제 삭제 대신 deleted_at 타임스탬프로 휴지통 관리
-- deleted_at IS NULL → 활성 페이지, deleted_at IS NOT NULL → 삭제된 페이지
ALTER TABLE pages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_pages_deleted_at ON pages(deleted_at) WHERE deleted_at IS NOT NULL;
