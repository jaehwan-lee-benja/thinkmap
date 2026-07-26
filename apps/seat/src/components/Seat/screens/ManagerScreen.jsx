// 제조매니저 화면 — 자리안내 입력부(전체폭) + 메뉴나감(R5) + 그 아래 카메라/자리후/올림/완료 요약. (SEAT-SPEC §9.2)
// 입력 테이블이 넓어(10열) 사이드를 옆에 두면 좁아지므로, 사이드는 본문 아래 가로 배치.
import OrderRow from '../components/OrderRow'
import LiveCameraFeed from '../components/LiveCameraFeed'
import QueueChips from '../components/QueueChips'
import { isWaitingOrder, isRaisedOrder } from '../utils/seatRules'

export default function ManagerScreen({ role, orders = [], stations = [], onPatch, onCommit, onCreate }) {
  const waiting = orders.filter(isWaitingOrder)
  const raised = orders.filter(isRaisedOrder)
  // 매니저는 두 스테이션을 모니터 — 어느 스테이션이든 완료면 완료로 집계.
  const isDone = (o) => stations.some((s) => s.order_id === o.id && s.completed)
  const active = raised.filter((o) => !isDone(o))
  const completed = raised.filter(isDone)

  return (
    <div className="seat-screen seat-screen-manager">
      <div className="seat-toolbar">
        <button className="seat-btn seat-btn-primary" onClick={() => onCreate?.()}>+ 새 주문</button>
      </div>

      <div className="seat-table" role="table">
        <div className="seat-row seat-row-head" role="row">
          <div className="seat-cell seat-cell-no">대기</div>
          <div className="seat-cell seat-cell-order">주문번호</div>
          <div className="seat-cell seat-cell-status">상태</div>
          <div className="seat-cell seat-cell-deliver">자리후</div>
          <div className="seat-cell seat-cell-opts">제조옵션</div>
          <div className="seat-cell seat-cell-seat">자리순서</div>
          <div className="seat-cell seat-cell-raise">올림 / 메뉴나감</div>
          <div className="seat-cell seat-cell-notes">특이사항</div>
          <div className="seat-cell seat-cell-broadcast">전달</div>
          <div className="seat-cell seat-cell-confirm">확인</div>
        </div>
        {orders.length === 0 ? (
          <div className="seat-empty">주문이 없습니다.</div>
        ) : (
          orders.map((o) => (
            <OrderRow key={o.id} order={o} onPatch={onPatch} onCommit={onCommit} canMenuOut={role?.canMenuOut} gated />
          ))
        )}
      </div>

      {/* 본문 아래 가로 배치: 카메라 + 자리후/올림/완료 요약 */}
      <div className="seat-manager-side">
        <LiveCameraFeed station="manager" label="제조매니저" enabled={false} />
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
      </div>
    </div>
  )
}
