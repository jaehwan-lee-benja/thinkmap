-- page_templates: 재사용 가능한 페이지 양식 정의
CREATE TABLE IF NOT EXISTS page_templates (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sections        JSONB NOT NULL DEFAULT '[]',
  version         INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- page_template_versions: 양식 버전 이력 (이후부터 적용 옵션용)
CREATE TABLE IF NOT EXISTS page_template_versions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id     UUID NOT NULL REFERENCES page_templates(id) ON DELETE CASCADE,
  version         INT NOT NULL,
  sections        JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_versions_unique
  ON page_template_versions(template_id, version);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_page_templates_user_id
  ON page_templates(user_id);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_id
  ON page_template_versions(template_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_page_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_page_templates_updated_at
  BEFORE UPDATE ON page_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_page_templates_updated_at();

-- RLS
ALTER TABLE page_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_template_versions ENABLE ROW LEVEL SECURITY;

-- page_templates RLS
CREATE POLICY "Users can view own templates"
  ON page_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON page_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON page_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON page_templates FOR DELETE
  USING (auth.uid() = user_id);

-- page_template_versions RLS (템플릿 소유자만 접근)
CREATE POLICY "Users can view own template versions"
  ON page_template_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM page_templates
      WHERE page_templates.id = page_template_versions.template_id
        AND page_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own template versions"
  ON page_template_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM page_templates
      WHERE page_templates.id = page_template_versions.template_id
        AND page_templates.user_id = auth.uid()
    )
  );
