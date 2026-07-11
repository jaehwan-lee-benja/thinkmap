# 마케팅 캔버스 매핑 — 컴포넌트 트리 / 라우팅 / 훅 설계 (Phase 1)

> 부속 문서: [MARKETING-CANVAS-MAPPING-PLAN.md](./MARKETING-CANVAS-MAPPING-PLAN.md) · [MARKETING-CANVAS-WIREFRAMES.md](./MARKETING-CANVAS-WIREFRAMES.md)
>
> 본 문서의 목적: ThinkMap 의 기존 컴포넌트/훅 구조 컨벤션에 정합되는 코드 골격을 정의하고, 의존성 그래프를 따라 안정적 구현 순서를 제시한다.
>
> ⚠️ **SITE-SPLIT Phase 3(2026-07-09) 이후 — 구조가 바뀜:** 캔버스는 독립 위성 `apps/canvas`(`/thinkmap/canvas/`)다. 컴포넌트/훅은 `src/components/Canvas`·`src/hooks/useCanvas*`에서 **`apps/canvas/src`로 이관**됨(`@thinkmap/core` supabase 사용). **§4-2 사이드바 페어 그룹핑=폐기**(모선이 frame/engine 페이지 fetch 안 함, 진입=런처 링크). **§4-3/4-4 토글 "캔버스에 매핑"(MapToCanvasModal)·역참조 뱃지(MappingBadge)=크로스앱 재설계 필요·미구현(보류)** — 위성 분리로 "같은 프로세스 내 TipTap 확장" 전제가 깨짐. 상세=docs/SITE-SPLIT-PLAN.md §8 Phase 3.

---

## 1. 폴더 구조 (신규)

```
src/components/Canvas/
├── CanvasViewer.jsx               # 메인 컨테이너 (page_type='frame'|'engine' 일 때 렌더)
├── CanvasBackground.jsx           # SVG 배경 (큰 원)
├── RegionLayer.jsx                # 영역(Region) 박스 + hover/클릭
├── NodeLayer.jsx                  # 노드(Node) 점 + 라벨
├── CardChip.jsx                   # 매핑 카드 1개 (영역 내)
├── CardCluster.jsx                # 같은 영역의 카드 묶음 + 밀도 자동 조절
├── RegionPanel.jsx                # 우측 영역 사이드 패널 (W3)
├── RegionDiagnosticsBar.jsx       # 하단 진단바 (정체/공백 요약)
├── ToggleSidePalette.jsx          # 우측 토글 풀 (드래그 소스)
├── CreateCanvasModal.jsx          # 캔버스 페어 생성 모달 (W4)
├── MapToCanvasModal.jsx           # 토글 → 캔버스 매핑 모달 (W2)
├── MappingBadge.jsx               # 토글 옆 🎯 카운트 (W6)
├── ViewSwitcher.jsx               # Canvas / Board / List 토글
├── BoardView.jsx                  # Phase 2
├── ListView.jsx                   # Phase 2
├── canvasUtils.js                 # 좌표 변환, 밀도 계산
└── index.js                       # 외부 export

src/hooks/  (기존 폴더에 추가)
├── useCanvasPair.js               # 페어 + frame/engine page 정보
├── useCanvasPairs.js              # 마스터의 모든 페어 목록
├── useCanvasSchema.js             # 영역/노드 좌표
├── useCanvasMappings.js           # 페이지의 모든 카드
├── useCanvasMappingsForBlocks.js  # 역참조 (W6) — block id 다중 조회
├── useCanvasRegionStats.js        # 진단 통계 (view 조회)
├── useCanvasWorkflow.js           # 워크플로우 단계
└── useCanvasMutations.js          # 매핑 INSERT/UPDATE/DELETE
```

---

## 2. 컴포넌트 책임 / Props

### CanvasViewer
**역할**: 캔버스 페이지의 최상위 컨테이너. `pages.page_type` 이 `frame` 또는 `engine` 일 때 `App.jsx` 가 TipTapEditor 대신 이걸 렌더.

```jsx
<CanvasViewer
  pageId={page.id}              // pages.id
  pairId={pair.id}              // canvas_pairs.id (페이지에서 lookup)
  canvasType="frame"            // 'frame' | 'engine'
  effectiveSession={session}    // impersonation 정합
  isMaster={boolean}            // 마스터 뷰 여부
/>
```

