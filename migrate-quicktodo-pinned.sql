-- Quick Todo 고정 섹션 컬럼 추가
-- 실행 대상: Supabase SQL Editor

ALTER TABLE worklog_user_settings
  ADD COLUMN IF NOT EXISTS quicktodo_pinned jsonb DEFAULT NULL;
-- { "id": "fixed_notice", "name": "전달사항" }
