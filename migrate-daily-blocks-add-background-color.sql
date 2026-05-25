-- daily_blocks 에 블록/섹션 배경색 영속화.
-- 데일리 페이지에서 섹션 카드(및 일반 토글)의 배경색을 새로고침 후에도 유지하기 위해 컬럼 추가.
--
-- 값: TipTap toggle 노드의 backgroundColor attr 와 동일한 CSS 색상 문자열.
--     예) 'rgba(34, 197, 94, 0.15)' (초록 배경). null 이면 기본(배경 없음).
--     팔레트: src/components/TipTapEditor/components/ColorPicker.jsx 의 BG_COLORS.
-- 적용 대상: daily_blocks 모든 row (section + toggle). 기본값 null.
-- 일반 페이지(pages.content_tiptap JSON)는 별도 처리 불필요 (JSON 통째 저장).

ALTER TABLE daily_blocks
  ADD COLUMN IF NOT EXISTS background_color text;

COMMENT ON COLUMN daily_blocks.background_color IS '블록/섹션 배경색 — TipTap backgroundColor attr (CSS 색상 문자열). null 이면 기본(배경 없음).';
