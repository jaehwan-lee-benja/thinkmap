-- ============================================================================
-- worklog_board_user_settings 에 섹션 좌/우 단 배치(section_cols) 추가
-- WORKLOG-SPEC.md — 데일리 리스트뷰 2단(2-column) 분할 기능
-- ============================================================================
--
-- section_cols: { "<worklog_sections.id>": 1 | 2 } 형태의 jsonb 맵.
--   1 = 좌측 단, 2 = 우측 단. 맵에 없는 섹션은 기본 1(좌측).
--   리스트뷰 2단 모드에서 "어느 섹션을 좌/우에 둘지"를 user+board 단위로 영속화.
--   section_order 와 동일하게 board 단위 사용자 설정이라 날짜를 넘어 유지된다
--   (참조용 리스트는 항상 좌측, 정리용은 우측 — 매일 재배치 불필요).
--
-- 적용 대상: worklog_board_user_settings 모든 row. 기본값 '{}'.
-- daily_blocks / 변환레이어와 무관 (col 은 doc 노드의 transient attr 로만 오버레이).
--
-- 단일 트랜잭션. Supabase SQL Editor 에 통째로 붙여넣어 실행.
-- 운영 DB 는 별도 마이그 러너 없이 SQL Editor 수동 적용.

BEGIN;

ALTER TABLE worklog_board_user_settings
  ADD COLUMN IF NOT EXISTS section_cols jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN worklog_board_user_settings.section_cols IS
  '리스트뷰 2단 좌/우 배치 맵 — { "<worklog_sections.id>": 1|2 }. 1=좌, 2=우. 없으면 기본 1(좌). user+board 단위.';

COMMIT;

-- ============================================================================
-- 검증 쿼리 (실행 후 확인)
-- ============================================================================
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'worklog_board_user_settings'
--    AND column_name = 'section_cols';
