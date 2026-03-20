-- 업무일지 달력 지원을 위한 pages 컬럼 추가
-- page_type: 페이지 종류 구분 ('normal', 'calendar', 'daily')
-- page_date: 날짜별 페이지의 날짜 값
--
-- [향후 확장] 계정별 개인 업무일지 분리 시:
--   work_logs 테이블 신설 (id, owner_id, name, project_id, ...)
--   owner_id = NULL → 공유 업무일지, owner_id = user_id → 개인 업무일지
--   현재는 1개의 공유 업무일지만 운영

ALTER TABLE pages ADD COLUMN IF NOT EXISTS page_type TEXT DEFAULT 'normal';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS page_date DATE;

CREATE INDEX IF NOT EXISTS idx_pages_page_type ON pages(page_type);
CREATE INDEX IF NOT EXISTS idx_pages_page_date ON pages(page_date);
