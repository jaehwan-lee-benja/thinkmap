-- Phase 1: TipTap 에디터 테스트를 위한 컬럼 추가
-- pages 테이블에 content_tiptap JSONB 컬럼 추가

-- 1. 백업 권장 (Supabase Dashboard → Database → Backups)

-- 2. 새 컬럼 추가 (기존 데이터는 건드리지 않음)
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS content_tiptap JSONB DEFAULT NULL;

-- 3. 인덱스 추가 (검색 성능 향상, 선택사항)
CREATE INDEX IF NOT EXISTS idx_pages_content_tiptap_search
  ON pages USING gin(content_tiptap);

-- 4. 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pages';
