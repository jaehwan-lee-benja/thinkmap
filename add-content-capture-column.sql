-- ============================================================================
-- pages 확장 — content_capture JSONB 컬럼 추가 (목표 페이지 캡처 드로어)
--
-- 목표 페이지(page_type='goal')에 "정리된 문서(content_tiptap) ↔ 난잡하게 떠오른
-- 생각 캡처"를 분리해서 다루는 보조 영역을 붙인다. 캡처 영역의 내용은 본문과
-- 분리 저장돼야 하므로, content_tiptap 패턴을 그대로 미러링한 보조 JSONB 컬럼에
-- 저장한다 (별도 테이블/행 없음).
--
-- 권한: pages 행에 함께 저장되므로 기존 RLS(`auth.uid() = user_id`)가 그대로
--   적용된다 — 신규 정책 불필요.
--
-- additive·nullable 이라 기존 데이터/페이지 동작에 영향 없음. 캡처 UI(목표 페이지
-- 드로어)만 이 컬럼을 읽고 쓴다. 되돌릴 땐 DROP COLUMN.
--
-- 단일 트랜잭션. 재실행 안전(IF NOT EXISTS).
-- ============================================================================

BEGIN;

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS content_capture JSONB DEFAULT NULL;

COMMIT;
