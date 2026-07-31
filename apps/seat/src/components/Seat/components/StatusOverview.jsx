// 통합 현황 — 모든 역할(자리안내·주문서관리·카이막·커피)이 같은 정보를 본다. (앱바 '현황' 모달 안)
// 자리후(대기중)·올림·완료 + 카이막·커피 제조현황. 읽기 전용 요약이라 역할 구분 없이 공용.
import QueueChips from './QueueChips'
import { STATIONS } from '../config/seatRoles'
import { isWaitingOrder, isRaisedOrder } from '../utils/seatRules'

export default function StatusOverview({ orders = [], stations = [] }) {
  const waiting = orders.filter(isWaitingOrder)
  const raised = orders.filter(isRaisedOrder)
  // 어느 스테이션이든 완료면 '완료'로 집계(주문서관리 관점과 동일).
  const isDone = (o) => stations.some((s) => s.order_id === o.id && s.completed)
  const active = raised.filter((o) => !isDone(o))
  const completed = raised.filter(isDone)

  return (
    <div className="seat-manager-side">
      <div className="seat-panel">
        <div className="seat-panel-title">자리 후 (대기중)</div>
        <div className="seat-panel-body"><QueueChips orders={waiting} empty="— 대기 없음 —" /></div>
      </div>
      <div className="seat-panel">
        <div className="seat-panel-title">올림 (자리잡음)</div>
        <div className="seat-panel-body"><QueueChips orders={active} empty="— 올림 없음 —" /></div>
      </div>
      <div className="seat-panel">
        <div className="seat-panel-title">완료된 리스트</div>
        <div className="seat-panel-body"><QueueChips orders={completed} empty="— 완료 없음 —" done /></div>
      </div>
      {/* 제조 현황 거울 — 카이막·커피(올라감/제조완료함). StationScreen 과 동일 분류(R6). */}
      <div className="seat-panel">
        <div className="seat-panel-title">제조 현황</div>
        <div className="seat-panel-body seat-mirror-stations">
          {STATIONS.map((s) => {
            const done = (o) =>
              !!stations.find((st) => st.order_id === o.id && st.station === s.key)?.completed
            const raisedCount = raised.filter((o) => !done(o)).length // 올라감(아직 미완료)
            const doneCount = raised.filter(done).length             // 제조완료함
            return (
              <div key={s.key} className="seat-mirror-col">
                <div className="seat-mirror-col-title">{s.label}</div>
                <div className="seat-mirror-col-body">올라감 {raisedCount} · 제조완료함 {doneCount}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
