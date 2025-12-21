-- ==========================================
-- 더미 데이터 삭제 SQL
-- [DUMMY-숫자]로 시작하는 모든 투두와 히스토리 삭제
-- ==========================================

-- 먼저 히스토리 삭제
DELETE FROM todo_history
WHERE todo_id IN (
  SELECT id FROM todos WHERE text LIKE '[DUMMY-%'
);

-- 투두 삭제
DELETE FROM todos
WHERE text LIKE '[DUMMY-%';

-- 완료 메시지
SELECT '✅ 모든 더미 데이터 삭제 완료!' as message;
