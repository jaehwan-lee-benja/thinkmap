# 마케팅 캔버스 매핑 기능 — 기획서 v0.3

> 작마클(작은마케팅클리닉) Marketing Canvas v7.44 위에 ThinkMap의 토글·페이지를 매핑하여, 일상의 작업이 비즈니스 모델의 어느 자리에 기여하는지 한눈에 보고, 동시에 일목요연하게 정리·진단·관리하는 기능.

---

## 0. 배경 / 문제 정의

### 0-1. 작마클 Marketing Canvas의 두 큰 원
- **Marketing Frame**: 비즈니스 정체성 (회사·고객·행동·가치·핵심역량·비전)
- **Marketing Engine**: 고객 여정 자체순환엔진 (방문→신청→경험→단골 + 타겟풀/단골풀)

### 0-2. 현재 사용자 방식
출력한 PDF 위에 **형광펜으로 영역**을 표시하고, **포스트잇/메모 카드**를 빼곡히 붙여 매핑.

**장점**: 공간적으로 어디에 뭐가 있는지 직관적으로 보임.  
**한계**: 빼곡하면 진행 상태 안 보임 / 우선순위·마감 표현 불가 / 영역별 인사이트 추출 어려움 / 색의 의미 분산 / 검색·이력 불가.

### 0-3. 목표
> **시각도 잃지 않고, 정리·진단도 가능한 디지털 매핑 도구.**

---

## 1. 확정된 핵심 결정 사항

| # | 항목 | 결정 |
|---|---|---|
| 1 | 위계 의미 | **참조/링크 관계** (4종 페이지 독립, 매핑 테이블로 연결) |
| 2 | 시각화 방식 | **하이브리드** — 영역(Region) + 노드(Node) 둘 다 매핑 |
| 3 | 매핑 방식 | **수동** (드래그/할당) |
| 4 | frame ↔ engine | **페어** (1 frame ↔ 1 engine, 같이 생성·이동) |
| 5 | 권한 분리 | **마스터 뷰 / 직원 뷰** = 같은 캔버스, 다른 필터/권한 (업무일지 데일리와 동일 패턴) |
| 6 | 매핑 단위 | **토글 1개 / 토글 트리 전체** 둘 다 선택 가능 |
| 7 | 매핑 출처 | **블록(토글) + 페이지** 둘 다 매핑 가능 |
| 8 | 양식 좌표 | **DB 저장 + 관리자 편집** (양식 업그레이드/커스텀 대응) |
| 9 | 카드 워크플로우 | **사용자 정의** (시드 워크플로우 제공 후 편집 가능) |

---

## 2. 정보 위계 (의미 기반)

```
┌─────────────────────────────────────────────────────┐
│ [상위 의미]   업무일지 (Daily)                      │
│              ↓ 매일의 행위가                        │
│ [전략 정체성] Marketing Frame   (왜·누구·무엇)      │
│              ↓ 같은 비즈니스 모델을                 │
│ [실행 시스템] Marketing Engine  (어떻게 돌아가게)   │
│              ↓ 구체 실행은                          │
│ [하위 구체]   일반 페이지 (General)                 │
└─────────────────────────────────────────────────────┘
```

- 데이터 위계가 아니라 **의미 위계**. 모두 `pages` 테이블에 공존.
- 모든 연결은 **`canvas_mappings` 단일 테이블**로 풀림 (N:N).
- frame과 engine은 **페어**로 묶이는 한 쌍 (`canvas_pair_id`로 그룹핑).

---

## 3. 핵심 솔루션 — 시각 + 정리를 동시에

### 3-1. 트리플 뷰 (Canvas / Board / List)

같은 매핑 데이터를 **세 가지 뷰**로 자유 전환 (`?view=canvas|board|list`):

#### (A) Canvas View — 시각화
- 큰 원(SVG) 위에 영역(Region) 박스가 좌표로 정의됨
- 영역 안에 매핑된 카드들이 **컴팩트 칩**으로 표시
- **카드 밀도 자동 조절**:
  - 5개 이하 → 모든 카드 제목 노출
  - 6~15개 → 우선 N개 + "+9 more" 칩
  - 15개 초과 → 카운트 뱃지 + 도넛(상태별)
- 영역 hover → 미니 통계 / 영역 클릭 → 우측 사이드 패널

