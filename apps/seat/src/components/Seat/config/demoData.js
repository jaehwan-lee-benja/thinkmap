// 프리뷰(로그인 우회) 전용 데모 데이터 — 로컬 메모리로만 쓰인다(DB·Realtime 무관).
// 여러 상태(전달 전/후·올림·확인필요·포장·완료)를 한눈에 보도록 대표 케이스를 깔아둔다.
// ★dev 전용 진입(SeatApp 의 import.meta.env.DEV 가드) — 프로덕션 빌드에선 로드되지 않는다.

// seat_orders 한 행의 기본값(누락 필드 = DB 컬럼 기본값과 동일).
const orderDefaults = {
  order_no: '',
  seat_status: 'pending',
  review_flag: 'none',
  opt_outdoor: false,
  opt_takeout: false,
  opt_outdoor_parallel: false,
  seat_order_alive: true,
  order_origin: 'dine_in',
  seat_delivered: false,
  seated: false,
  raised: false,
  raised_at: null,
  menu_out: false,
  confirm_flag: false,
  confirm_done: false,
  notes: '',
}

export const withOrderDefaults = (o) => ({ ...orderDefaults, ...o })

export const DEMO_ORDERS = [
  // 1) 실내·전달 전 → 게이팅(제조옵션부터 잠김) 확인
  { id: 'd1', queue_no: 1, order_no: '101', order_origin: 'dine_in', seat_delivered: false },
  // 2) 실내·전달 후·자리앉음 → 올리기 활성 확인
  { id: 'd2', queue_no: 2, order_no: '102', seat_delivered: true, seated: true },
  // 3) 실내·올림·확인필요(미완료) → 양 화면 하이라이트 확인
  { id: 'd3', queue_no: 3, order_no: '103', seat_delivered: true, seated: true, raised: true, seat_status: 'raised', confirm_flag: true, confirm_done: false, notes: '얼음 적게' },
  // 4) 포장 옵션 → 자리순서 필요없음(자리앉음 ✕) 확인
  { id: 'd4', queue_no: 4, order_no: '104', seat_delivered: true, opt_takeout: true },
  // 5) 실내·올림 → 스테이션(카이막/커피) 완료 대상
  { id: 'd5', queue_no: 5, order_no: '105', seat_delivered: true, seated: true, raised: true, seat_status: 'raised' },
  // 6) 실내·올림·이미 카이막 완료 → 완료 리스트/되돌리기 확인
  { id: 'd6', queue_no: 6, order_no: '106', seat_delivered: true, seated: true, raised: true, seat_status: 'raised' },
].map(withOrderDefaults)

export const DEMO_STATIONS = [
  { order_id: 'd6', station: 'kaymak', completed: true, completed_at: '2026-07-31T09:00:00Z', change_note: '' },
]
