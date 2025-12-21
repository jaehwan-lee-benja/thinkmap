-- 기존 데이터를 designerbenja@gmail.com 계정에 귀속
-- 이 SQL은 designerbenja@gmail.com이 Google 로그인한 후에 실행해야 합니다

-- 사용자 UUID 찾기 (designerbenja@gmail.com)
-- ⚠️ 먼저 designerbenja@gmail.com으로 Google 로그인을 한 번 해야 합니다!
-- ⚠️ 로그인 후 Supabase Dashboard > Authentication > Users에서 해당 사용자의 UUID를 확인하세요

-- 방법 1: 이메일로 UUID 조회 (auth.users 테이블 접근 가능한 경우)
DO $$
DECLARE
  target_user_id UUID;
BEGIN
  -- designerbenja@gmail.com의 UUID 찾기
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = 'designerbenja@gmail.com'
  LIMIT 1;

  -- UUID를 찾았다면 모든 테이블 업데이트
  IF target_user_id IS NOT NULL THEN
    -- todos 테이블
    UPDATE todos
    SET user_id = target_user_id
    WHERE user_id IS NULL;

    -- routines 테이블
    UPDATE routines
    SET user_id = target_user_id
    WHERE user_id IS NULL;

    -- todo_history 테이블
    UPDATE todo_history
    SET user_id = target_user_id
    WHERE user_id IS NULL;

    -- spec_memos 테이블
    UPDATE spec_memos
    SET user_id = target_user_id
    WHERE user_id IS NULL;

    -- encouragement_messages 테이블
    UPDATE encouragement_messages
    SET user_id = target_user_id
    WHERE user_id IS NULL;

    -- key_thoughts_history 테이블
    UPDATE key_thoughts_history
    SET user_id = target_user_id
    WHERE user_id IS NULL;

    -- user_settings 테이블
    UPDATE user_settings
    SET user_id = target_user_id
    WHERE user_id IS NULL;

    RAISE NOTICE '기존 데이터가 사용자 %에 귀속되었습니다', target_user_id;
  ELSE
    RAISE EXCEPTION 'designerbenja@gmail.com 사용자를 찾을 수 없습니다. 먼저 Google 로그인을 해주세요.';
  END IF;
END $$;

-- 방법 2: UUID를 직접 입력하는 방법 (auth.users 접근 불가능한 경우)
-- 1. designerbenja@gmail.com으로 로그인
-- 2. Supabase Dashboard > Authentication > Users에서 UUID 복사
-- 3. 아래 'YOUR-USER-UUID-HERE'를 복사한 UUID로 교체
-- 4. 주석 해제 후 실행

/*
DO $$
DECLARE
  target_user_id UUID := 'YOUR-USER-UUID-HERE'; -- 여기에 UUID 붙여넣기
BEGIN
  -- todos 테이블
  UPDATE todos
  SET user_id = target_user_id
  WHERE user_id IS NULL;

  -- routines 테이블
  UPDATE routines
  SET user_id = target_user_id
  WHERE user_id IS NULL;

  -- todo_history 테이블
  UPDATE todo_history
  SET user_id = target_user_id
  WHERE user_id IS NULL;

  -- spec_memos 테이블
  UPDATE spec_memos
  SET user_id = target_user_id
  WHERE user_id IS NULL;

  -- encouragement_messages 테이블
  UPDATE encouragement_messages
  SET user_id = target_user_id
  WHERE user_id IS NULL;

  -- key_thoughts_history 테이블
  UPDATE key_thoughts_history
  SET user_id = target_user_id
  WHERE user_id IS NULL;

  -- user_settings 테이블
  UPDATE user_settings
  SET user_id = target_user_id
  WHERE user_id IS NULL;

  RAISE NOTICE '기존 데이터가 사용자에 귀속되었습니다';
END $$;
*/
