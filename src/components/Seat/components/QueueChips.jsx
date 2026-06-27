// 주문 번호 칩 목록(자리후 대기·올림·완료 등). 표시 전용. (SEAT-SPEC §9.2/§9.3)
import { orderLabel } from '../utils/seatRules'

export default function QueueChips({ orders = [], empty = '— 없음 —', done = false }) {
  if (!orders.length) return <div className="seat-chips-empty">{empty}</div>
  return (
    <div className="seat-chips">
      {orders.map((o) => (
        <span key={o.id} className={`seat-chip${done ? ' seat-chip-done' : ''}`}>{orderLabel(o)}</span>
      ))}
    </div>
  )
}
