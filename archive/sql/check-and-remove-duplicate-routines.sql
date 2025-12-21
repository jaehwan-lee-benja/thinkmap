-- 중복된 루틴 투두 확인 및 제거

-- 1. 중복 확인: 같은 routine_id를 가진 투두가 2개 이상인지 확인
SELECT routine_id, COUNT(*) as count
FROM todos
WHERE routine_id IS NOT NULL
  AND deleted = false
GROUP BY routine_id
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 2. 중복 제거: 각 routine_id당 가장 오래된 것(최소 id) 하나만 남기고 나머지 삭제
WITH duplicates AS (
  SELECT
    id,
    routine_id,
    ROW_NUMBER() OVER (PARTITION BY routine_id ORDER BY id ASC) as rn
  FROM todos
  WHERE routine_id IS NOT NULL
    AND deleted = false
)
UPDATE todos
SET deleted = true
WHERE id IN (
  SELECT id
  FROM duplicates
  WHERE rn > 1
);

-- 3. 실행 후 확인
SELECT routine_id, COUNT(*) as count
FROM todos
WHERE routine_id IS NOT NULL
  AND deleted = false
GROUP BY routine_id
HAVING COUNT(*) > 1;
-- 이 쿼리 결과가 비어있으면 중복 제거 완료
