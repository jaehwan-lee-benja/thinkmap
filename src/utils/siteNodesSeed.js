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
    url: '',
    required_role: 'master',
    status: 'live',
    sort_order: 1,
    note: '결합도 0·에디터 불필요 = 위성화 1순위 파일럿(§8 Phase 1). 현재 모놀리스 내 page_type=payroll.',
  },
  {
    id: 'seed-roster',
    name: '자리/인사 (Roster + Members)',
    kind: 'satellite',
    domain: 'members',
    url: '',
    required_role: 'master',
    status: 'live',
    sort_order: 2,
    note: '둘이 한 쌍 → 쌍으로 분리(§8 Phase 2). 현재 page_type=members.',
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
    url: '',
    required_role: 'editor',
    status: 'live',
    sort_order: 5,
    note: '완전 독립 서브트리 → 즉시 분리 가능(§8 Phase 4). 워크스페이스 editor면 진입.',
  },
  {
    id: 'seed-inventory',
    name: '재고 (Inventory)',
    kind: 'satellite',
    domain: 'inventory',
    url: '',
    required_role: 'editor',
    status: 'dev',
    sort_order: 6,
    note: '없음·독립. 권한(파트너 레벨) 확정 전. 즉시 분리 가능(§8 Phase 4).',
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
