// 주문 번호 칩 목록(자리후 대기·올림·완료 등). 표시 전용. (SEAT-SPEC §9.2/§9.3)
import { orderLabel } from '../utils/seatRules'

// ★`empty` 에 기본값을 두지 않는다(2026-08-18). 전에는 `'— 없음 —'` 이 기본이었는데,
//   이 부품은 **읽기에 성공했는지 알 수 없다** — 그런데 기본값은 「없다」고 **단정**한다.
//   호출부만이 loadState 를 알고, 그래서 문구도 호출부가 `emptyText(loadState, …)` 로 만들어 넘긴다.
//   빠뜨리면 아무것도 안 나온다 — 조용하지만, **틀린 말을 하는 것보다 낫다**(단일점 ②의 교훈).
export default function QueueChips({ orders = [], empty, done = false }) {
  if (!orders.length) return <div className="seat-chips-empty">{empty}</div>
  return (
    <div className="seat-chips">
      {orders.map((o) => (
        <span key={o.id} className={`seat-chip${done ? ' seat-chip-done' : ''}`}>{orderLabel(o)}</span>
      ))}
    </div>
  )
}
