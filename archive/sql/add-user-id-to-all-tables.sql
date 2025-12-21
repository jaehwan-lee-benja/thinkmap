-- 모든 테이블에 user_id 컬럼 추가 및 RLS 설정
-- Google 로그인 구현을 위한 마이그레이션 SQL

-- 1. todos 테이블에 user_id 추가
ALTER TABLE todos ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. routines 테이블에 user_id 추가
ALTER TABLE routines ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. todo_history 테이블에 user_id 추가 (있다면)
ALTER TABLE todo_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 4. spec_memos 테이블에 user_id 추가
ALTER TABLE spec_memos ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 5. encouragement_messages 테이블에 user_id 추가
ALTER TABLE encouragement_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 6. key_thoughts_history 테이블에 user_id 추가
ALTER TABLE key_thoughts_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 7. user_settings 테이블에 user_id 추가
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 인덱스 생성 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_routines_user_id ON routines(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_history_user_id ON todo_history(user_id);
CREATE INDEX IF NOT EXISTS idx_spec_memos_user_id ON spec_memos(user_id);
CREATE INDEX IF NOT EXISTS idx_encouragement_messages_user_id ON encouragement_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_key_thoughts_history_user_id ON key_thoughts_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
