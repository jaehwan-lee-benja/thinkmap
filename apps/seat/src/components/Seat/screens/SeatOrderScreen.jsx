// 자리안내·주문서관리 공통 주문 화면 — 둘 다 풀 기능·같은 위계(유저 지시 2026-08-01).
//   차이(게이팅·카메라·순서핸들·정렬) 제거: 모든 컨트롤 활성(gateMode 없음), 순서핸들·정렬·삭제·리사이즈·카메라 동일.
import { useState, useEffect } from 'react'
import OrderRow from '../components/OrderRow'
import SeatTableHead from '../components/SeatTableHead'
import LiveCameraFeed from '../components/LiveCameraFeed'
import SeatNumpad from '../components/SeatNumpad'
import SeatModal from '../components/SeatModal'
import { queueSuffixes } from '../utils/seatRules'

// 역할별 로컬 토글 상태 훅(기기·역할 단위 저장) — 번호 화면키패드·올리기세부보기 공통.
//   저장값이 없으면 defaultOn(역할별 기본값)을 쓴다. 한 번이라도 끄면 그 선택이 남는다.
function useRoleFlag(roleKey, name, defaultOn = false) {
  const key = `seat.${name}.${roleKey || 'x'}`
  const [on, setOn] = useState(() => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? defaultOn : v === '1'
    } catch { return defaultOn }
  })
  useEffect(() => { try { localStorage.setItem(key, on ? '1' : '0') } catch { /* noop */ } }, [key, on])
  return [on, setOn]
}

export default function SeatOrderScreen({
  role, orders = [], onPatch, onCommit, onCreate,
  onReorder, onSortByNumber, onResizeColumn, onDelete, settings = {},
}) {
  const [dragIdx, setDragIdx] = useState(null)
  const canReorder = !!onReorder // 순서 이동 핸들은 재배열 콜백이 있을 때만
  const suffixMap = queueSuffixes(orders) // 중복 테이블링 번호 → 1-a,1-b

  // ★역할별 기능 설정(기기·역할 단위) — role 전환 시 리마운트되어 각자 로드.
  //   번호 화면키패드: 켜면 테이블링/주문번호 입력이 태블릿 키보드 대신 화면 키패드로.
  //     기본값 = 주문서관리 켬(번호 입력이 잦음) / 자리안내 끔(유저 지시 2026-08-02).
  //   올리기세부보기: 올림 경로 텍스트. 기본 켬(모든 역할).
  const [numpadOn, setNumpadOn] = useRoleFlag(role?.key, 'numpad', role?.key === 'manager')
  const [raiseDetailOn, setRaiseDetailOn] = useRoleFlag(role?.key, 'raisedetail', true)
  const [funcOpen, setFuncOpen] = useState(false) // '기능 설정' 모달
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
              raiseDetailOn={raiseDetailOn}
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

      {/* 새 주문 = 표 아래·왼쪽. '+ 주문번호만' = 테이블링 비우고 주문번호만 먼저 기록.
          그 외 세부 컨트롤(정렬·시작번호·화면키패드·올리기세부보기)은 '기능 설정' 모달로 모은다(역할별). */}
      <div className="seat-toolbar seat-toolbar-below">
        <button className="seat-btn seat-btn-primary seat-btn-new-order" onClick={handleNewOrder}>+ 새 주문</button>
        <button className="seat-btn" onClick={() => onCreate?.({ queue_no: null })}>+ 주문번호만</button>
        <span className="seat-func-open">
          <button type="button" className="seat-btn" onClick={() => setFuncOpen(true)}>기능 설정</button>
          <span className="seat-help" tabIndex={0} role="img" aria-label="역할별에 따라 개별 조절되는 세부 설정하기" data-tip="역할별에 따라 개별 조절되는 세부 설정하기">?</span>
        </span>
      </div>

      <SeatModal open={funcOpen} title={`기능 설정 · ${role?.label || ''}`} onClose={() => setFuncOpen(false)} foot="이 설정은 이 역할·이 기기에만 저장됩니다.">
        <div className="seat-func-body">
          {/* 각 기능 = 외곽선 박스 한 묶음(타이틀+컨트롤). 토글은 체크박스를 라벨 왼쪽에 밀착시켜 대상 인지를 명확히. */}
          {/* 번호 맞춰 정렬 — 드래그로 흐트러진 순서를 테이블링 번호순으로. (재배열 가능할 때만) */}
          {onSortByNumber && (
            <div className="seat-func-item seat-func-item--block">
              <span className="seat-func-label">번호 맞춰 정렬하기</span>
              <span className="seat-func-hint">드래그로 흐트러진 순서를 테이블링 번호순으로 되돌립니다.</span>
              <button type="button" className="seat-btn" onClick={() => { onSortByNumber(); setFuncOpen(false) }}>번호순 정렬</button>
            </div>
          )}
          {/* 새 주문 시작번호 — 입력 + 적용을 한 묶음으로. */}
          <div className="seat-func-item seat-func-item--block">
            <span className="seat-func-label">새 주문 시작번호</span>
            <span className="seat-func-hint">숫자 입력 후 ‘적용’을 눌러야 그 번호부터 매겨집니다.</span>
            <div className="seat-startnum-group">
              <input
                type="number"
                min="1"
                inputMode="numeric"
                placeholder={nextStart != null ? `다음 ${nextStart}` : '자동'}
                value={startInput}
                onChange={(e) => setStartInput(e.target.value.replace(/[^0-9]/g, ''))}
              />
              <button type="button" className="seat-btn" onClick={applyStart}>적용</button>
            </div>
          </div>
          {/* 번호 화면키패드 사용하기 */}
          <label className="seat-func-item seat-func-item--toggle">
            <span className="seat-check"><input type="checkbox" checked={numpadOn} onChange={(e) => setNumpadOn(e.target.checked)} /></span>
            <span className="seat-func-text">
              <span className="seat-func-label">번호 화면키패드 사용하기</span>
              <span className="seat-func-hint">테이블링/주문번호 입력 시 화면 숫자 키패드가 뜹니다(태블릿 키보드 대신).</span>
            </span>
          </label>
          {/* 올리기 전달 세부 보기 */}
          <label className="seat-func-item seat-func-item--toggle">
            <span className="seat-check"><input type="checkbox" checked={raiseDetailOn} onChange={(e) => setRaiseDetailOn(e.target.checked)} /></span>
            <span className="seat-func-text">
              <span className="seat-func-label">올리기 전달 세부 보기</span>
              <span className="seat-func-hint">올림 경로(야외/포장/야외병행/직접체크)와 올림취소 이력을 표시합니다. 끄더라도 올림 취소는 그대로 됩니다.</span>
            </span>
          </label>
        </div>
      </SeatModal>

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
