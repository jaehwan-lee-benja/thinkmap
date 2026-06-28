-- migrate-worklog-sections-presentation.sql
-- [5] 데일리 이월 시 "섹션 카드 풀림"(색상·접힘 상태 유실) 수정
--
-- 원인: 섹션 카드의 background_color / is_open 은 그날치 daily_blocks 에만 저장되고,
--       worklog_sections(마스터 템플릿)에는 해당 컬럼이 없다. 매일 새 데일리는
--       buildDailyTemplateRows 로 섹션을 새로 생성하므로 전날 색/접힘이 승계되지 않아
--       매일 색 없음(null) + 전부 펼침(is_open=true) 으로 리셋된다.
--
-- 결정(사용자 승인): 색/접힘을 섹션 "정체성"으로 마스터에 저장(옵션 2). 템플릿이 마스터에서
--       읽어 매일 동일하게 적용. 색 피커/접힘 토글은 master write-through 로 마스터를 갱신.
--
-- 규율: 추가 전용. 기존 컬럼/정책/데이터 무삭제·무변경. RLS 변경 없음.
-- 적용: supabase-guardian 검수 → 사용자 승인 → 통합 세션.
--
-- ★ 적용 전 백업 권장(롤백 시 DROP COLUMN 으로 백필값 소멸):
--   CREATE TABLE worklog_sections_backup_YYYYMMDD AS SELECT * FROM worklog_sections;
-- ※ 백필은 "가장 최근 non-null 색"을 복원하므로, 의도적으로 색을 제거한 섹션이 있으면 이전 색이
--   되살아날 수 있다(이월 리셋 버그와 의도적 제거를 데이터로 구분 불가). 통합 세션에서 확인.

BEGIN;

-- 1. 마스터 테이블에 표시상태 컬럼 추가 (추가 전용, idempotent)
ALTER TABLE worklog_sections ADD COLUMN IF NOT EXISTS background_color text;
ALTER TABLE worklog_sections ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true;

-- 2. 백필 — 각 마스터의 "가장 최근 색이 있던 날" 색상을 마스터로 끌어올림.
--    (오늘/최근 페이지는 이미 색이 null 로 유실됐으므로, background_color IS NOT NULL 인
--     가장 최근 행을 골라 의도된 색을 복원한다.)
UPDATE worklog_sections ws
SET background_color = c.background_color
FROM (
  SELECT DISTINCT ON (section_master_id)
         section_master_id, background_color
  FROM daily_blocks
  WHERE block_type = 'section'
    AND section_master_id IS NOT NULL
    AND deleted_at IS NULL
    AND background_color IS NOT NULL
  ORDER BY section_master_id, page_date DESC
) c
WHERE ws.id = c.section_master_id
  AND ws.background_color IS NULL;

-- 3. (선택) 오늘 이후 페이지의 색 없는 섹션 행을 마스터 색으로 즉시 복원.
--    과거(이력) 페이지는 손대지 않는다. 통합 세션에서 적용 범위 판단.
--    ※ 적용을 원치 않으면 이 블록만 주석 처리.
UPDATE daily_blocks db
SET background_color = ws.background_color
FROM worklog_sections ws
WHERE db.section_master_id = ws.id
  AND db.block_type = 'section'
  AND db.deleted_at IS NULL
  AND db.background_color IS NULL
  AND ws.background_color IS NOT NULL
  AND db.page_date >= CURRENT_DATE;

COMMIT;

-- 롤백: ALTER TABLE worklog_sections DROP COLUMN background_color, DROP COLUMN is_open;  -- ⚠ 백필값 소멸
--       (백필/복원 UPDATE 는 추가 데이터라 별도 원복 불요 — 기존 동작 무영향)
