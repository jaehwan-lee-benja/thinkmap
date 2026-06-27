// 자리후 비즈니스 규칙 R1·R2 파생 상태 — 순수 함수(데이터/권한/네트워크 무관).
// 화면·행 컴포넌트가 공통으로 쓰고, 단위 테스트도 쉬운 형태로 둔다. (SEAT-SPEC §10)

// 제조옵션(야외/포장/야외병행) 중 하나라도 체크됐는가.
export const hasManufactureOption = (o) =>
  !!(o?.opt_outdoor || o?.opt_takeout || o?.opt_outdoor_parallel)

// R1: 제조옵션이 하나라도 있으면 그 주문은 '자리후'가 아니다 → 자리후(자리순서) 컨트롤 비활성.
export const isSeatWaiting = (o) => !hasManufactureOption(o)

// R2: 자리앉음 또는 올리기 전달이 되어야(또는 제조옵션이 있어야) 제조(올림) 칸이 활성화된다.
export const isRaiseEnabled = (o) => !!(o?.seated || o?.raised) || hasManufactureOption(o)

// 스테이션/매니저 화면 목록 분류 (순수)
// 자리후 '대기중': 아직 안 올라가고, 제조옵션 없고, 순서 살아있고, 취소 아님.
export const isWaitingOrder = (o) =>
  !o?.raised && !hasManufactureOption(o) && o?.seat_order_alive !== false && o?.seat_status !== 'canceled'
// 올림(자리잡음)된 주문.
export const isRaisedOrder = (o) => !!o?.raised
// 주문 표시 번호 — 주문번호 우선, 없으면 자리대기번호.
export const orderLabel = (o) => o?.order_no || (o?.queue_no != null ? String(o.queue_no) : '-')
