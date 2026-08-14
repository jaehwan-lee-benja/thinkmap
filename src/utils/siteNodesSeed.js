// 사이트 구조도(Site Map) — 노드 상수 + 시드 config.
//
// docs/SITE-SPLIT-PLAN.md §4(모선+위성 구조) / §3(도메인 분리 난이도) 를 데이터로 옮긴 것.
// 이 시드는 두 용도로 쓰인다:
//   1) site_nodes DB 테이블이 아직 없거나(마이그 미적용) 비어 있을 때의 로컬 미리보기.
//   2) migrate-create-site-nodes.sql 의 초기 seed INSERT 원본(동일 값).
// → DB 테이블이 채워지면 useSiteNodes 가 자동으로 DB 값을 쓴다(이 시드는 폴백일 뿐).
//
// 이 페이지가 만든 노드 데이터가 곧 "위성 런처"(다른 사이트로 가는 링크 타일)의 소스다.

// ── 열거값 (DB CHECK 제약과 동일하게 유지) ──────────────────────────────────
export const NODE_KINDS = ['hub', 'satellite']
export const NODE_KIND_LABEL = { hub: '모선(Hub)', satellite: '위성(Satellite)' }

export const NODE_STATUSES = ['live', 'dev', 'planned']
export const NODE_STATUS_LABEL = { live: '운영중', dev: '개발중', planned: '계획' }

// 필요 역할 — ACCESS-TIERS 등급 + 특수값(master=사내 사장님 / member=로그인 전원 / public)
export const NODE_ROLES = ['public', 'member', 'viewer', 'editor', 'master']
export const NODE_ROLE_LABEL = {
  public: '공개',
  member: '로그인 전원',
  viewer: 'viewer',
  editor: 'editor',
  master: 'master',
}

