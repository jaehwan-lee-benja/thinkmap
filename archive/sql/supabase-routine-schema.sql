-- 루틴 테이블 생성
CREATE TABLE IF NOT EXISTS routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  days JSONB NOT NULL DEFAULT '[]', -- ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- todos 테이블에 routine_id 컬럼 추가
ALTER TABLE todos
ADD COLUMN IF NOT EXISTS routine_id UUID REFERENCES routines(id) ON DELETE SET NULL;

-- 인덱스 추가 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_routines_deleted ON routines(deleted);
CREATE INDEX IF NOT EXISTS idx_todos_routine_id ON todos(routine_id);

-- RLS (Row Level Security) 활성화
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽고 쓸 수 있도록 정책 설정 (개발용)
CREATE POLICY "Enable all access for routines" ON routines
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE routines IS '요일별 반복 루틴 템플릿을 저장하는 테이블';
COMMENT ON COLUMN routines.days IS '루틴이 반복될 요일 배열 (예: ["mon", "wed", "fri"])';
COMMENT ON COLUMN todos.routine_id IS '이 작업이 어떤 루틴에서 생성되었는지 추적';
