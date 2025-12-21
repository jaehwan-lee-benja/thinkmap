-- todos 테이블에 is_pending_routine 컬럼 추가
-- 미정 루틴을 표시하기 위한 boolean 컬럼

ALTER TABLE todos
ADD COLUMN IF NOT EXISTS is_pending_routine BOOLEAN DEFAULT FALSE;

-- 기본값 설명:
-- FALSE: 일반 투두 또는 확정된 루틴
-- TRUE: 루틴으로 지정 예정인 미정 투두
