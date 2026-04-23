-- daily 페이지 중복 생성 방지: (parent_id, page_date) 조합에 UNIQUE 제약 추가
-- 조건: page_type='daily' AND deleted_at IS NULL 에만 적용 (partial index)
--
-- 주의: 이 인덱스는 기존에 중복 행이 있으면 생성에 실패합니다.
-- 아래 "사전 확인" 쿼리로 먼저 중복 여부를 확인하고, 있다면 수동 정리 후 본 인덱스 생성.

-- ─────────────────────────────────────────
-- 사전 확인: 중복 daily 페이지 목록
-- ─────────────────────────────────────────
-- SELECT parent_id, page_date, count(*) AS dup_count,
--        array_agg(id ORDER BY created_at) AS page_ids,
--        array_agg(name ORDER BY created_at) AS names,
--        array_agg(created_at ORDER BY created_at) AS created_ats
-- FROM pages
-- WHERE page_type = 'daily' AND deleted_at IS NULL
-- GROUP BY parent_id, page_date
-- HAVING count(*) > 1;

-- ─────────────────────────────────────────
-- 인덱스 생성 (중복 없을 때만 성공)
-- ─────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pages_daily_parent_date
ON pages (parent_id, page_date)
WHERE page_type = 'daily' AND deleted_at IS NULL;