#### (B) Board View — 칸반
- 행 = Region, 열 = 사용자 정의 워크플로우 단계
- 카드 드래그로 상태 변경 + 영역 이동

#### (C) List View — 테이블
- Notion DB 같은 테이블 (영역 / 노드 / 제목 / 상태 / 우선순위 / 마감 / 출처 / 매핑일)
- 그룹핑·필터·검색·일괄 편집

### 3-2. 마스터 뷰 / 직원 뷰

같은 데이터를 권한·관점에 따라 다르게 렌더링 (업무일지 데일리와 동일 패턴):

| 측면 | 마스터 뷰 | 직원 뷰 |
|---|---|---|
| 카드 표시 범위 | **전체 카드** | **자기 관련 카드만** (assignee = self) |
| 카드 수정 | **전체 수정 가능** | **자기 카드만 수정** |
| 영역 진단 패널 | 모든 통계·정체율·공백 경고 | 자기 카드 기준 통계 |
| 양식(Region/Node) 편집 | 가능 | 불가 |
| 워크플로우 정의 편집 | 가능 | 불가 |
| 페어(frame-engine) 생성/삭제 | 가능 | 불가 |

→ 데이터는 1벌, 렌더러·권한 필터만 다름.  
→ ThinkMap의 기존 impersonation/마스터 시스템에 정합 (`IMPERSONATION-SPEC.md` 참고).

### 3-3. 카드 메타데이터

| 필드 | 캔버스 표현 | 리스트 표현 |
|---|---|---|
| `status` (사용자 정의) | 좌측 컬러바 (워크플로우 색) | 칼럼 |
| `priority` (P0~P3) | 우측 점/별 | 칼럼 |
| `due_date` | 마감 임박 빨강 / 지남 회색 | 칼럼·정렬 |
| `assignee` | 우상단 아바타 | 칼럼 |
| `tags` | 칩 색 | 칼럼 |
| `note` | 호버 툴팁 | 칼럼 |

### 3-4. 영역 진단 패널 (Region Insight)

각 영역에 대해 자동 계산:

- **밀도**: 카드 n개 (전체 평균 대비 색상)
- **진행률**: Done / 전체
- **정체율**: 7일+ 같은 상태에 머문 비율 (높으면 ⚠)
- **공백 경고**: 카드 0개 영역 강조 (엔진의 균형 점검)
- **출처 페이지 분포**: 어느 업무일지/페이지에서 들어왔는지

### 3-5. 영역 포커스 모드

영역 클릭 → 그 영역만 풀 화면 확대. 빼곡함의 근본 해소책.
- 그 영역 카드만 칸반/리스트로 정리
- 빠른 매핑·이동·일괄 편집
- 영역 메모 (왜 이 영역이 중요한지)

### 3-6. 색의 의미 표준화

- **카드 컬러** = `status` (사용자 정의 워크플로우의 단계 색)
- **태그 컬러** = 사용자 자유
- 의미 충돌 방지

---

## 4. 데이터 모델

### 4-1. pages 테이블 확장
```sql
-- page_type 에 'frame', 'engine' 추가
-- (기존 'daily', 'general' 외 신규)
ALTER TABLE pages
  ADD CONSTRAINT pages_page_type_chk
  CHECK (page_type IN ('daily','general','frame','engine'));
```

### 4-2. 캔버스 페어 (frame ↔ engine 1:1 묶음)
```sql
CREATE TABLE canvas_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  master_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Marketing Canvas',
  frame_page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  engine_page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL DEFAULT 'v7.44',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(frame_page_id),
  UNIQUE(engine_page_id)
);
```

### 4-3. 캔버스 스키마 (영역·노드 좌표) — DB 저장
```sql
CREATE TABLE canvas_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canvas_type TEXT NOT NULL CHECK (canvas_type IN ('frame','engine')),
  version TEXT NOT NULL,                 -- 'v7.44', 'v7.45'…
  background_url TEXT NOT NULL,          -- 큰 원 SVG
  regions JSONB NOT NULL,                -- [{key,label,bbox:[x,y,w,h],nodes:[...]}, …]
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(master_id, canvas_type, version)
);
```

