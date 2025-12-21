-- ==========================================
-- original_todo_id 컬럼 추가
-- 이월된 투두의 원본을 추적하기 위한 컬럼
-- ==========================================

-- todos 테이블에 original_todo_id 컬럼 추가 (bigint 타입)
ALTER TABLE todos
ADD COLUMN IF NOT EXISTS original_todo_id bigint REFERENCES todos(id) ON DELETE SET NULL;

-- 성능을 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_todos_original_id ON todos(original_todo_id);

-- 컬럼 설명 추가
COMMENT ON COLUMN todos.original_todo_id IS '이월된 투두의 경우, 원본 투두 ID를 추적';
