// 제조매니저 화면 — 자리안내 입력부 + 메뉴나감(R5) + 카메라 + 자리후/완료 패널. (SEAT-SPEC §9.2)
import OrderRow from '../components/OrderRow'
import LiveCameraFeed from '../components/LiveCameraFeed'

export default function ManagerScreen({ role, orders = [], stations = [], onPatch, onCreate }) {
  return (
    <div className="seat-screen seat-screen-manager">
      <div className="seat-screen-grid">
        <div className="seat-col-main">
          <div className="seat-toolbar">
            <button className="seat-btn seat-btn-primary" onClick={() => onCreate?.()}>+ 새 주문</button>
          </div>
          <div className="seat-table" role="table">
            <div className="seat-row seat-row-head" role="row">
              <div className="seat-cell seat-cell-no">대기</div>
              <div className="seat-cell seat-cell-order">주문번호</div>
              <div className="seat-cell seat-cell-status">상태</div>
              <div className="seat-cell seat-cell-opts">제조옵션</div>
              <div className="seat-cell seat-cell-seat">자리순서</div>
              <div className="seat-cell seat-cell-raise">올림 / 메뉴나감</div>
              <div className="seat-cell seat-cell-notes">특이사항</div>
            </div>
            {orders.length === 0 ? (
              <div className="seat-empty">주문이 없습니다.</div>
            ) : (
              orders.map((o) => (
                <OrderRow key={o.id} order={o} onPatch={onPatch} canMenuOut={role?.canMenuOut} />
              ))
            )}
          </div>
        </div>

        <aside className="seat-col-side">
          <LiveCameraFeed station="manager" label="제조매니저" enabled={false} />
          <div className="seat-panel">
            <div className="seat-panel-title">자리후 (대기중)</div>
            <div className="seat-panel-body">— 연결 예정 —</div>
          </div>
          <div className="seat-panel">
            <div className="seat-panel-title">완료된 리스트</div>
            <div className="seat-panel-body">— 연결 예정 —</div>
          </div>
        </aside>
      </div>
    </div>
  )
}
