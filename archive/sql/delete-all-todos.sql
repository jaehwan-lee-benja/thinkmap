-- ======================================
-- 모든 투두 데이터 삭제 (전체 리셋)
-- ======================================
-- 주의: 이 작업은 되돌릴 수 없습니다!
-- 기획서 노트(spec_memos)와 격려 메시지(encouragement_messages)는 보존됩니다.
-- ======================================

-- 1. 투두 히스토리 삭제 (외래키 제약 때문에 먼저 삭제)
DELETE FROM todo_history;

-- 2. 모든 투두 삭제
DELETE FROM todos;

-- 3. 루틴 삭제
DELETE FROM routines;

-- 4. 시퀀스 초기화 (ID를 1부터 다시 시작)
ALTER SEQUENCE todos_id_seq RESTART WITH 1;
ALTER SEQUENCE todo_history_id_seq RESTART WITH 1;
-- routines 테이블은 시퀀스가 없거나 이름이 다를 수 있음

-- ======================================
-- 실행 결과 확인
-- ======================================
SELECT 'todos' as table_name, COUNT(*) as remaining_count FROM todos
UNION ALL
SELECT 'todo_history', COUNT(*) FROM todo_history
UNION ALL
SELECT 'routines', COUNT(*) FROM routines
UNION ALL
SELECT 'spec_memos', COUNT(*) FROM spec_memos
UNION ALL
SELECT 'encouragement_messages', COUNT(*) FROM encouragement_messages;
