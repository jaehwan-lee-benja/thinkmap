/**
 * 업무일지 관련 상수
 */

// 고정 섹션 ID (worklog_sections 테이블의 PK)
export const SECTION_IDS = {
  TODO: 'fixed_todo',
  NOTICE: 'fixed_notice',
  WRAPUP: 'fixed_wrapup',
  DAILY_ISSUE: 'fixed_daily_issue',
}

// 기본 투두 섹션 ID (이월 fallback, QuickTodo 기본 대상 등)
export const DEFAULT_SECTION_ID = SECTION_IDS.TODO

// DB 조회 실패 시 사용할 기본 섹션 정의
export const FALLBACK_SECTIONS = [
  { id: SECTION_IDS.TODO, title: '할 일', section_type: 'fixed', sort_order: 1, visibility: 'all', parent_id: null },
  { id: SECTION_IDS.NOTICE, title: '전달사항', section_type: 'fixed', sort_order: 2, visibility: 'all', parent_id: null },
  { id: SECTION_IDS.WRAPUP, title: '마무리 기록', section_type: 'fixed', sort_order: 3, visibility: 'all', parent_id: null },
  { id: SECTION_IDS.DAILY_ISSUE, title: '당일 이슈', section_type: 'fixed', sort_order: 4, visibility: 'all', parent_id: SECTION_IDS.WRAPUP },
]