### 4-4. 사용자 정의 워크플로우
```sql
CREATE TABLE canvas_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- '기본 워크플로우'
  steps JSONB NOT NULL,                  -- [{key:'todo',label:'대기',color:'#ddd',order:0}, …]
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 시드: todo / doing / done / blocked
INSERT INTO canvas_workflows(master_id, name, steps, is_default)
VALUES (…, '기본', '[
  {"key":"todo","label":"대기","color":"#9ca3af","order":0},
  {"key":"doing","label":"진행","color":"#3b82f6","order":1},
  {"key":"done","label":"완료","color":"#10b981","order":2},
  {"key":"blocked","label":"막힘","color":"#ef4444","order":3}
]', TRUE);
```

### 4-5. 매핑 테이블 (핵심)
```sql
CREATE TABLE canvas_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  master_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 출처: 블록 또는 페이지 (둘 중 하나)
  source_block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  source_page_id  UUID REFERENCES pages(id)  ON DELETE CASCADE,
  include_descendants BOOLEAN NOT NULL DEFAULT FALSE,  -- 자식 토글까지 포함

  -- 대상
  target_page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  region_key TEXT NOT NULL,
  node_key TEXT,

  -- 카드 메타
  workflow_id UUID REFERENCES canvas_workflows(id),
  status TEXT NOT NULL DEFAULT 'todo',     -- workflow_id의 steps[].key
  priority SMALLINT NOT NULL DEFAULT 2,    -- 0=P0(긴급) … 3=P3
  due_date DATE,
  assignee_id UUID REFERENCES auth.users(id),
  tags TEXT[] DEFAULT '{}',
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (
    (source_block_id IS NOT NULL AND source_page_id IS NULL) OR
    (source_block_id IS NULL AND source_page_id IS NOT NULL)
  )
);

-- 중복 방지 (블록 출처)
CREATE UNIQUE INDEX uniq_canvas_mapping_block ON canvas_mappings (
  source_block_id, target_page_id, region_key, COALESCE(node_key,'')
) WHERE source_block_id IS NOT NULL;

-- 중복 방지 (페이지 출처)
CREATE UNIQUE INDEX uniq_canvas_mapping_page ON canvas_mappings (
  source_page_id, target_page_id, region_key, COALESCE(node_key,'')
) WHERE source_page_id IS NOT NULL;

CREATE INDEX idx_cm_target ON canvas_mappings(target_page_id, region_key);
CREATE INDEX idx_cm_block  ON canvas_mappings(source_block_id);
CREATE INDEX idx_cm_page   ON canvas_mappings(source_page_id);
CREATE INDEX idx_cm_assignee ON canvas_mappings(assignee_id);
CREATE INDEX idx_cm_due    ON canvas_mappings(due_date) WHERE due_date IS NOT NULL;
```

### 4-6. 진단 통계 뷰
```sql
CREATE VIEW canvas_region_stats AS
SELECT
  target_page_id,
  region_key,
  count(*)                                              AS total,
  count(*) FILTER (WHERE status='done')                 AS done_n,
  count(*) FILTER (
    WHERE updated_at < now() - interval '7 days'
      AND status NOT IN ('done')
  )                                                     AS stalled_n,
  max(updated_at)                                       AS last_active
FROM canvas_mappings
GROUP BY target_page_id, region_key;
```

### 4-7. RLS 정책 (마스터/직원 뷰)
```sql
-- 마스터: 자기 master_id의 모든 매핑 조회/수정
-- 직원: 자기 user_id의 매핑만 수정, master 매핑은 조회만
-- (impersonation 시스템과 정합되도록 기존 RLS 패턴 참고)
```

---

## 5. 인터랙션 플로우

### 5-1. 캔버스 페어 생성 (마스터 전용)
- 좌측 사이드바 → "+ 새 마케팅 캔버스" → 이름 입력 → frame + engine 페이지 자동 생성 + 페어 묶음 + 기본 schema/workflow 적용

### 5-2. 매핑 만들기 (3가지 진입점)
1. **업무일지/일반 페이지에서**: 토글 옆 ⋯ → "캔버스에 매핑" → 캔버스/영역/노드 선택 → "자식까지 포함" 체크박스
2. **페이지 자체 매핑**: 페이지 헤더 ⋯ → "이 페이지를 캔버스에 매핑"
3. **캔버스에서**: 우측 사이드바의 토글 풀에서 영역으로 드래그앤드롭

### 5-3. 캔버스에서 카드 다루기
- 카드 클릭 → 원본 토글/페이지로 점프
- 카드 우클릭 → 상태/우선순위/마감 일괄 변경, 매핑 해제, 다른 영역으로 이동
- 영역 클릭 → 우측 패널에 풀 리스트 + 진단