**내부 구성**
```
<CanvasViewer>
  <ViewSwitcher /> (상단)
  ├── Canvas mode:
  │     <div class="canvas-stage">
  │       <CanvasBackground viewbox={schema.viewbox} bgUrl={schema.background_url} />
  │       <RegionLayer regions={schema.regions} mappings={mappings} onRegionClick={…} />
  │       <NodeLayer  regions={schema.regions} />
  │       <CardCluster ... per region />
  │     </div>
  │     <RegionPanel /> (조건부 슬라이드 인)
  │     <ToggleSidePalette /> (우측)
  │     <RegionDiagnosticsBar /> (하단)
  ├── Board mode (Phase 2):
  │     <BoardView />
  └── List mode (Phase 2):
        <ListView />
</CanvasViewer>
```

### CanvasBackground
SVG 배경. `viewbox` 와 `background_url` 받아서 `<svg viewBox=...><image href=… /></svg>`. 드래그/줌 기능은 Phase 2.

### RegionLayer
영역 박스를 SVG 또는 absolute-positioned div 로 렌더. props:
```jsx
<RegionLayer
  regions={schema.regions}
  selectedRegionKey={…}
  hoverRegionKey={…}
  onRegionHover={(key)=>…}
  onRegionClick={(key)=>…}
/>
```

### CardCluster
한 영역의 카드들을 모아서 배치. **밀도 자동 조절** 로직 (canvasUtils.js):
- `count <= 5` → `<CardChip>` 모두 노출
- `count <= 15` → 우선 N개 + `<MoreChip count={count-N}/>`
- `count > 15` → `<DensityBadge count counts={byStatus}/>` (도넛)

```jsx
<CardCluster
  region={region}
  mappings={mappingsInRegion}
  workflow={workflow}
  onCardClick={(mapping)=>…}
  onCardContextMenu={(mapping, evt)=>…}
/>
```

### CardChip
카드 1개. 좌측 컬러바(status 색), 우측 priority 점, 마감 임박 빨강.
```jsx
<CardChip
  mapping={mapping}
  workflow={workflow}
  onClick={…}
  onContextMenu={…}
  draggable
/>
```

### RegionPanel
영역 클릭 시 우측에서 슬라이드 인 (W3).
```jsx
<RegionPanel
  region={region}
  pairId={…}
  pageId={…}
  stats={regionStats}
  mappings={mappingsInRegion}
  workflow={workflow}
  onClose={…}
/>
```

내부:
- 진단 박스 (stats)
- 출처 분포
- 카드 리스트 (정렬 토글 + 정체 카드 그룹)
- "+ 새 카드 매핑" 버튼

### RegionDiagnosticsBar
하단 띠. 영역별 정체·공백 한 줄 요약.

### ToggleSidePalette
우측 사이드. 사용자의 업무일지/일반 페이지에서 **아직 매핑되지 않은** 토글 후보 표시. 드래그 소스 (HTML5 drag-and-drop).

### CreateCanvasModal
"+ 새 마케팅 캔버스" 클릭 시 (W4). 트랜잭션 RPC `create_canvas_pair(...)` 호출.

### MapToCanvasModal
토글 ⋯ → "캔버스에 매핑" 클릭 시 (W2). 캔버스 / 영역 / 노드 / 메타 입력 → `canvas_mappings` INSERT.

### MappingBadge
업무일지/일반 페이지의 토글 옆 🎯 (W6). 카운트와 호버 툴팁.
```jsx
<MappingBadge blockId={…} />
```
내부에서 `useCanvasMappingsForBlocks([blockId])` 사용.

### ViewSwitcher
Canvas / Board / List 토글. URL `?view=` 와 동기화. Phase 1 은 Canvas만 활성, 나머지는 disabled.

---

## 3. 훅 명세

### useCanvasPair(pairId)
```js
const { pair, framePage, enginePage, schema, workflow, isLoading } = useCanvasPair(pairId)
```
- canvas_pairs + 양쪽 pages + canvas_schemas (canvas_type 별) + 기본 workflow 한 번에 fetch
- `effectiveSession` 사용 (impersonation 정합)

### useCanvasPairs()
- 현재 마스터(또는 임퍼소네이션 대상)의 모든 페어 목록. Sidebar 트리에서 사용.

