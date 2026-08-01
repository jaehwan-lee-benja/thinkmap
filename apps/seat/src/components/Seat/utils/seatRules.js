// 자리후 비즈니스 규칙 R1·R2 파생 상태 — 순수 함수(데이터/권한/네트워크 무관).
// 화면·행 컴포넌트가 공통으로 쓰고, 단위 테스트도 쉬운 형태로 둔다. (SEAT-SPEC §10)

// 제조옵션(야외/포장/야외병행) 중 하나라도 체크됐는가.
export const hasManufactureOption = (o) =>
  !!(o?.opt_outdoor || o?.opt_takeout || o?.opt_outdoor_parallel)

// 주문 시작 갈래(도메인 모델, order_origin). 실내(dine_in)만 자리후 전달 관문 대상.
// 하위호환: 값 없으면(마이그 전/구데이터) 실내로 간주.
export const isDineIn = (o) => (o?.order_origin ?? 'dine_in') === 'dine_in'

// 자리 순서(대기 줄)에서 빠지는 제조옵션 = 야외/포장만. ★야외병행은 자리순서 유지(실내 자리 나면 입장).
export const removesFromSeatQueue = (o) => !!(o?.opt_outdoor || o?.opt_takeout)

// R1: 제조옵션이 하나라도 있으면 그 주문은 '자리후'가 아니다 → 자리후(자리순서) 컨트롤 비활성.
export const isSeatWaiting = (o) => !hasManufactureOption(o)

// R2: 자리앉음/올림, 또는 자리큐서 빠지는 제조옵션(야외/포장), 또는 포장/야외 시작 주문이면 올림 활성.
//     ★야외병행은 자리순서 유지 → 자리앉음 전엔 올림 비활성(실내 자리 나면 입장).
export const isRaiseEnabled = (o) => !!(o?.seated || o?.raised) || removesFromSeatQueue(o) || !isDineIn(o)

// 스테이션/매니저 화면 목록 분류 (순수)
// 자리후 '대기중': 실내 시작 + 아직 안 올라감 + 자리큐 유지(야외/포장로 안 빠짐, 야외병행은 유지) + 순서 살아있음 + 취소 아님.
export const isWaitingOrder = (o) =>
  isDineIn(o) && !o?.raised && !removesFromSeatQueue(o) && o?.seat_order_alive !== false && o?.seat_status !== 'canceled'
// 올림(자리잡음)된 주문.
export const isRaisedOrder = (o) => !!o?.raised
// 주문 표시 번호 — 주문번호 우선, 없으면 자리대기번호.
export const orderLabel = (o) => o?.order_no || (o?.queue_no != null ? String(o.queue_no) : '-')

// 같은 테이블링 번호(queue_no>0)를 여러 주문이 쓰면(중복) 리스트에서 1-a,1-b 로 구분.
// 반환 = { orderId: 'a'|'b'|... } — 중복 그룹에 속한 주문만 포함(단일 사용은 접미사 없음).
export function queueSuffixes(orders = []) {
  const groups = new Map()
  for (const o of orders) {
    if (o?.queue_no > 0) {
      if (!groups.has(o.queue_no)) groups.set(o.queue_no, [])
      groups.get(o.queue_no).push(o.id)
    }
  }
  const map = {}
  for (const ids of groups.values()) {
    if (ids.length < 2) continue
    ids.forEach((id, i) => { map[id] = String.fromCharCode(97 + i) }) // a, b, c…
  }
  return map
}
