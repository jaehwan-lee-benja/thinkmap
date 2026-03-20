-- pages 테이블에 양식 관련 컬럼 추가
ALTER TABLE pages ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES page_templates(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS template_version INT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS sections_content JSONB;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS template_forked BOOLEAN DEFAULT FALSE;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_pages_template_id
  ON pages(template_id);
