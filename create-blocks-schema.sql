-- ====================================================================
-- 최적화된 blocks 테이블 스키마
-- saruru-manual + todo-note 장점 통합
-- ====================================================================
--
-- 주요 개선사항:
-- 1. UUID 기반 ID (분산 환경, 외래키 CASCADE)
-- 2. depth 필드 추가 (todo-note에서 가져옴)
-- 3. 블록 참조 기능 유지 (Synced Block)
-- 4. 블록별 수정 이력 추적
-- 5. 최적화된 인덱스 전략
--
-- ====================================================================

-- 1. updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. blocks 테이블 생성
CREATE TABLE IF NOT EXISTS blocks (
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
CREATE INDEX IF NOT EXISTS idx_blocks_user_parent_position
  ON blocks(user_id, parent_id, position);

-- 깊이별 블록 조회 (todo-note에서 가져옴)
CREATE INDEX IF NOT EXISTS idx_blocks_user_depth
  ON blocks(user_id, depth);

-- 참조 블록 조회 최적화 (조건부 인덱스)
CREATE INDEX IF NOT EXISTS idx_blocks_original_block
  ON blocks(original_block_id)
  WHERE is_reference = true;

-- Full-Text Search (한국어)
CREATE INDEX IF NOT EXISTS idx_blocks_content_search
  ON blocks USING gin(to_tsvector('simple', content));

-- 업데이트 시간 정렬 (최근 수정 블록)
CREATE INDEX IF NOT EXISTS idx_blocks_user_updated
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

CREATE TABLE IF NOT EXISTS block_history (
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
CREATE INDEX IF NOT EXISTS idx_block_history_block_created
  ON block_history(block_id, created_at DESC);

-- 인덱스: 사용자별 최근 변경사항 조회
CREATE INDEX IF NOT EXISTS idx_block_history_user_created
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