### useCanvasSchema(masterId, canvasType, version='v7.44')
- 좌표 단독 조회. 페어 hook 안에서 호출되거나 관리자 편집 화면에서 직접 사용.

### useCanvasMappings(targetPageId, options)
```js
const { mappings, byRegion, isLoading, refresh } = useCanvasMappings(pageId, {
  status: 'all' | 'todo' | …,
  assignee: userId | 'all',
})
```
- `byRegion`: `{ region_key: mapping[] }` 형태로 가공해 CardCluster 가 빠르게 사용.
- 직원 뷰일 때 RLS 가 자동 필터 (assignee_id = self), 클라이언트 필터는 보조.

### useCanvasMappingsForBlocks(blockIds)
- `blockIds` 배열을 받아 `{ [blockId]: mapping[] }` 반환. W6의 🎯 뱃지용.
- 업무일지/페이지 렌더링 시 bulk 조회 1회로 N+1 방지.

### useCanvasRegionStats(targetPageId)
- `canvas_region_stats` view 조회. RegionPanel 와 RegionDiagnosticsBar 가 공유.

### useCanvasWorkflow(masterId)
- 마스터의 기본 워크플로우. CardChip의 status → color 매핑에 사용.

### useCanvasMutations()
```js
const {
  createPair,         // RPC create_canvas_pair
  createMapping,      // INSERT canvas_mappings
  updateMapping,      // UPDATE (status, region_key, …)
  deleteMapping,      // soft delete (deleted_at)
  bulkUpdateStatus,   // 다중 카드 상태 변경
} = useCanvasMutations()
```
- 옵티미스틱 업데이트 + 실패 시 롤백.
- 모든 mutation 후 `useCanvasMappings` invalidate.

---

## 4. 라우팅 / 진입점 통합

### 4-1. App.jsx — 페이지 타입 분기
기존 페이지 렌더러 분기 지점에 `frame`/`engine` 추가:
```jsx
{page.page_type === 'daily'  && <Worklog … />}
{page.page_type === 'normal' && <TipTapEditor … />}
{(page.page_type === 'frame' || page.page_type === 'engine') &&
  <CanvasViewer pageId={page.id} canvasType={page.page_type} … />}
```

### 4-2. Sidebar — 캔버스 트리 노드
사이드바 페이지 트리에 frame/engine 페이지가 자동 등장. 아이콘만 다르게 (🎯 또는 ◯).
- 페어로 묶인 두 페이지는 한 그룹 아래 (`canvas_pairs.name` 노드 + 자식 frame/engine).
- 마스터: "+ 새 마케팅 캔버스" 버튼 노출 → CreateCanvasModal.

### 4-3. TipTapEditor — 토글 ⋯ 메뉴 확장
기존 토글 메뉴(`Worklog/`, `TipTapEditor/` 둘 다)에 항목 1개 추가:
```
⋯
├── 복사
├── …
└── 캔버스에 매핑    ← NEW
```
클릭 시 MapToCanvasModal 열림. `blockId` 전달.

### 4-4. TipTapEditor — 토글 옆 MappingBadge
토글 헤더 우측에 `<MappingBadge blockId={…} />` 렌더. `useCanvasMappingsForBlocks` 가 페이지 단위 bulk 조회.

### 4-5. GlobalTopBar — 직원 뷰 토글 (Phase 2)
기존 impersonation 드롭다운에 그대로 정합. 추가 UI 없음.

---

## 5. 기존 파일에 미치는 영향

| 파일 | 변경 |
|---|---|
| `src/App.jsx` | 페이지 타입 분기에 frame/engine 추가 (5줄) |
| `src/components/Sidebar/*` | 페어 그룹 렌더링 + 새 캔버스 버튼 (마스터) |
| `src/components/TipTapEditor/*` | 토글 ⋯ 메뉴에 "캔버스에 매핑" + MappingBadge 렌더 |
| `src/components/Worklog/*` | 동일 (업무일지의 토글에서도 매핑 가능) |
| `src/hooks/usePages.js` | (변경 없음, page_type 처리 추가만) |

> ⚠ 토글 메뉴 수정 시 [TOGGLE-BLOCK-SPEC.md](./TOGGLE-BLOCK-SPEC.md) 체크리스트 필수.

