// 자리안내 화면 — 입력 핵심. (SEAT-SPEC §9.1 / 슬라이드 자리안내)
// 명시 전달 체크박스(자리후 전달·자리앉음·올리기 전달) + 확인필요 플래그. 카메라 없음.
// 제조현황 등 요약은 앱바 '현황'(모든 역할 공용 StatusOverview)으로 이동.
import { useState } from 'react'
import OrderRow from '../components/OrderRow'
import SeatTableHead from '../components/SeatTableHead'
import { queueSuffixes } from '../utils/seatRules'

export default function GuideScreen({ orders = [], onPatch, onCommit, onCreate, onReorder, onSortByNumber, onResizeColumn, onDelete }) {
  const [dragIdx, setDragIdx] = useState(null)
  const canReorder = !!onReorder // 순서 이동 핸들은 재배열 콜백이 있을 때만(현재 프리뷰)
  const suffixMap = queueSuffixes(orders) // 중복 테이블링 번호 → 1-a,1-b
  return (
    <div className="seat-screen seat-screen-guide">
      {/* 표 위 왼쪽: 드래그로 흐트러진 순서를 테이블링 번호순으로 되돌린다. */}
      {onSortByNumber && (
        <div className="seat-toolbar seat-toolbar-above">
          <button className="seat-btn" onClick={onSortByNumber}>번호 맞춰 정렬하기</button>
        </div>
      )}
      <div className="seat-table" role="table">
        <SeatTableHead resizable={!!onResizeColumn} onResize={onResizeColumn} />
        {orders.length === 0 ? (
          <div className="seat-empty">주문이 없습니다. “+ 새 주문”으로 추가하세요.</div>
        ) : (
          orders.map((o, i) => (
            <OrderRow
              key={o.id}
              order={o}
              onPatch={onPatch}
              onCommit={onCommit}
              gateMode="guide"
              dragHandleProps={canReorder ? {
                draggable: true,
                onDragStart: (e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' },
                onDragEnd: () => setDragIdx(null),
              } : null}
              rowDropProps={canReorder ? {
                onDragOver: (e) => e.preventDefault(),
                onDrop: (e) => { e.preventDefault(); if (dragIdx != null && dragIdx !== i) onReorder(dragIdx, i); setDragIdx(null) },
              } : null}
              onDelete={onDelete}
              dupSuffix={suffixMap[o.id]}
            />
          ))
        )}
      </div>

      {/* 새 주문 추가 = 표 아래, 왼쪽 정렬.
          시작 갈래(order_origin) 선택 UI는 두지 않는다(유저 지시 2026-07-31) —
          새 주문은 DB 기본값 dine_in(실내)로 생성되고, 포장·야외 전환은 '야외·포장' 열에서 기록한다. */}
      <div className="seat-toolbar seat-toolbar-below">
        <button className="seat-btn seat-btn-primary seat-btn-new-order" onClick={() => onCreate?.()}>+ 새 주문</button>
        {/* '+ 주문번호만' = 테이블링(queue_no) 비우고 주문번호만 먼저 기록(자리 배정 후 테이블링 입력). */}
        <button className="seat-btn" onClick={() => onCreate?.({ queue_no: null })}>+ 주문번호만</button>
      </div>
    </div>
  )
}
