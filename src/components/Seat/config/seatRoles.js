// 자리후 시스템 — 역할·스테이션 정의 (데이터화: 하드코딩 금지, 명세 SEAT-SPEC §5)
//
// 역할/스테이션 추가는 이 파일의 배열만 수정하면 된다. DB 스키마 변경 불필요
// (orders.created_by_role / station_status.station 이 text 컬럼이기 때문).

// 제조 스테이션 — '동일 시스템, 이름만 다름'. 서로 독립(R6).
export const STATIONS = [
  { key: 'kaymak', label: '카이막' },
  { key: 'coffee', label: '커피' },
]

// 역할 4종. 역할 추가 예: { key: 'dessert', label: '디저트', camera: true, station: 'dessert', canMenuOut: false }
export const ROLES = [
  { key: 'guide',   label: '자리안내',   camera: false, station: null,     canMenuOut: false },
  { key: 'manager', label: '제조매니저', camera: true,  station: null,     canMenuOut: true  }, // R5
  { key: 'kaymak',  label: '카이막',     camera: true,  station: 'kaymak', canMenuOut: false },
  { key: 'coffee',  label: '커피',       camera: true,  station: 'coffee', canMenuOut: false },
]

// 상태선택(review_flag). 기본 '-'(=none, R3).
export const REVIEW_FLAGS = [
  { value: 'none',     label: '-' },
  { value: '확인필요', label: '확인필요' },
  { value: '주문중',   label: '주문중' },
  { value: '차후주문', label: '차후주문' },
]

export const DEFAULT_ROLE = 'guide'
export const ROLE_STORAGE_KEY = 'thinkmap.seat.role' // 태블릿별 마지막 역할 기억(키오스크)

export const getRole = (key) => ROLES.find((r) => r.key === key) || null
export const getStation = (key) => STATIONS.find((s) => s.key === key) || null