---

## 6. 의존성 그래프 (구현 순서)

```
[DB 마이그레이션]  migrate-add-canvas-mapping.sql
        │
        ├──→ useCanvasWorkflow         (시드 워크플로우 조회)
        ├──→ useCanvasSchema           (영역 좌표 조회)
        ├──→ useCanvasPair / useCanvasPairs
        ├──→ useCanvasMutations.createPair
        │           │
        │           └──→ CreateCanvasModal       (W4)
        │                       │
        │                       └──→ Sidebar 진입점
        │
        ├──→ useCanvasMappings (read)
        │           │
        │           ├──→ CardChip · CardCluster
        │           │           │
        │           │           └──→ CanvasViewer + CanvasBackground + RegionLayer  (W1)
        │           │
        │           └──→ useCanvasRegionStats
        │                       │
        │                       ├──→ RegionPanel        (W3)
        │                       └──→ RegionDiagnosticsBar
        │
        ├──→ useCanvasMutations.createMapping
        │           │
        │           └──→ MapToCanvasModal               (W2)
        │                       │
        │                       └──→ TipTapEditor 토글 ⋯ 메뉴
        │
        └──→ useCanvasMappingsForBlocks
                    │
                    └──→ MappingBadge                   (W6)
                                │
                                └──→ TipTapEditor / Worklog 토글 헤더
```

---

## 7. Phase 1 구현 순서 (안정적)

각 단계는 이전 단계가 동작해야 의미가 있음:

| # | 작업 | 산출물 | 검증 |
|---|---|---|---|
| 1 | DB 마이그레이션 적용 | 5 테이블 + view + 함수 | psql `\d canvas_*` |
| 2 | useCanvasWorkflow + useCanvasSchema | 훅 2개 | 콘솔에서 데이터 확인 |
| 3 | useCanvasPair + useCanvasMutations.createPair | 훅 + RPC 호출 | RPC 직접 호출로 페어 1개 생성 |
| 4 | CreateCanvasModal + Sidebar 진입점 | 캔버스 페어 UI 생성 | UI에서 페어 생성 가능 |
| 5 | App.jsx 분기 추가 | frame 페이지 열기 | 빈 캔버스 표시 |
| 6 | CanvasBackground + RegionLayer + NodeLayer | 큰 원 + 영역 박스 표시 | 영역 호버/클릭 동작 |
| 7 | useCanvasMappings + CardChip + CardCluster | 카드 표시 | 매핑 데이터 INSERT 후 보임 |
| 8 | MapToCanvasModal + 토글 ⋯ 메뉴 | 매핑 생성 UI | UI로 매핑 생성 → 캔버스에 즉시 반영 |
| 9 | useCanvasRegionStats + RegionPanel | 영역 클릭 시 사이드 패널 | 진단 통계 표시 |
| 10 | RegionDiagnosticsBar | 하단 진단 띠 | |
| 11 | useCanvasMappingsForBlocks + MappingBadge | 토글 옆 🎯 | 토글에서 매핑 위치 확인 가능 |
| 12 | ToggleSidePalette + 드래그앤드롭 | 우측 풀에서 영역으로 매핑 | drop 시 매핑 생성 |
| 13 | 통합 테스트 + TOGGLE-BLOCK-SPEC 체크리스트 | 회귀 검증 | |

---

## 8. 코드 컨벤션

- 함수형 컴포넌트 + hooks (ThinkMap 표준)
- CSS: 기존 패턴 따라 css 파일 또는 inline style — 폴더의 다른 컴포넌트 따라가기
- 디자인: [DESIGN-PHILOSOPHY.md](./DESIGN-PHILOSOPHY.md) 의 건조한 스타일 — 폰트 크기/장식 최소화
- props 검증: 기존 패턴이 PropTypes 또는 TS 인지 확인 후 동일하게
- impersonation: 모든 데이터 hook 은 `effectiveSession` 사용 (기존 useProjects/usePages 패턴)

---

## 9. 다음 단계

- 본 문서 검토 후 OK → 구현 착수 (의존성 그래프 1번부터)
- 첫 마일스톤: **5번까지 완료 — 빈 캔버스가 화면에 뜨는 것**. 거기서 시각적으로 확인 후 다음 단계.
