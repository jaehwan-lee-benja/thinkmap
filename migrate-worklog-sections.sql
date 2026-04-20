-- 업무일지 섹션 정의 테이블
-- 고정/pinned 섹션의 ID를 중앙 관리하여 이월 시 섹션 매칭에 사용

CREATE TABLE IF NOT EXISTS worklog_sections (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  section_type  text NOT NULL DEFAULT 'fixed',   -- 'fixed' | 'pinned'
  is_default    boolean NOT NULL DEFAULT true,    -- 새 daily 생성 시 자동 포함
  sort_order    int NOT NULL DEFAULT 0,           -- 템플릿 내 배치 순서
  visibility    text NOT NULL DEFAULT 'all',      -- 'all' | 'master'
  parent_id     text REFERENCES worklog_sections(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 고정 섹션 시드 데이터
INSERT INTO worklog_sections (id, title, section_type, is_default, sort_order, visibility, parent_id) VALUES
  ('fixed_todo',        '할 일',      'fixed', true, 1, 'all', NULL),
  ('fixed_notice',      '전달사항',    'fixed', true, 2, 'all', NULL),
  ('fixed_wrapup',      '마무리 기록', 'fixed', true, 3, 'all', NULL),
  ('fixed_daily_issue', '당일 이슈',   'fixed', true, 4, 'all', 'fixed_wrapup')
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE worklog_sections ENABLE ROW LEVEL SECURITY;

-- 모든 인증 유저가 조회 가능
CREATE POLICY "worklog_sections_select" ON worklog_sections
  FOR SELECT TO authenticated USING (true);

-- pinned 섹션은 본인만 생성/수정/삭제
CREATE POLICY "worklog_sections_insert" ON worklog_sections
  FOR INSERT TO authenticated WITH CHECK (section_type = 'pinned' AND created_by = auth.uid());

CREATE POLICY "worklog_sections_update" ON worklog_sections
  FOR UPDATE TO authenticated USING (section_type = 'pinned' AND created_by = auth.uid());

CREATE POLICY "worklog_sections_delete" ON worklog_sections
  FOR DELETE TO authenticated USING (section_type = 'pinned' AND created_by = auth.uid());
