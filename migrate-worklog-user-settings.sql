-- 업무일지 계정별 설정 테이블
-- 섹션 순서 등 계정별 업무일지 환경설정 저장

CREATE TABLE IF NOT EXISTS worklog_user_settings (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  section_order  jsonb DEFAULT '[]',   -- ["fixed_notice", "fixed_todo", ...] (worklog_sections.id 배열)
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE worklog_user_settings ENABLE ROW LEVEL SECURITY;

-- 본인 설정만 조회/생성/수정
CREATE POLICY "worklog_user_settings_select" ON worklog_user_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "worklog_user_settings_insert" ON worklog_user_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "worklog_user_settings_update" ON worklog_user_settings
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
