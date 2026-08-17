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

// ── R11: 자리후 전달의 갈래(deliver_mode) — '전달'과 같은 위계의 분기(유저 지시 2026-08-03) ────
//   '포장도고려' = "자리가 나면 앉겠지만, 주문은 일단 포장으로 간다".
//   제조옵션(전달 *후* 변경기록)이 아니라 전달 그 자체의 갈래라서 자리큐 규칙(R1)은 건드리지 않는다
//   — 자리순서는 계속 살아있고, 달라지는 건 '주방이 이 사실을 알아야 하는가' 하나뿐이다.
//     · maybe_store(영수증 매장)  → 주방엔 포장이 새 정보 → 올림은 평소대로, 카드에 '포장' 라벨.
//     · maybe_receipt(영수증 포장) → 주방은 이미 포장으로 제조 중(자리후 우회) → 올림 자체가 무의미 → 무시.
//   NULL/없음 = 일반 전달.
export const DELIVER_MODES = [
  { value: 'maybe_store',   label: '포장도고려(매장)', desc: '영수증 매장' },
  { value: 'maybe_receipt', label: '포장도고려(포장)', desc: '영수증 포장' },
]
export const isTakeoutMaybe = (o) => !!o?.deliver_mode && DELIVER_MODES.some((m) => m.value === o.deliver_mode)
export const deliverModeLabel = (o) => DELIVER_MODES.find((m) => m.value === o?.deliver_mode)?.label || ''
// 올림 카드에 '포장' 라벨이 붙는가 — 제조옵션 포장으로변경 또는 포장도고려(매장).
export const showsTakeoutLabel = (o) => !!o?.opt_takeout || o?.deliver_mode === 'maybe_store'
// 올림이 무시되는 주문 — 포장도고려(포장영수증). 스테이션에 아예 나타나지 않는다(올라감·대기 양쪽).
export const raiseIgnored = (o) => o?.deliver_mode === 'maybe_receipt'

// R2(폐지, 2026-08-02 유저 지시): '자리앉음을 눌러야 올리기 전달이 활성' 선행조건을 없앴다.
//   실제 주방에서 자리 배정과 제조 올림은 순서가 고정돼 있지 않은데, 게이팅이 절차를 꼬았다.
//   현재 올림의 유일한 관문은 '자리후 전달'(OrderRow.preDeliver) 하나다.
//   ※자리앉음의 ✕(해당없음) 표시 규칙(seatToggleLocked)은 그대로 유지 — 그건 상태 표시라 유효.

// 스테이션/매니저 화면 목록 분류 (순수)
// 자리후 '대기중' = 실내 + ★전달됨(seat_delivered) + 아직 안 올라감(!raised) + 자리큐 유지(야외/포장 아님) + 취소 아님.
//   ★seat_order_alive(자리앉음→'필요없음' 표시)는 여기서 보지 않는다 — 자리앉아도 올림 전까지 자리후 카드는 남는다
//   (자리앉음은 자리순서 셀의 상태 표시일 뿐, 자리후 대기 여부와 별개. 유저 지시 2026-08-01).
//   ★포장도고려(포장영수증)은 스테이션에서 통째로 빠진다(raiseIgnored) — 주방은 이미 포장으로 만들고 있어
//     '곧 올라올 대기'가 아니다. 그 줄은 자리안내·주문서관리 표에만 자리순서로 남는다(R11).
//   ★R12 아카이빙된 줄(archived_at)도 제외 — 안내가 끝난 건은 더 이상 '곧 올라올 대기'가 아니다.
//     단 올라감(isRaisedOrder)은 아카이빙과 무관하게 유지한다 — 제조 진행/완료 판단은 스테이션 몫(R6 독립).
export const isWaitingOrder = (o) =>
  isDineIn(o) && !!o?.seat_delivered && !o?.raised && !removesFromSeatQueue(o)
  && !raiseIgnored(o) && !o?.archived_at && o?.seat_status !== 'canceled'
// 올림(자리잡음)된 주문. ★포장도고려(포장영수증)은 raised 여부와 무관하게 올림에서 제외(R11).
export const isRaisedOrder = (o) => !!o?.raised && !raiseIgnored(o)

