// 자리안내 화면 — 입력 핵심. (SEAT-SPEC §9.1)
// 하단에 카이막·커피 현황 거울(읽기) 표시. 카메라 없음.
import OrderRow from '../components/OrderRow'
import { STATIONS } from '../config/seatRoles'

export default function GuideScreen({ orders = [], stations = [], onPatch, onCreate }) {
  return (
    <div className="seat-screen seat-screen-guide">
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
          <div className="seat-cell seat-cell-raise">올림</div>
          <div className="seat-cell seat-cell-notes">특이사항</div>
        </div>
        {orders.length === 0 ? (
          <div className="seat-empty">주문이 없습니다. “+ 새 주문”으로 추가하세요.</div>
        ) : (
          orders.map((o) => <OrderRow key={o.id} order={o} onPatch={onPatch} canMenuOut={false} />)
        )}
      </div>

      {/* 하단 거울: 카이막·커피 현황(읽기). TODO: stations 데이터 연결. */}
      <section className="seat-mirror">
        <div className="seat-mirror-title">제조 현황</div>
        <div className="seat-mirror-stations">
          {STATIONS.map((s) => (
            <div key={s.key} className="seat-mirror-col">
              <div className="seat-mirror-col-title">{s.label}</div>
              <div className="seat-mirror-col-body">— 연결 예정 —</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
