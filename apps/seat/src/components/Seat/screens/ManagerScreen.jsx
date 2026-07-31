// 주문서관리 화면 — 주문 입력 테이블(전체폭) + 카메라. (SEAT-SPEC §9.2)
// 자리후/올림/완료·제조현황 요약은 앱바 '현황'(모든 역할 공용 StatusOverview)으로 이동.
import OrderRow from '../components/OrderRow'
import LiveCameraFeed from '../components/LiveCameraFeed'

export default function ManagerScreen({ orders = [], onPatch, onCommit, onCreate, settings = {} }) {
  return (
    <div className="seat-screen seat-screen-manager">
      <div className="seat-toolbar">
        <button className="seat-btn seat-btn-primary seat-btn-new-order" onClick={() => onCreate?.()}>+ 새 주문</button>
      </div>

      <div className="seat-table" role="table">
        {/* 헤더 = 그룹 제목 1행. 각 제목 아래 데이터가 위/아래 2칸으로 들어간다(상태·자리후 / 자리순서·제조옵션 / 올림·특이사항). */}
        <div className="seat-row seat-row-head" role="row">
          <div className="seat-cell seat-cell-no">테이블링</div>
          <div className="seat-cell seat-cell-order">주문번호</div>
          <div className="seat-cell seat-cell-hg1">상태</div>
          <div className="seat-cell seat-cell-hg2">자리순서</div>
          <div className="seat-cell seat-cell-hg3">올림</div>
          <div className="seat-cell seat-cell-confirm">확인</div>
        </div>
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
