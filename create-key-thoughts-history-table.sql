-- 주요 생각정리 버전 히스토리 테이블 생성
CREATE TABLE IF NOT EXISTS key_thoughts_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (사용자별 최신 히스토리 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_key_thoughts_history_user_created
ON key_thoughts_history(user_id, created_at DESC);

-- RLS (Row Level Security) 활성화
ALTER TABLE key_thoughts_history ENABLE ROW LEVEL SECURITY;

-- 정책 생성: 사용자는 자신의 히스토리만 관리 가능
CREATE POLICY "Users can manage own history"
  ON key_thoughts_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
