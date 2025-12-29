-- 기존 블록 데이터 삭제 후 새로 시작
DELETE FROM blocks;
DELETE FROM block_history;

-- 확인
SELECT COUNT(*) as total_blocks FROM blocks;
