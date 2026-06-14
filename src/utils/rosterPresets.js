// 배치도(roster) 프리셋 상수 — docs/MEMBER-SPEC.md §5.4 / PLAN-member-roster.md §1.
// 역할은 프리셋 + 자유입력 병행. 슬라이드(멤버 배치도) 패턴에서 정규화.

export const ROSTER_ROLE_PRESETS = [
  '커피',
  '아이스크림',
  '서포트',
  '빵자르기',
  '포장',
  '카이막',
  '설거지',
  '홀·자리안내',
  '반납대',
  '마감보조',
  '매니저',
  '이사',
]

export const ROSTER_SHIFTS = ['오픈', '마감', '종일']

// 역할별 세부 업무 — 보드 뷰 포지션 카드에 표시. 슬라이드 패턴(PLAN-roster-visual-board §7).
// Phase B(DB 템플릿)에서 roster_template_slots.tasks 로 대체/오버라이드 예정. 그 전까지 표시 기본값.
export const ROLE_TASKS = {
  '커피': '샷, 스팀, 컵준비',
  '아이스크림': '아이스크림, 계산',
  '서포트': '쟁반 셋팅, 주문서 정리, 호출',
  '빵자르기': '카이막 뜨기, 빵, 설거지, 반납대',
  '포장': '카이막, 포장(카이막·말렌카)',
  '카이막': '카이막 뜨기, 반납대, 물기닦기',
  '설거지': '설거지',
  '홀·자리안내': '홀 관리, 자리 안내',
  '반납대': '반납대, 물기 닦기',
  '마감보조': '홀, 물기 (마감)',
  '매니저': '',
  '이사': '운영 이사',
}

// 배치 상태 — planned/worked 가 Phase 1 주력. 나머지는 근무요청 허브(Phase 2)용.
export const ROSTER_STATUS = [
  { value: 'planned', label: '예정' },
  { value: 'worked', label: '근무확정' },
  { value: 'requested', label: '요청중' },
  { value: 'accepted', label: '수락' },
  { value: 'declined', label: '거절' },
  { value: 'tentative', label: '미정' },
]

export const ROSTER_STATUS_LABEL = Object.fromEntries(
  ROSTER_STATUS.map((s) => [s.value, s.label])
)

// 급여 매칭(Phase 3)에서 "근무로 셈" 대상 상태.
export const ROSTER_COUNTED_STATUSES = ['planned', 'worked', 'accepted']

export const MEMBER_STATUS = [
  { value: 'active', label: '재직' },
  { value: 'inactive', label: '비활성' },
  { value: 'resigned', label: '퇴사' },
]
export const MEMBER_STATUS_LABEL = Object.fromEntries(
  MEMBER_STATUS.map((s) => [s.value, s.label])
)

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

// 인사 이력(member_records) 타입
export const MEMBER_RECORD_TYPES = [
  { value: 'health_cert', label: '보건증' },
  { value: 'contract', label: '계약' },
  { value: 'training', label: '교육' },
  { value: 'counseling', label: '상담' },
  { value: 'other', label: '기타' },
]
export const MEMBER_RECORD_TYPE_LABEL = Object.fromEntries(
  MEMBER_RECORD_TYPES.map((t) => [t.value, t.label])
)
