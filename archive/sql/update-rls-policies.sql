-- RLS 정책 업데이트 - 사용자별 데이터 분리
-- 각 사용자는 자신의 데이터만 조회/수정/삭제 가능

-- ========== todos 테이블 ==========
-- 기존 정책 삭제
DROP POLICY IF EXISTS "Anyone can read todos" ON todos;
DROP POLICY IF EXISTS "Anyone can insert todos" ON todos;
DROP POLICY IF EXISTS "Anyone can update todos" ON todos;
DROP POLICY IF EXISTS "Anyone can delete todos" ON todos;
DROP POLICY IF EXISTS "Enable all access for all users" ON todos;

-- 새로운 정책 생성
CREATE POLICY "Users can read own todos"
  ON todos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own todos"
  ON todos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own todos"
  ON todos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own todos"
  ON todos FOR DELETE
  USING (auth.uid() = user_id);

-- ========== routines 테이블 ==========
DROP POLICY IF EXISTS "Enable all access for all users" ON routines;

CREATE POLICY "Users can read own routines"
  ON routines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own routines"
  ON routines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routines"
  ON routines FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routines"
  ON routines FOR DELETE
  USING (auth.uid() = user_id);

-- ========== todo_history 테이블 ==========
DROP POLICY IF EXISTS "Enable all access for all users" ON todo_history;

CREATE POLICY "Users can read own todo_history"
  ON todo_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own todo_history"
  ON todo_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own todo_history"
  ON todo_history FOR DELETE
  USING (auth.uid() = user_id);

-- ========== spec_memos 테이블 ==========
DROP POLICY IF EXISTS "Anyone can read spec memos" ON spec_memos;
DROP POLICY IF EXISTS "Anyone can insert spec memos" ON spec_memos;
DROP POLICY IF EXISTS "Anyone can update spec memos" ON spec_memos;
DROP POLICY IF EXISTS "Anyone can delete spec memos" ON spec_memos;

CREATE POLICY "Users can read own spec_memos"
  ON spec_memos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own spec_memos"
  ON spec_memos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own spec_memos"
  ON spec_memos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own spec_memos"
  ON spec_memos FOR DELETE
  USING (auth.uid() = user_id);

-- ========== encouragement_messages 테이블 ==========
DROP POLICY IF EXISTS "Anyone can read encouragement messages" ON encouragement_messages;
DROP POLICY IF EXISTS "Anyone can insert encouragement messages" ON encouragement_messages;
DROP POLICY IF EXISTS "Anyone can update encouragement messages" ON encouragement_messages;
DROP POLICY IF EXISTS "Anyone can delete encouragement messages" ON encouragement_messages;

CREATE POLICY "Users can read own encouragement_messages"
  ON encouragement_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own encouragement_messages"
  ON encouragement_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own encouragement_messages"
  ON encouragement_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own encouragement_messages"
  ON encouragement_messages FOR DELETE
  USING (auth.uid() = user_id);

-- ========== key_thoughts_history 테이블 ==========
DROP POLICY IF EXISTS "Enable all access for all users" ON key_thoughts_history;

CREATE POLICY "Users can read own key_thoughts_history"
  ON key_thoughts_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own key_thoughts_history"
  ON key_thoughts_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own key_thoughts_history"
  ON key_thoughts_history FOR DELETE
  USING (auth.uid() = user_id);

-- ========== user_settings 테이블 ==========
DROP POLICY IF EXISTS "Anyone can read user settings" ON user_settings;
DROP POLICY IF EXISTS "Anyone can insert user settings" ON user_settings;
DROP POLICY IF EXISTS "Anyone can update user settings" ON user_settings;
DROP POLICY IF EXISTS "Anyone can delete user settings" ON user_settings;

CREATE POLICY "Users can read own user_settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own user_settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own user_settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own user_settings"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id);