### 5-4. 마스터/직원 뷰 전환
- 마스터: 화면 상단 토글 "마스터 뷰 / 직원 [○○○] 뷰" → 직원의 입장으로 미리보기 가능
- 직원: 본인 뷰 고정. assignee = self 카드만 보임.

### 5-5. 업무일지/일반 페이지에서의 역참조
- 매핑된 토글 옆 작은 아이콘 + 카운트 + 호버 시 "이 토글은 [작마클 캔버스]의 [핵심역량]에 매핑됨"
- 클릭 → 캔버스 영역으로 점프

---

## 6. MVP 범위 (3 Phase)

### Phase 1 — MVP (가치 검증)
- frame 페이지 타입 1종 + 영역 6개 (company / target / action / value / core / vision)
- canvas_pairs / canvas_schemas / canvas_mappings 테이블
- **Canvas View** + 영역 클릭 시 사이드 리스트
- 매핑: 토글 단위, 우클릭 메뉴
- 워크플로우: **시드 4단계 고정** (todo/doing/done/blocked) — 사용자 정의는 Phase 2
- 마스터 뷰 only (직원 뷰는 Phase 2)
- 가치 검증: "내 업무일지가 비즈니스 모델 어디에 기여 중인지 보이는가?"

### Phase 2 — 정리·진단 + 권한
- engine 페이지 타입 + 영역 7개 + 노드 매핑
- frame ↔ engine 페어 묶음
- **Board View / List View** 추가
- 카드 메타 전체 (priority / due / tags / note / assignee)
- **사용자 정의 워크플로우**
- **직원 뷰** + RLS 정합
- 페이지 매핑, 트리(자식 포함) 매핑
- 영역 진단 패널
- 가치 검증: "어디가 비고 어디가 막혔는지 보이는가? 권한별로 잘 보이는가?"

### Phase 3 — 워크플로우/공유
- 영역 포커스 모드 + 영역 메모
- 자문 고객별 멀티 캔버스
- 캔버스 공유 (읽기 전용 / 협업)
- 자동 추천 매핑 (태그/키워드 기반)
- 양식 v7.45 호환 마이그레이션 도구

---

## 7. 다음 단계

1. **이 기획서 v0.3 검토 후 OK** → v1.0으로 승격
2. **Phase 1 와이어프레임 3장**:
   - 캔버스 뷰 (큰 원 + 영역 + 카드 + 사이드 패널)
   - 매핑 메뉴 (토글에서 우클릭 → 모달)
   - 영역 사이드 패널 (카드 리스트 + 진단)
3. **마이그레이션 SQL 초안**: pages 확장 + 4개 신규 테이블 + RLS
4. **canvas schema 시드 JSON** (frame v7.44 좌표 정의)
5. **컴포넌트 트리 설계** (CanvasViewer / RegionLayer / CardChip / RegionPanel / WorkflowEditor)
6. **구현 착수** — `TOGGLE-BLOCK-SPEC.md` 체크리스트 병행

---

## 부록 A — 네이밍

- 기능 이름: **마케팅 캔버스 매핑** (UI: "마케팅 캔버스")
- DB 테이블 prefix: `canvas_*`
- page_type 값: `frame`, `engine`

## 부록 B — 양식 버전 호환

양식 업그레이드(v7.44 → v7.45) 시:
- `canvas_schemas`에 새 버전 row 추가
- `region_key` 변경분은 마이그레이션 매핑 정의 (예: `core` → `core_value`)
- 기존 매핑 데이터 보존 + 자동 키 변환

## 부록 C — 기존 ThinkMap 시스템과의 정합

- **마스터/직원 = impersonation 시스템**: `IMPERSONATION-SPEC.md`의 master_id/user_id 패턴 그대로 사용
- **블록/토글 매핑**: `TOGGLE-BLOCK-SPEC.md`의 토글 ID 안정성 가정에 의존 (토글 삭제 시 매핑도 CASCADE)
- **페이지 시스템**: 기존 `pages.page_type` 확장 + `parent_id` 활용 가능
- **soft-delete**: pages.deleted_at 정합 — 삭제된 페이지의 매핑은 자동 숨김

---

*v0.3 — 2026-05-10. 9가지 핵심 결정 확정. 다음: 와이어프레임 + 마이그레이션 SQL.*
