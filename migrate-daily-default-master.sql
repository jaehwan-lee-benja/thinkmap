-- migrate-daily-default-master.sql
-- [A] 데일리 페이지 권한 모델 정비 — "기본 마스터 전용 + 명시 공유 시 멤버 열람"
--
-- 결정(사용자 승인): 섹션이 공유 단위. 데일리 페이지(pages)는 멤버에게 열리되, 섹션은
--   기본 비공개(마스터 전용)이고 헤더 크라운 토글로 명시 공유한 섹션만 멤버가 본다.
--   운영 인계용 고정 섹션 4종(할일/전달사항/당일이슈/마무리)만 기본 공개(visibility='all').
--
-- 동작 모델(현행 RLS 위에서):
--   - daily_blocks SELECT = (visibility='all' OR is_master())  ← 무변경
--   - 섹션 visibility 기본값을 'master' 로 → 새 섹션은 자동 비공개
--   - 자식 콘텐츠 visibility 는 코드(docToBlocks)가 항상 섹션을 상속하도록 강제(누수 차단)
--
-- ★ 중요: daily_blocks.visibility 기본값은 'all' 그대로 둔다.
--   (섹션 조상 없는 고아 블록이 'master' 로 떨어지면 작성자 본인도 못 보는 회귀가 나므로,
--    안전상 'all'(본인 가시) 유지. 콘텐츠 비공개는 "섹션 상속" 경로로만 일어난다.)
--
-- 규율: 추가 전용. RLS 정책 본문 무변경(기본값 ALTER만). 기존 행 무변경.
--   (DEFAULT 변경은 신규 INSERT 에만 적용 — 기존 데이터 영향 0)
-- 적용: supabase-guardian 검수 → 사용자 승인 → 통합 세션.

BEGIN;

-- 1. 섹션 마스터 기본 비공개 — 이후 만들어지는 섹션은 마스터 전용으로 시작
ALTER TABLE worklog_sections ALTER COLUMN visibility SET DEFAULT 'master';

-- 2. 운영 인계용 고정 섹션은 멤버 공개 유지(명시)
UPDATE worklog_sections
SET visibility = 'all'
WHERE id IN ('fixed_todo', 'fixed_notice', 'fixed_daily_issue', 'fixed_wrapup')
  AND visibility IS DISTINCT FROM 'all';

-- (daily_blocks.visibility DEFAULT 는 의도적으로 'all' 유지 — 위 ★ 주석 참조)

COMMIT;

-- 롤백: ALTER TABLE worklog_sections ALTER COLUMN visibility SET DEFAULT 'all';
--       (고정 섹션 UPDATE 는 원래 'all' 이 정상값이라 원복 불요)
--
-- 후속(C-2, 별도): is_master() → can_in_workspace(current_workspace(), 'owner'|'viewer')
--   로 교체(ACCESS-TIERS-MIGRATION-PLAN C-2). 본 변경과 독립이며 dual-run 으로 진행.
