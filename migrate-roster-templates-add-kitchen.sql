-- ============================================================================
-- 배치도 체제 템플릿 — 주방/바 사각형 좌표 컬럼 추가
--
--   작전판의 "주방·바" 경계 사각형을 체제별로 조절·저장하기 위한 좌표(%, 0~100).
--   추가형 ALTER (기존 행은 기본값으로 채워짐). 재실행 안전. 기존 데이터/RLS 무변경.
--   전제: migrate-create-roster-templates.sql 선적용.
-- ============================================================================

BEGIN;

ALTER TABLE roster_templates ADD COLUMN IF NOT EXISTS kitchen_x int NOT NULL DEFAULT 6;
ALTER TABLE roster_templates ADD COLUMN IF NOT EXISTS kitchen_y int NOT NULL DEFAULT 44;
ALTER TABLE roster_templates ADD COLUMN IF NOT EXISTS kitchen_w int NOT NULL DEFAULT 88;
ALTER TABLE roster_templates ADD COLUMN IF NOT EXISTS kitchen_h int NOT NULL DEFAULT 52;

COMMIT;
