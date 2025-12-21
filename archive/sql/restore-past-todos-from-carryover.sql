-- ==========================================
-- 이월된 투두의 원본을 복원하는 마이그레이션
-- 과거에 "이동" 방식으로 이월된 항목들을 복원
-- ==========================================

DO $$
DECLARE
  todo_record RECORD;
  new_original_id bigint;
  original_date date;
BEGIN
  -- 현재 날짜보다 created_at이 이전인 투두들 (이미 이월된 것들)
  FOR todo_record IN
    SELECT * FROM todos
    WHERE deleted = false
      AND original_todo_id IS NULL  -- 아직 원본이 설정되지 않은 것들
      AND date::date > created_at::date  -- 생성일보다 날짜가 미래인 것들 (이월된 증거)
    ORDER BY created_at
  LOOP
    -- 원본이 있어야 할 날짜 (created_at의 날짜 부분)
    original_date := todo_record.created_at::date;

    -- 원본 투두 생성 (과거 날짜에)
    INSERT INTO todos (
      text,
      completed,
      date,
      created_at,
      order_index,
      parent_id,
      routine_id,
      deleted
    ) VALUES (
      todo_record.text,
      false,  -- 원본은 미완료 상태로
      original_date,
      todo_record.created_at,
      todo_record.order_index,
      NULL,  -- 서브투두는 이월하지 않으므로 NULL
      todo_record.routine_id,
      false
    )
    RETURNING id INTO new_original_id;

    -- 현재 투두의 original_todo_id 업데이트
    UPDATE todos
    SET original_todo_id = new_original_id
    WHERE id = todo_record.id;

    RAISE NOTICE '투두 복원: % (원본 날짜: %, 현재 날짜: %)',
      todo_record.text, original_date, todo_record.date;
  END LOOP;

  RAISE NOTICE '✅ 이월된 투두 원본 복원 완료!';
END $$;

-- 복원 결과 확인
SELECT
  '복원된 원본 투두' as type,
  COUNT(*) as count
FROM todos
WHERE original_todo_id IS NOT NULL;

SELECT
  '원본을 가진 투두' as type,
  COUNT(*) as count
FROM todos
WHERE id IN (SELECT original_todo_id FROM todos WHERE original_todo_id IS NOT NULL);
