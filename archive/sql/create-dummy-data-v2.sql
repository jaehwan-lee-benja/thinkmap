-- ==========================================
-- 더미 데이터 생성 SQL (동적 날짜 버전)
-- 실행 시 오늘 날짜 기준 앞뒤 이틀씩 총 20개의 투두 생성
-- ==========================================

DO $$
DECLARE
  -- 오늘 기준 날짜 계산
  day_m2 date := CURRENT_DATE - INTERVAL '2 days';
  day_m1 date := CURRENT_DATE - INTERVAL '1 day';
  day_0 date := CURRENT_DATE;
  day_p1 date := CURRENT_DATE + INTERVAL '1 day';
  day_p2 date := CURRENT_DATE + INTERVAL '2 days';

  -- 날짜 일(day) 부분 추출
  d_m2 text := EXTRACT(DAY FROM CURRENT_DATE - INTERVAL '2 days')::text;
  d_m1 text := EXTRACT(DAY FROM CURRENT_DATE - INTERVAL '1 day')::text;
  d_0 text := EXTRACT(DAY FROM CURRENT_DATE)::text;
  d_p1 text := EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '1 day')::text;
  d_p2 text := EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '2 days')::text;

  -- 타임스탬프 기반 세션 ID
  session_id text := EXTRACT(EPOCH FROM NOW())::bigint::text;
