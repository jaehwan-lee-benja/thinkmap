-- user_settings 테이블 생성
-- 사용자별 설정을 key-value 형태로 저장

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, setting_key)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_user_settings_user_key
ON user_settings(user_id, setting_key);

-- RLS (Row Level Security) 활성화
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 정책 생성: 사용자는 자신의 설정만 관리 가능
CREATE POLICY "Users can manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
