// 페이지 타입 단일 정의 + 분류 헬퍼.
//
// 그동안 `page_type === 'daily'` 같은 문자열 비교가 코드 전반(특히 TipTapTestPage)에
// 산재해 있었다. 새 코드 경로가 이 체크를 빠뜨리면 데일리를 일반 페이지처럼 취급해
// content_tiptap 을 덮어쓰는 등의 사고가 날 수 있다. 여기서 단일 출처로 중앙화한다.
//
// 동작은 기존 문자열 비교와 100% 동일 — 단순 치환용.

export const PAGE_TYPES = {
  NORMAL: 'normal',
  DAILY: 'daily',
  CALENDAR: 'calendar',
  SCHEDULE: 'schedule',
  FRAME: 'frame',
  ENGINE: 'engine',
  PAYROLL: 'payroll',
  DASHBOARD: 'dashboard',
  MEMBERS: 'members',
  GOAL: 'goal',
  INVENTORY: 'inventory',
  SEAT: 'seat',
  BACKOFFICE: 'backoffice',
}

// 독립 엔티티(project_id = null, 프로젝트에 소속되지 않음) 페이지 타입.
// fetchPages 의 worklog 쿼리 / 프로젝트 쿼리 제외 목록과 동일해야 한다.
// ※ FRAME/ENGINE(마케팅 캔버스)은 Phase 3 에서 별도 위성(apps/canvas)으로 분리됨 →
//   모선은 더 이상 캔버스 페이지를 fetch/렌더하지 않는다(트리 미노출). 진입=사이드바 런처 → /thinkmap/canvas/.
export const INDEPENDENT_PAGE_TYPES = [
  PAGE_TYPES.CALENDAR,
  PAGE_TYPES.DAILY,
  PAGE_TYPES.SCHEDULE,
  PAGE_TYPES.PAYROLL,
  PAGE_TYPES.DASHBOARD,
  PAGE_TYPES.GOAL,
  PAGE_TYPES.BACKOFFICE,
]
// ※ 위성으로 분리된 page_type(INVENTORY·SEAT·MEMBERS·FRAME·ENGINE)은 모선이 fetch/트리노출하지 않는다.
//   진입=사이드바 런처(src/config/satellites.js 레지스트리). PAYROLL 만 page-scoped(?page=)라 아래 잔류.

// 마스터에게만 사이드바 트리에 노출되는 타입.
export const MASTER_ONLY_PAGE_TYPES = [
  PAGE_TYPES.PAYROLL,
  PAGE_TYPES.BACKOFFICE,
]

// page 객체 또는 page_type 문자열 모두 허용 (호출부 다양성 대응)
const typeOf = (page) => (typeof page === 'string' ? page : page?.page_type)

export const isDailyPage = (page) => typeOf(page) === PAGE_TYPES.DAILY
export const isCalendarPage = (page) => typeOf(page) === PAGE_TYPES.CALENDAR
export const isSchedulePage = (page) => typeOf(page) === PAGE_TYPES.SCHEDULE
export const isPayrollPage = (page) => typeOf(page) === PAGE_TYPES.PAYROLL
export const isDashboardPage = (page) => typeOf(page) === PAGE_TYPES.DASHBOARD
export const isMembersPage = (page) => typeOf(page) === PAGE_TYPES.MEMBERS
// 목표 = 최상위 레이어. 렌더·편집은 일반 페이지와 동일(자유 텍스트, 별도 필드 없음).
export const isGoalPage = (page) => typeOf(page) === PAGE_TYPES.GOAL
// 재고 관리 = 독립 엔티티(전역 단일). 권한 게이트는 #6(파트너 레벨 확정)에서 결합.
export const isInventoryPage = (page) => typeOf(page) === PAGE_TYPES.INVENTORY
// 자리후 시스템 = 키오스크 풀스크린 모듈(워크스페이스 editor면 진입). 마스터 전용 아님.
export const isSeatPage = (page) => typeOf(page) === PAGE_TYPES.SEAT
// 백오피스 = 사이트 구조도(모선+위성) 관리. 마스터 전용.
export const isBackofficePage = (page) => typeOf(page) === PAGE_TYPES.BACKOFFICE

// 일반 페이지 = 명시적 'normal' 또는 미설정(legacy NULL). 기존 비교 로직과 동일.
export const isNormalPage = (page) => {
  const t = typeOf(page)
  return t == null || t === PAGE_TYPES.NORMAL
}
