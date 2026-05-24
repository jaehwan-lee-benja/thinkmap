-- daily_blocks 에 토글 열기/닫기 상태 영속화.
-- 데일리 페이지의 토글 isOpen 을 새로고침 후에도 유지하기 위해 컬럼 추가.
--
-- 적용 대상: daily_blocks 모든 row (section + toggle). 기본값 true (열림).
-- 일반 페이지(pages.content_tiptap JSON)는 별도 처리 불필요 (JSON 통째 저장).

ALTER TABLE daily_blocks
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN daily_blocks.is_open IS '토글 펼침 상태 — true: 열림(자식 보임), false: 닫힘(자식 숨김). 기본 true.';