// ── 시드 노드 (SITE-SPLIT-PLAN §4 다이어그램) ───────────────────────────────
// id 는 로컬 폴백에서만 쓰는 안정 문자열 키(DB 모드에선 uuid 로 대체됨).
// domain = 현 모놀리스의 page_type (분할 후엔 위성 도메인 키). url = 런처 링크 타깃.
// url 이 비면 "현 모놀리스 내부 page_type 진입"을 의미(아직 독립 URL 없음).
export const SITE_NODES_SEED = [
  {
    id: 'seed-hub',
    name: '모선 (ThinkMap 본체)',
    kind: 'hub',
    domain: 'hub',
    url: '/thinkmap/',
    required_role: 'member',
    status: 'live',
    sort_order: 0,
    note: '직원 공유 페이지·업무일지·캘린더·목표. TipTap 에디터+셸+인증 코어가 사는 곳. 절대 쪼개지 않는다.',
  },
  {
    id: 'seed-payroll',
    name: '급여 (Payroll)',
    kind: 'satellite',
    domain: 'payroll',
    url: '/thinkmap/payroll/',
    required_role: 'master',
    status: 'live',
    sort_order: 1,
    note: '§8 Phase 1 위성 분리 완료(apps/payroll). 마스터 전용·에디터 불필요. DB 트랙 파일럿(payroll_sheets_ws_owner_v2 병행).',
  },
  {
    id: 'seed-roster',
    name: '배치도 (Roster)',
    kind: 'hub',
    domain: 'members',
    url: '/thinkmap/',
    required_role: 'master',
    status: 'live',
    sort_order: 2,
    note: '★모선 잔류 확정 — roster(배치도)는 TipTapTestPage 데일리 에디터(RosterCard)에 결합("업무일지 분리 금지"). member 공유모듈(useMembers/sortMembers/rosterPresets)은 Phase 5 에서 @thinkmap/core 로 추출해 members 위성과 공유.',
  },
  {
    id: 'seed-members',
    name: '멤버 관리 (Members, 인사 마스터)',
    kind: 'satellite',
    domain: 'members',
    url: '/thinkmap/members/',
    required_role: 'master',
    status: 'live',
    sort_order: 2,
    note: '§8 Phase 5 위성 분리 완료(apps/members). 마스터 전용·page 독립. member 도메인 공유모듈은 core 추출(모선 roster 와 공유).',
  },
  {
    id: 'seed-canvas',
    name: '마케팅 캔버스 (Canvas)',
    kind: 'satellite',
    domain: 'engine',
    url: '/thinkmap/canvas/',
    required_role: 'master',
    status: 'live',
    sort_order: 3,
    note: '§8 Phase 3 위성 분리 완료(apps/canvas). 생성·목록·매핑 전면 자립. frame/engine 페어 = 한 앱. (daily_blocks 의존은 실코드상 없었음)',
  },
  {
    id: 'seed-dashboard',
    name: '통합 대시보드 (Dashboard)',
    kind: 'satellite',
    domain: 'dashboard',
    url: '',
    required_role: 'master',
    status: 'live',
    sort_order: 4,
    note: '목표(goals) 집계. 마스터 전용. 현재 page_type=dashboard.',
  },
  {
    id: 'seed-seat',
    name: '자리후 (Seat, 주방 실시간)',
    kind: 'satellite',
    domain: 'seat',
    url: '/thinkmap/seat/',
    required_role: 'editor',
    status: 'live',
    sort_order: 5,
    note: '§8 Phase 4 위성 분리 완료(apps/seat). page 독립·워크스페이스 RLS·Realtime. 워크스페이스 editor면 진입.',
  },
  {
    id: 'seed-inventory',
    name: '재고 (Inventory)',
    kind: 'satellite',
    domain: 'inventory',
    url: '/thinkmap/inventory/',
    required_role: 'editor',
    status: 'live',
    sort_order: 6,
    note: '§8 Phase 2 위성 분리 완료(apps/inventory). 없음·독립. 로그인 사용자 노출(세부 권한 게이트는 향후 RLS).',
  },
  {
    id: 'seed-expense',
    name: '지출 분류 (Expense)',
    kind: 'satellite',
    domain: 'asset',
    // ★로컬 전용 위성 — gh-pages 에 안 올린다. 큐에 «품목명+금액»(사업 재무)이 들어가는데
    //   공개 저장소로 나가면 안 되고, 원천도 asset 도메인의 로컬 SQLite 라 Edge 로 서빙할 수 없다.
    //   ⇒ 맥미니에서 로컬 서버로 돌고 폰은 같은 와이파이로 붙는다(warroom 과 같은 성질).
    //   저장 위치 승인이 나면 URL 을 /thinkmap/expense/ 로 바꾸고 어댑터(expenseSource.js)만 Edge 로 교체한다.
    url: 'http://Mac-mini.local:5180/',
    required_role: 'owner',
    status: 'local',
    sort_order: 8,
    note: '§8 Phase 8(2026-08-14). 미분류 지출을 폰에서 원탭 분류. 데이터=asset 계약 spend-queue@1 파일 교환(msg/spend-queue/). 실행: node apps/expense/server.js',
  },
  {
    id: 'seed-crmboard',
    name: 'CRM 보드 (운영보드·월보)',
    kind: 'satellite',
    domain: 'crm',
    url: '/thinkmap/crmboard/',
    required_role: 'master',
    status: 'live',
    sort_order: 7,
    note: '§12 Phase7 위성 분리 완료(apps/crmboard). 마스터 전용·지표(crm_metrics/engine-metrics-sync)+투두 2레인. PII 통로(FDW A3+B2+C1)는 위성 위 부착 예정.',
  },
]

// 로컬 폴백에서 새 노드 draft 기본값.
export const EMPTY_NODE_DRAFT = {
  name: '',
  kind: 'satellite',
  domain: '',
  url: '',
  required_role: 'master',
  status: 'planned',
  sort_order: 0,
  note: '',
}
