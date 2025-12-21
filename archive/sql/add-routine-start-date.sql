-- routines 테이블에 start_date 컬럼 추가
-- 루틴이 시작되는 날짜를 추적하여 과거 날짜에 루틴 투두가 생성되지 않도록 함

ALTER TABLE routines
ADD COLUMN IF NOT EXISTS start_date DATE;

-- 기존 루틴들의 start_date를 created_at 날짜로 설정
UPDATE routines
SET start_date = DATE(created_at)
WHERE start_date IS NULL;

-- 주석: 새로 생성되는 루틴은 앱에서 start_date를 명시적으로 설정해야 함
