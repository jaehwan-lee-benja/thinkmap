// 주문서관리 화면 — 주문 입력 테이블(전체폭) + 카메라. (SEAT-SPEC §9.2)
// 자리후/올림/완료·제조현황 요약은 앱바 '현황'(모든 역할 공용 StatusOverview)으로 이동.
import OrderRow from '../components/OrderRow'
import LiveCameraFeed from '../components/LiveCameraFeed'
import SeatTableHead from '../components/SeatTableHead'

export default function ManagerScreen({ orders = [], onPatch, onCommit, onCreate, settings = {}, onResizeColumn }) {
  return (
    <div className="seat-screen seat-screen-manager">
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

      {/* 새 주문 = 표 아래·왼쪽(자리안내와 동일 위치, 유저 지시 2026-08-01).
          '+ 주문번호만' = 테이블링(queue_no) 비우고 주문번호만 먼저 기록(자리 배정 후 테이블링 입력). */}
      <div className="seat-toolbar seat-toolbar-below">
        <button className="seat-btn seat-btn-primary" onClick={() => onCreate?.()}>+ 새 주문</button>
        <button className="seat-btn" onClick={() => onCreate?.({ queue_no: null })}>+ 주문번호만</button>
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