// R12: 안내 완료(아카이빙) 여부 — 완료 리스트로 옮겨진 줄. 삭제(deleted_at)와 별개 축.
export const isArchived = (o) => !!o?.archived_at

// 올림 경로 라벨.
const RAISE_LABEL = { takeout: '포장으로변경', outdoor: '야외', parallel: '야외병행', direct: '직접체크' }

// 올리기 전달 '세부 설명' — 어떤 경로로 올림 전달이 이뤄졌는지(또는 취소됐는지) 텍스트.
//   야외/포장/야외병행 = 제조옵션으로 올림 / 직접체크 = 제조옵션 없이 올리기 체크박스를 직접.
//   raise_canceled(text: 취소 당시 방식)가 최우선 — 취소 시 제조옵션·raised 를 되돌리므로 방식 흔적을 여기 남겨
//   '올림취소됨(야외)'처럼 한 스텝 히스토리를 보여준다. falsy 면 취소 이력 없음.
export const raiseDetailText = (o) => {
  if (o?.raise_canceled) return `올림취소됨(${RAISE_LABEL[o.raise_canceled] || ''})`
  if (!o?.raised) return ''
  if (o?.opt_takeout) return '포장으로변경'
  if (o?.opt_outdoor) return '야외'
  if (o?.opt_outdoor_parallel) return '야외병행'
  return '직접체크'
}
// 주문 표시 번호 — 주문번호 우선, 없으면 자리대기번호.
export const orderLabel = (o) => o?.order_no || (o?.queue_no != null ? String(o.queue_no) : '-')

// 같은 테이블링 번호 줄을 서로 붙여서 보여준다 — ★표시 전용(DB·생성순·정렬 규칙 무변경).
//   한 테이블링 번호에 주문번호(영수증)가 여러 장 걸리는 실제 케이스(유저 2026-08-03) 때문에,
//   나중에 추가한 같은 번호 줄이 표 맨 아래로 떨어져 짝을 눈으로 못 찾던 문제를 없앤다.
//   그룹의 자리 = 그 번호가 처음 나온 위치. 번호 없는 줄('+주문번호만')은 있던 자리 그대로.
export function groupByQueue(orders = []) {
  const out = []
  const done = new Set()
  for (const o of orders) {
    const k = o?.queue_no > 0 ? o.queue_no : null
    if (k == null) { out.push(o); continue }
    if (done.has(k)) continue
    done.add(k)
    for (const x of orders) if (x?.queue_no === k) out.push(x)
  }
  return out
}

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

// ── 쓰기 헬퍼 (리팩토링 ⑵, 2026-08-09) ─────────────────────────────────────
// ★왜: `seat_status` 와 `raised` 는 **같은 사실을 두 번 적는다**. 둘을 손으로 맞추는 지점이 11곳이었고,
//   한 곳만 빠뜨리면 «올림인데 pending» 같은 유령 상태가 만들어져 스테이션 목록(isRaisedOrder)과
//   통계(seatStats)가 서로 다른 답을 낸다. 지금까지 맞아 있던 건 구조가 보장해서가 아니라 우연이었다.
//   ⇒ 짝을 **여기서만** 맞춘다. 컬럼은 그대로 둔다(DB 마이그 없음).
//   ※`seat_status` 를 파생값으로 강등하는 건 별건이다 — 여기서는 «두 번 적되 한 곳에서 적는다» 까지만.

const nowISO = () => new Date().toISOString()

// 올림 켜기. 시각은 **이미 올라간 줄이면 그 시각을 유지**하고, 아니면 지금을 찍는다.
//   (호출부 4곳이 조금씩 다른 식을 쓰고 있었지만, 도달 가능한 상태에서는 전부 이 식과 같다 —
//    올림을 풀 때 raised_at 을 항상 null 로 지우기 때문에 «raised=false 인데 raised_at 이 남은» 상태가 없다.)
export const raisePatch = (o, now = nowISO()) => ({
  raised: true,
  raised_at: o?.raised ? o.raised_at : now,
  seat_status: 'raised',
  raise_canceled: null,
})

