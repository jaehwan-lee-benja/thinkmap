-- 격려 메시지 테이블 생성
CREATE TABLE IF NOT EXISTS encouragement_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  order_index INTEGER DEFAULT 0
);

-- 기본 격려 메시지 추가
INSERT INTO encouragement_messages (message, order_index) VALUES
  ('오늘도 파이팅! 💪', 1),
  ('할 수 있어요! ✨', 2),
  ('한 걸음씩 천천히 🚶', 3),
  ('오늘도 응원해요! 🎉', 4),
  ('멋진 하루 되세요! ⭐', 5),
  ('화이팅입니다! 🔥', 6);

-- 인덱스 생성 (순서 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_encouragement_messages_order ON encouragement_messages(order_index);

-- RLS (Row Level Security) 설정
ALTER TABLE encouragement_messages ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽을 수 있도록 정책 생성
CREATE POLICY "Anyone can read encouragement messages"
  ON encouragement_messages FOR SELECT
  USING (true);

-- 모든 사용자가 추가할 수 있도록 정책 생성
CREATE POLICY "Anyone can insert encouragement messages"
  ON encouragement_messages FOR INSERT
  WITH CHECK (true);

-- 모든 사용자가 수정할 수 있도록 정책 생성
CREATE POLICY "Anyone can update encouragement messages"
  ON encouragement_messages FOR UPDATE
  USING (true);

-- 모든 사용자가 삭제할 수 있도록 정책 생성
CREATE POLICY "Anyone can delete encouragement messages"
  ON encouragement_messages FOR DELETE
  USING (true);
