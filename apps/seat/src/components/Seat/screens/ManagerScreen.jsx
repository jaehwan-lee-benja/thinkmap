// 주문서관리 화면 — 주문 입력 테이블(전체폭) + 카메라. (SEAT-SPEC §9.2)
// 자리후/올림/완료·제조현황 요약은 앱바 '현황'(모든 역할 공용 StatusOverview)으로 이동.
import OrderRow from '../components/OrderRow'
import LiveCameraFeed from '../components/LiveCameraFeed'
import SeatTableHead from '../components/SeatTableHead'

export default function ManagerScreen({ orders = [], onPatch, onCommit, onCreate, settings = {}, onResizeColumn }) {
  return (
    <div className="seat-screen seat-screen-manager">
      <div className="seat-toolbar">
        <button className="seat-btn seat-btn-primary" onClick={() => onCreate?.()}>+ 새 주문</button>
      </div>

      <div className="seat-table" role="table">
        <SeatTableHead resizable={!!onResizeColumn} onResize={onResizeColumn} />
        {orders.length === 0 ? (
          <div className="seat-empty">주문이 없습니다.</div>
        ) : (
          orders.map((o) => (
            <OrderRow key={o.id} order={o} onPatch={onPatch} onCommit={onCommit} gateMode="manager" />
          ))
        )}
      </div>

      {/* 카메라는 계속 지켜보는 것이라 화면에 그대로 둔다(설정에서 끄면 아예 렌더 안 됨). */}
      {settings.cameraEnabled ? (
        <div className="seat-manager-side">
          <LiveCameraFeed station="manager" label="주문서관리" enabled={false} />
        </div>
      ) : null}
    </div>
  )
}