// 올림 끄기. canceled 를 주면 취소 이력(raise_canceled)까지 함께 정한다.
//   · undefined = 이력 손대지 않음(갈래 전환처럼 «취소가 아닌» 해제, R11)
//   · null      = 이력 지움(자리순서 리셋)
//   · 'takeout'|'outdoor'|'parallel'|'direct' = 그 방식으로 취소했음을 남김(R10)
export const unraisePatch = (canceled = undefined) => ({
  raised: false,
  raised_at: null,
  seat_status: 'pending',
  ...(canceled === undefined ? {} : { raise_canceled: canceled }),
})

// 자리대기 취소 = 상태 + 자리순서 종료 + 완료 탭으로(R12). 세 가지가 항상 함께 간다.
export const cancelPatch = (now = nowISO()) => ({
  seat_status: 'canceled',
  seat_order_alive: false,
  archived_at: now,
})

// 취소 건을 대기열로 되돌리기 — 취소 전 상태를 따로 저장하지 않으므로 raised 로 판정해 복원한다.
export const uncancelPatch = (o) => ({
  seat_status: o?.raised ? 'raised' : 'pending',
  seat_order_alive: true,
})

// 자리후 전달(R8) — 전달 시각은 통계 구간(주문→전달 / 전달→올림)에 쓰인다.
export const deliverPatch = (now = nowISO()) => ({
  seat_status: 'pending',
  seat_delivered: true,
  delivered_at: now,
})

// 자리후 전달 **해제** — deliverPatch 의 역방향. 세 키가 항상 함께 간다
//   (전달 플래그·전달 시각·전달 갈래). 주문번호를 비우면 전달도 풀리는 규칙(유저 지시 2026-08-02)이
//   표 입력·키패드·전달 체크박스 **세 곳**에서 같은 세 키를 손으로 적고 있었다.
export const undeliverPatch = () => ({
  seat_delivered: false,
  delivered_at: null,
  deliver_mode: null,
})

// R10 «올림취소 방식» 판정 — ★**optOf 와 같은 하나의 순서**를 쓴다(2026-08-17 수렴).
//   전에는 여기만 «포장 먼저»였고 optOf 는 «야외 먼저»라, 두 컬럼이 동시에 true 인 행에서
//   **화면 드롭다운은 「야외」인데 올림취소 이력은 「포장」**으로 갈렸다. 순서가 둘이면 언젠가 갈린다.
//   미뤄 온 이유는 「구 데이터에 그런 행이 있는지 몰라서」였다 — **실측으로 닫았다**(orch 승인, 읽기 전용 1쿼리):
//     `seat_orders` 294행 중 동시 true = **1행**(2026-07-20, id a1000000-…-0004 = 손으로 만든 시드 꼴).
//     그 1행은 `raised=false` · `raise_canceled=null` 이라 **이 함수가 애초에 호출되지 않는다** ⇒ 관측 영향 **0**.
//   ⇒ 순서를 optOf 로 통일한다. 단일 true 행에서는 두 순서가 원래 같은 답을 내므로
//     **도달 가능한 모든 데이터에서 동작 동일**이고, 그 1행은 이제 드롭다운과 같은 라벨을 받는다(갈림 해소).
//   ※함수 본문에서 참조하므로 정의 순서는 무관하다(호출 시점엔 모듈 const 가 모두 초기화돼 있다).
export const raiseMethodOf = (o) => {
  const v = optOf(o)
  return v === OPT_NONE ? 'direct' : v
}

// 제조옵션(야외/포장/야외병행) — 실제로는 **단일 선택**인데 boolean 3개로 저장한다.
//   여기를 통하면 «셋 중 둘이 켜진» 상태를 코드가 만들 수 없다. v: 'outdoor'|'takeout'|'parallel'|'none'
export const OPT_NONE = 'none'
export const optOf = (o) => o?.opt_outdoor ? 'outdoor'
  : o?.opt_takeout ? 'takeout'
  : o?.opt_outdoor_parallel ? 'parallel' : OPT_NONE
export const optPatch = (v) => ({
  opt_outdoor: v === 'outdoor',
  opt_takeout: v === 'takeout',
  opt_outdoor_parallel: v === 'parallel',
})
// 야외병행 — 올림이 걸려도 **자리순서가 살아있는** 유일한 상태(완료 버튼 파랑의 근거, §9.0).
export const isParallel = (o) => !!o?.opt_outdoor_parallel
