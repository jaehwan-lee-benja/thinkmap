-- ====================================================================
-- ⛔⛔ 실행 금지 — 재실행하면 라이브 운영 데이터를 영구 파괴한다 (봉인 2026-08-02)
-- --------------------------------------------------------------------
-- 아래 "데이터가 없으므로 안전"이라는 원 주석은 **오늘 기준 거짓**이다.
-- 2026-08-02 라이브 실측(sqisntxippjzcekyhqyo):
--   · block_history = 3,091행  ← DROP TABLE … CASCADE 로 전부 소실
--   · blocks        = 0행      (원 주석이 맞는 건 이 테이블뿐)
--   · 컬럼 소실     : blocks.page_id, block_history.page_id (후속 마이그 추가분, 이 파일엔 없음)
--   · CASCADE 반경  : 명시 2테이블을 넘어 canvas_mappings_source_block_id_fkey 제약까지 함께 drop
--                     (이 파일에 복원 코드 없음 ⇒ 참조무결성 조용히 소실)
--   · 재생성 RLS    : auth.uid()=user_id 단독 — 라이브의 is_master()/is_linked_account() 절이 사라짐
-- ★이 파일은 정본이 아니라 **초기 1회용 스크립트의 화석**이다. 파일명("최종형"처럼 읽힘)과
--   원 주석이 재실행을 안전해 보이게 만드는 것이 이 파일의 실제 위험이다.
-- ★재실행 규칙: 실행하지 마라. blocks 스키마의 현재 진실은 파일이 아니라 **라이브 카탈로그**다.
--   변경이 필요하면 이 파일을 돌리지 말고 additive 마이그를 새로 써라.
-- ====================================================================
-- 최적화된 blocks 테이블 스키마 (기존 테이블 삭제 후 재생성)
-- saruru-manual + todo-note 장점 통합
-- ====================================================================

-- 0. 기존 테이블 삭제 (★위 봉인 배너 참조 — "데이터가 없으므로 안전"은 2026-08-02 기준 거짓)
DROP TABLE IF EXISTS block_history CASCADE;
DROP TABLE IF EXISTS blocks CASCADE;
DROP FUNCTION IF EXISTS update_blocks_updated_at() CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_block_history() CASCADE;

-- 1. updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. blocks 테이블 생성
CREATE TABLE blocks (
  -- Primary Key: UUID 사용 (분산 환경, 외래키 CASCADE)
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- 콘텐츠
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'toggle',  -- 'toggle', 'text', 'heading', 'heading1', 'heading2', 'heading3'

  -- 계층 구조
  parent_id UUID REFERENCES blocks(id) ON DELETE CASCADE,  -- NULL이면 최상위
  position INTEGER NOT NULL DEFAULT 0,  -- 같은 부모 내에서의 순서 (0부터 시작)
  depth INTEGER NOT NULL DEFAULT 0,     -- 계층 깊이 (0=최상위, 1=1단계 하위, ...) ✨ todo-note에서 추가
  is_open BOOLEAN NOT NULL DEFAULT true,

  -- 블록 참조 시스템 (Synced Block) ✨ saruru-manual 핵심 기능
  is_reference BOOLEAN NOT NULL DEFAULT false,  -- 이 블록이 참조인지 여부
  original_block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,  -- 참조일 경우 원본 블록 ID

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 제약조건
  CONSTRAINT position_non_negative CHECK (position >= 0),
  CONSTRAINT depth_non_negative CHECK (depth >= 0),
  CONSTRAINT reference_has_original CHECK (
    (is_reference = false AND original_block_id IS NULL) OR
    (is_reference = true AND original_block_id IS NOT NULL)
  )
);

-- 3. 인덱스 생성 (최적화된 인덱스 전략)

-- 계층 구조 쿼리 최적화 (user별 parent별 position 순 조회)
CREATE INDEX idx_blocks_user_parent_position
  ON blocks(user_id, parent_id, position);

-- 깊이별 블록 조회 (todo-note에서 가져옴)
CREATE INDEX idx_blocks_user_depth
  ON blocks(user_id, depth);

-- 참조 블록 조회 최적화 (조건부 인덱스)
CREATE INDEX idx_blocks_original_block
  ON blocks(original_block_id)
  WHERE is_reference = true;

-- Full-Text Search (한국어)
CREATE INDEX idx_blocks_content_search
  ON blocks USING gin(to_tsvector('simple', content));

-- 업데이트 시간 정렬 (최근 수정 블록)
CREATE INDEX idx_blocks_user_updated
  ON blocks(user_id, updated_at DESC);

-- 4. RLS (Row Level Security) 활성화
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- 5. RLS 정책: 사용자는 자신의 블록만 관리 가능
CREATE POLICY "Users can read own blocks"
  ON blocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own blocks"
  ON blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own blocks"
  ON blocks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own blocks"
  ON blocks FOR DELETE
  USING (auth.uid() = user_id);

-- 6. updated_at 자동 갱신 트리거 설정
CREATE TRIGGER blocks_updated_at_trigger
  BEFORE UPDATE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_blocks_updated_at();

-- ====================================================================
-- block_history 테이블: 블록별 수정 이력 추적
-- ====================================================================

CREATE TABLE block_history (
  id BIGSERIAL PRIMARY KEY,
  block_id UUID REFERENCES blocks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- 변경 내용
  content_before TEXT,
  content_after TEXT,
  action TEXT NOT NULL,  -- 'create', 'update', 'delete', 'move', 'reference_create'

  -- 메타데이터
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스: 블록별 히스토리 조회
CREATE INDEX idx_block_history_block_created
  ON block_history(block_id, created_at DESC);

-- 인덱스: 사용자별 최근 변경사항 조회
CREATE INDEX idx_block_history_user_created
  ON block_history(user_id, created_at DESC);

-- RLS 활성화
ALTER TABLE block_history ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "Users can read own block_history"
  ON block_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own block_history"
  ON block_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own block_history"
  ON block_history FOR DELETE
  USING (auth.uid() = user_id);

-- 30일 이상 오래된 히스토리 자동 삭제 함수
CREATE OR REPLACE FUNCTION cleanup_old_block_history()
RETURNS void AS $$
BEGIN
  DELETE FROM block_history
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- 완료 메시지
-- ====================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 최적화된 blocks 테이블 생성 완료';
  RAISE NOTICE '- UUID 기반 ID (분산 환경 지원)';
  RAISE NOTICE '- depth 필드 추가 (계층 깊이 추적)';
  RAISE NOTICE '- 블록 참조 기능 (Synced Block)';
  RAISE NOTICE '- 블록별 수정 이력 추적';
  RAISE NOTICE '- 최적화된 인덱스 (검색, 계층, 참조, 깊이)';
  RAISE NOTICE '- RLS: 사용자별 데이터 격리';
END $$;