BEGIN
  -- -2일 페이지 (정상 생성) - 4개
  INSERT INTO todos (text, date, completed, created_at, order_index)
  VALUES
    ('[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-미완료-수정이력있음', day_m2, false, (day_m2 + TIME '09:00:00') AT TIME ZONE 'Asia/Seoul', 1001),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-' || d_m2 || '일완료', day_m2, true, (day_m2 + TIME '09:10:00') AT TIME ZONE 'Asia/Seoul', 1002),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-' || d_m1 || '일완료', day_m2, true, (day_m2 + TIME '09:20:00') AT TIME ZONE 'Asia/Seoul', 1003),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-' || d_0 || '일완료', day_m2, true, (day_m2 + TIME '09:30:00') AT TIME ZONE 'Asia/Seoul', 1004);

  -- -1일 페이지 (정상 생성) - 3개
  INSERT INTO todos (text, date, completed, created_at, order_index)
  VALUES
    ('[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-미완료-수정이력있음', day_m1, false, (day_m1 + TIME '10:00:00') AT TIME ZONE 'Asia/Seoul', 1005),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-' || d_m1 || '일완료', day_m1, true, (day_m1 + TIME '10:10:00') AT TIME ZONE 'Asia/Seoul', 1006),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-' || d_0 || '일완료', day_m1, true, (day_m1 + TIME '10:20:00') AT TIME ZONE 'Asia/Seoul', 1007);

  -- 오늘 페이지 (정상 생성) - 2개
  INSERT INTO todos (text, date, completed, created_at, order_index)
  VALUES
    ('[DUMMY-' || session_id || '] 더미: ' || d_0 || '일생성-미완료', day_0, false, (day_0 + TIME '11:00:00') AT TIME ZONE 'Asia/Seoul', 1008),
    ('[DUMMY-' || session_id || '] 더미: ' || d_0 || '일생성-' || d_0 || '일완료', day_0, true, (day_0 + TIME '11:10:00') AT TIME ZONE 'Asia/Seoul', 1009);

  -- -1일 페이지에 미리 작성 - 2개
  INSERT INTO todos (text, date, completed, created_at, order_index)
  VALUES
    ('[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-' || d_m1 || '일페이지-미완료', day_m1, false, (day_m2 + TIME '14:00:00') AT TIME ZONE 'Asia/Seoul', 1010),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-' || d_m1 || '일페이지-' || d_m1 || '일완료', day_m1, true, (day_m2 + TIME '14:10:00') AT TIME ZONE 'Asia/Seoul', 1011);

  -- 오늘 페이지에 미리 작성 - 4개
  INSERT INTO todos (text, date, completed, created_at, order_index)
  VALUES
    ('[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-' || d_0 || '일페이지-미완료', day_0, false, (day_m1 + TIME '15:00:00') AT TIME ZONE 'Asia/Seoul', 1012),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-' || d_0 || '일페이지-' || d_0 || '일완료', day_0, true, (day_m1 + TIME '15:10:00') AT TIME ZONE 'Asia/Seoul', 1013),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-' || d_0 || '일페이지-미완료', day_0, false, (day_m2 + TIME '15:00:00') AT TIME ZONE 'Asia/Seoul', 1014),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-' || d_0 || '일페이지-' || d_0 || '일완료', day_0, true, (day_m2 + TIME '15:10:00') AT TIME ZONE 'Asia/Seoul', 1015);

  -- +1일 페이지에 미리 작성 (미래) - 3개
  INSERT INTO todos (text, date, completed, created_at, order_index)
  VALUES
    ('[DUMMY-' || session_id || '] 더미: ' || d_0 || '일생성-' || d_p1 || '일페이지-미완료', day_p1, false, (day_0 + TIME '16:00:00') AT TIME ZONE 'Asia/Seoul', 1016),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-' || d_p1 || '일페이지-미완료', day_p1, false, (day_m1 + TIME '16:00:00') AT TIME ZONE 'Asia/Seoul', 1017),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-' || d_p1 || '일페이지-미완료', day_p1, false, (day_m2 + TIME '16:00:00') AT TIME ZONE 'Asia/Seoul', 1018);

  -- +2일 페이지에 미리 작성 (미래) - 2개
  INSERT INTO todos (text, date, completed, created_at, order_index)
  VALUES
    ('[DUMMY-' || session_id || '] 더미: ' || d_0 || '일생성-' || d_p2 || '일페이지-미완료', day_p2, false, (day_0 + TIME '17:00:00') AT TIME ZONE 'Asia/Seoul', 1019),
    ('[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-' || d_p2 || '일페이지-미완료', day_p2, false, (day_m1 + TIME '17:00:00') AT TIME ZONE 'Asia/Seoul', 1020);

  -- 히스토리 데이터 삽입 (3개)
  -- -2일 생성 투두의 히스토리 (-1일, 오늘 수정)
  INSERT INTO todo_history (todo_id, previous_text, new_text, changed_at, changed_on_date)
  SELECT
    id,
    '[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-미완료-1차',
    '[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-미완료-2차',
    (day_m1 + TIME '12:00:00') AT TIME ZONE 'Asia/Seoul',
    day_m1
  FROM todos
  WHERE text = '[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-미완료-수정이력있음'
  LIMIT 1;

  INSERT INTO todo_history (todo_id, previous_text, new_text, changed_at, changed_on_date)
  SELECT
    id,
    '[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-미완료-2차',
    '[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-미완료-수정이력있음',
    (day_0 + TIME '12:00:00') AT TIME ZONE 'Asia/Seoul',
    day_0
  FROM todos
  WHERE text = '[DUMMY-' || session_id || '] 더미: ' || d_m2 || '일생성-미완료-수정이력있음'
  LIMIT 1;

  -- -1일 생성 투두의 히스토리 (오늘 수정)
  INSERT INTO todo_history (todo_id, previous_text, new_text, changed_at, changed_on_date)
  SELECT
    id,
    '[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-미완료-1차',
    '[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-미완료-수정이력있음',
    (day_0 + TIME '13:00:00') AT TIME ZONE 'Asia/Seoul',
    day_0
  FROM todos
  WHERE text = '[DUMMY-' || session_id || '] 더미: ' || d_m1 || '일생성-미완료-수정이력있음'
  LIMIT 1;

  -- 완료 메시지
  RAISE NOTICE '✅ 더미 데이터 생성 완료!';
  RAISE NOTICE '투두: 20개 (날짜 범위: % ~ %)', day_m2, day_p2;
  RAISE NOTICE '히스토리: 3개';
  RAISE NOTICE '세션 ID: DUMMY-%', session_id;
END $$;

-- 생성된 데이터 확인
SELECT '✅ 더미 데이터 생성 완료!' as message;
SELECT COUNT(*) || '개의 투두 생성됨' as info FROM todos WHERE text LIKE '[DUMMY-%';
SELECT COUNT(*) || '개의 히스토리 생성됨' as info FROM todo_history WHERE todo_id IN (SELECT id FROM todos WHERE text LIKE '[DUMMY-%');
