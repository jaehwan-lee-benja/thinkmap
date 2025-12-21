-- ======================================
-- 루틴에 시간대 설정 추가
-- ======================================
-- routines 테이블에 time_slot 컬럼 추가 (선택적)
-- ======================================

-- 1. time_slot 컬럼 추가 (nullable - 선택사항)
ALTER TABLE routines
ADD COLUMN IF NOT EXISTS time_slot TEXT;

-- 2. 확인
SELECT id, text, days, time_slot, created_at
FROM routines
ORDER BY created_at DESC
LIMIT 5;
