-- key_thoughts 테이블 생성
-- 주요 생각정리 저장을 위한 테이블

CREATE TABLE IF NOT EXISTS key_thoughts (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 업데이트 시간 자동 갱신을 위한 트리거
CREATE OR REPLACE FUNCTION update_key_thoughts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER key_thoughts_updated_at_trigger
  BEFORE UPDATE ON key_thoughts
  FOR EACH ROW
  EXECUTE FUNCTION update_key_thoughts_updated_at();

-- 초기 기본 데이터 삽입
INSERT INTO key_thoughts (content)
VALUES ('# 주요 생각정리

여기에 중요한 생각들을 자유롭게 정리하세요.

## 📌 핵심 아이디어

- 첫 번째 아이디어
- 두 번째 아이디어

## 💡 인사이트

작성 예정...')
ON CONFLICT DO NOTHING;

-- RLS (Row Level Security) 활성화
ALTER TABLE key_thoughts ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽고 쓸 수 있도록 정책 설정
CREATE POLICY "Enable all access for key_thoughts" ON key_thoughts
FOR ALL USING (true) WITH CHECK (true);
