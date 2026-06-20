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
}

// 독립 엔티티(project_id = null, 프로젝트에 소속되지 않음) 페이지 타입.
// fetchPages 의 worklog 쿼리 / 프로젝트 쿼리 제외 목록과 동일해야 한다.
export const INDEPENDENT_PAGE_TYPES = [
  PAGE_TYPES.CALENDAR,
  PAGE_TYPES.DAILY,
  PAGE_TYPES.FRAME,
  PAGE_TYPES.ENGINE,
  PAGE_TYPES.SCHEDULE,
  PAGE_TYPES.PAYROLL,
  PAGE_TYPES.DASHBOARD,
  PAGE_TYPES.MEMBERS,
  PAGE_TYPES.GOAL,
]

// 마스터에게만 사이드바 트리에 노출되는 타입.
export const MASTER_ONLY_PAGE_TYPES = [
  PAGE_TYPES.FRAME,
  PAGE_TYPES.ENGINE,
  PAGE_TYPES.PAYROLL,
  PAGE_TYPES.MEMBERS,
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

// 일반 페이지 = 명시적 'normal' 또는 미설정(legacy NULL). 기존 비교 로직과 동일.
export const isNormalPage = (page) => {
  const t = typeOf(page)
  return t == null || t === PAGE_TYPES.NORMAL
}
