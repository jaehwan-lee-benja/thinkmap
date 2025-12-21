-- ========================================
-- 1단계: JSON 기반 이월 시스템으로 전환
-- 스키마 확장 및 데이터 마이그레이션
-- ========================================
-- 실행일: 2025-11-22
-- 목적: visible_dates, hidden_dates 컬럼 추가 및 기존 데이터 변환
-- 안전성: 기존 컬럼 유지, 새 컬럼만 추가 (롤백 가능)

-- ========================================
-- STEP 1: 새 컬럼 추가
-- ========================================

-- visible_dates: 이 투두가 보여야 할 날짜들의 배열
ALTER TABLE todos
ADD COLUMN IF NOT EXISTS visible_dates JSONB DEFAULT '[]'::jsonb;

-- hidden_dates: 특정 날짜에서만 숨긴 경우
ALTER TABLE todos
ADD COLUMN IF NOT EXISTS hidden_dates JSONB DEFAULT '[]'::jsonb;

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_todos_visible_dates ON todos USING GIN (visible_dates);
CREATE INDEX IF NOT EXISTS idx_todos_hidden_dates ON todos USING GIN (hidden_dates);

-- ========================================
-- STEP 2: 기존 데이터 마이그레이션
-- ========================================

-- 2-1. 원본 투두들 (original_todo_id가 NULL인 것들)
-- 각 원본 투두의 visible_dates = [자신의 date + 이월된 모든 투두들의 date]
UPDATE todos
SET visible_dates = (
  SELECT jsonb_agg(DISTINCT t.date ORDER BY t.date)
  FROM todos t
  WHERE
    -- 자기 자신 포함
    (t.id = todos.id)
    -- 또는 나를 original_todo_id로 참조하는 이월된 투두들
    OR (t.original_todo_id = todos.id)
)
WHERE original_todo_id IS NULL
  AND visible_dates = '[]'::jsonb; -- 아직 마이그레이션 안된 것만

-- 2-2. 이월된 투두들 (original_todo_id가 있는 것들)
-- visible_dates를 빈 배열로 설정 (원본 투두에 이미 포함되어 있음)
UPDATE todos
SET visible_dates = '[]'::jsonb
WHERE original_todo_id IS NOT NULL
  AND visible_dates = '[]'::jsonb;

-- 2-3. hidden_dates는 기본값(빈 배열)으로 유지
-- 향후 "이 날짜에서만 숨김" 기능에 사용

-- ========================================
-- STEP 3: 검증 쿼리 (실행 후 확인용)
-- ========================================

-- 검증 1: 원본 투두들의 visible_dates 확인
-- 결과: 각 원본 투두가 몇 개의 날짜에 보이는지 확인
SELECT
  id,
  text,
  date as created_date,
  original_todo_id,
  jsonb_array_length(visible_dates) as visible_count,
  visible_dates
FROM todos
WHERE original_todo_id IS NULL
  AND visible_dates != '[]'::jsonb
ORDER BY id DESC
LIMIT 10;

-- 검증 2: 이월된 투두들의 상태 확인
-- 결과: 이월된 투두들은 visible_dates가 빈 배열이어야 함
SELECT
  id,
  text,
  date,
  original_todo_id,
  visible_dates
FROM todos
WHERE original_todo_id IS NOT NULL
LIMIT 10;

-- 검증 3: 전체 통계
SELECT
  '원본 투두' as type,
  COUNT(*) as count,
  COUNT(CASE WHEN visible_dates != '[]'::jsonb THEN 1 END) as migrated_count
FROM todos
WHERE original_todo_id IS NULL
UNION ALL
SELECT
  '이월 투두' as type,
  COUNT(*) as count,
  COUNT(CASE WHEN visible_dates = '[]'::jsonb THEN 1 END) as migrated_count
FROM todos
WHERE original_todo_id IS NOT NULL;

-- ========================================
-- 롤백 방법 (문제 발생 시)
-- ========================================

-- 주의: 롤백 전 백업 필수!

-- 롤백 스크립트 (필요시 실행):
/*
DROP INDEX IF EXISTS idx_todos_visible_dates;
DROP INDEX IF EXISTS idx_todos_hidden_dates;
ALTER TABLE todos DROP COLUMN IF EXISTS visible_dates;
ALTER TABLE todos DROP COLUMN IF EXISTS hidden_dates;
*/

-- ========================================
-- 완료 후 확인사항
-- ========================================

-- 1. 모든 원본 투두의 visible_dates가 채워졌는지 확인
-- 2. 이월된 투두들의 visible_dates가 빈 배열인지 확인
-- 3. 인덱스가 생성되었는지 확인
-- 4. 기존 애플리케이션 동작에 문제 없는지 확인

-- ========================================
-- 다음 단계 (2단계에서 진행)
-- ========================================

-- 2단계: fetchTodos 로직을 새 컬럼 우선 사용하도록 수정
-- 3단계: 이월 로직을 새 방식으로 변경
-- 4단계: 삭제 로직 단순화 및 구 컬럼 제거
