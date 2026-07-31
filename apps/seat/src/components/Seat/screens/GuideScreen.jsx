// 자리안내 화면 — 입력 핵심. (SEAT-SPEC §9.1 / 슬라이드 자리안내)
// 명시 전달 체크박스(자리후 전달·자리앉음·올리기 전달) + 확인필요 플래그. 카메라 없음.
// 제조현황 등 요약은 앱바 '현황'(모든 역할 공용 StatusOverview)으로 이동.
import OrderRow from '../components/OrderRow'

export default function GuideScreen({ orders = [], onPatch, onCommit, onCreate }) {
  return (
    <div className="seat-screen seat-screen-guide">
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
          <div className="seat-empty">주문이 없습니다. “+ 새 주문”으로 추가하세요.</div>
        ) : (
          orders.map((o) => (
            <OrderRow key={o.id} order={o} onPatch={onPatch} onCommit={onCommit} gateMode="guide" />
          ))
        )}
      </div>

      {/* 새 주문 추가 = 표 아래, 왼쪽 정렬.
          시작 갈래(order_origin) 선택 UI는 두지 않는다(유저 지시 2026-07-31) —
          새 주문은 DB 기본값 dine_in(실내)로 생성되고, 포장·야외 전환은 '야외·포장' 열에서 기록한다. */}
      <div className="seat-toolbar seat-toolbar-below">
        <button className="seat-btn seat-btn-primary seat-btn-new-order" onClick={() => onCreate?.()}>+ 새 주문</button>
      </div>
    </div>
  )
}
