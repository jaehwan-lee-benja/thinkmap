// 자리안내·주문서관리 공통 주문 화면 — 둘 다 풀 기능·같은 위계(유저 지시 2026-08-01).
//   차이(게이팅·카메라·순서핸들·정렬) 제거: 모든 컨트롤 활성(gateMode 없음), 순서핸들·정렬·삭제·리사이즈·카메라 동일.
import { useState, useEffect } from 'react'
import OrderRow from '../components/OrderRow'
import SeatTableHead from '../components/SeatTableHead'
import LiveCameraFeed from '../components/LiveCameraFeed'
import SeatNumpad from '../components/SeatNumpad'
import { queueSuffixes } from '../utils/seatRules'

export default function SeatOrderScreen({
  role, orders = [], onPatch, onCommit, onCreate,
  onReorder, onSortByNumber, onResizeColumn, onDelete, settings = {},
}) {
  const [dragIdx, setDragIdx] = useState(null)
  const canReorder = !!onReorder // 순서 이동 핸들은 재배열 콜백이 있을 때만
  const suffixMap = queueSuffixes(orders) // 중복 테이블링 번호 → 1-a,1-b

  // 번호모달(숫자 키패드) — 켜면 테이블링/주문번호 입력이 태블릿 키보드 대신 모달로 뜬다.
  //   ★역할별로 따로 저장(기기별) — 주문서관리만 켜는 경우가 많다. role 전환 시 리마운트되어 각자 로드.
  const numpadKey = `seat.numpad.${role?.key || 'x'}`
  const [numpadOn, setNumpadOn] = useState(() => { try { return localStorage.getItem(numpadKey) === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem(numpadKey, numpadOn ? '1' : '0') } catch { /* noop */ } }, [numpadKey, numpadOn])
  const [editing, setEditing] = useState(null) // { orderId, field }
  const editingOrder = editing ? orders.find((o) => o.id === editing.orderId) : null

  // 새 주문 시작번호 — '적용'을 눌러야 그 번호부터 매겨진다(표 최대보다 낮아도 적용, 중복은 -a/-b).
  //   nextStart 가 있으면 새 주문마다 그 값을 쓰고 +1 씩. 없으면 자동채번(트리거 MAX+1).
  const [startInput, setStartInput] = useState('')
  const [nextStart, setNextStart] = useState(null)
  const applyStart = () => {
    const n = Number(startInput)
    if (startInput === '' || !(n > 0)) return
    setNextStart(n)
    setStartInput('') // 적용 후 입력칸 비움
  }
  const handleNewOrder = () => {
    if (nextStart == null) return onCreate?.() // 자동채번
    onCreate?.({ queue_no: nextStart })
    setNextStart(nextStart + 1) // 다음 새 주문은 +1
  }

  return (
    <div className="seat-screen seat-screen-order">
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
              numpadOn={numpadOn}
              onOpenNumpad={(id, field) => setEditing({ orderId: id, field })}
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

      {/* 새 주문 = 표 아래·왼쪽. '+ 주문번호만' = 테이블링 비우고 주문번호만 먼저 기록. */}
      <div className="seat-toolbar seat-toolbar-below">
        <button className="seat-btn seat-btn-primary seat-btn-new-order" onClick={handleNewOrder}>+ 새 주문</button>
        <button className="seat-btn" onClick={() => onCreate?.({ queue_no: null })}>+ 주문번호만</button>
        {/* 새 주문 시작번호 — 숫자 입력 후 '적용'을 눌러야 그 번호부터 매겨진다. */}
        <label className="seat-startnum">
          <span>새 주문 시작번호</span>
          <input
            type="number"
            min="1"
            inputMode="numeric"
            placeholder={nextStart != null ? `다음 ${nextStart}` : '자동'}
            value={startInput}
            onChange={(e) => setStartInput(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <button type="button" className="seat-btn" onClick={applyStart}>적용</button>
        </label>
        {/* 번호모달 사용하기 = 테이블링/주문번호 입력 시 숫자 키패드 모달(태블릿 키보드 대체). */}
        <label className="seat-check seat-numpad-toggle">
          <input type="checkbox" checked={numpadOn} onChange={(e) => setNumpadOn(e.target.checked)} />
          <span className="seat-check-text">번호모달 사용하기</span>
        </label>
      </div>

      {editingOrder && (
        <SeatNumpad
          order={editingOrder}
          field={editing.field}
          onPatch={onPatch}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 카메라(설정 시) — 자리안내·주문서관리 동일하게 표시. */}
      {settings.cameraEnabled ? (
        <div className="seat-manager-side">
          <LiveCameraFeed station={role?.key} label={role?.label} enabled={false} />
        </div>
      ) : null}
    </div>
  )
}
