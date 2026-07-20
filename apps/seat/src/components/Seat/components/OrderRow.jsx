// 자리안내·제조매니저 화면의 주문 입력 행. (SEAT-SPEC §9.1 / 슬라이드 자리안내 열 구성 / 규칙 R1~R5)
// order 객체 + onPatch(id, patch)(필드 수정) + onCommit(id, scope)(명시 전달 버튼) 콜백.
// "전달" 흐름은 명시 버튼 방식(A안): 자리후 전달 / 올리기 전달 / 전체에게 전달.
import { REVIEW_FLAGS } from '../config/seatRoles'
import { hasManufactureOption, isRaiseEnabled } from '../utils/seatRules'

export default function OrderRow({ order, onPatch, onCommit, canMenuOut = false }) {
  const patch = (p) => onPatch?.(order.id, p)
  const optChecked = hasManufactureOption(order) // R1: 제조옵션 있으면 자리후 아님
  const raiseEnabled = isRaiseEnabled(order)     // R2: 앉음/올림(또는 옵션) 전엔 올리기 비활성

  return (
    <div className="seat-row" role="row">
      <div className="seat-cell seat-cell-no">{order.queue_no ?? '-'}</div>

      <div className="seat-cell seat-cell-order">
        <input
          className="seat-input"
          value={order.order_no || ''}
          placeholder="주문번호"
          onChange={(e) => patch({ order_no: e.target.value })}
        />
      </div>

      {/* 자리후 전달(버튼). R1: 제조옵션 체크 시 자리후 아님 → 비활성 */}
      <div className="seat-cell seat-cell-deliver">
        <button className="seat-toggle" disabled={optChecked} onClick={() => onCommit?.(order.id, 'seat')}>
          자리후 전달
        </button>
      </div>

      <div className="seat-cell seat-cell-status">
        <select
          className="seat-select"
          value={order.review_flag || 'none'}
          onChange={(e) => patch({ review_flag: e.target.value })}
        >
          {REVIEW_FLAGS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div className="seat-cell seat-cell-opts">
        <label className="seat-check">
          <input type="checkbox" checked={!!order.opt_outdoor} onChange={(e) => patch({ opt_outdoor: e.target.checked })} /> 야외
        </label>
        <label className="seat-check">
          <input type="checkbox" checked={!!order.opt_takeout} onChange={(e) => patch({ opt_takeout: e.target.checked })} /> 포장
        </label>
        <label className="seat-check">
          <input type="checkbox" checked={!!order.opt_outdoor_parallel} onChange={(e) => patch({ opt_outdoor_parallel: e.target.checked })} /> 야외병행
        </label>
      </div>

      {/* R1: 제조옵션 체크 시 자리순서 비활성. R4: 살아있음/필요없음. 상태별 색구분(초록/앰버). */}
      <div className="seat-cell seat-cell-seat" aria-disabled={optChecked}>
        <button
          className={`seat-toggle seat-order-btn ${order.seat_order_alive ? 'is-alive' : 'is-none'}`}
          disabled={optChecked}
          onClick={() => patch({ seat_order_alive: !order.seat_order_alive })}
        >{order.seat_order_alive ? '살아있음' : '필요없음'}</button>
      </div>

      {/* 자리앉음 → 올리기 전달(버튼). R2: 그 전엔 비활성. R5: 메뉴 나감은 매니저만 */}
      <div className="seat-cell seat-cell-raise">
        <button
          className={`seat-toggle${order.seated ? ' is-on' : ''}`}
          disabled={optChecked}
          onClick={() => patch({ seated: !order.seated })}
        >자리앉음</button>
        <button
          className={`seat-toggle${order.raised ? ' is-on' : ''}`}
          disabled={!raiseEnabled}
          onClick={() => patch({ raised: !order.raised, raised_at: !order.raised ? new Date().toISOString() : null, seat_status: !order.raised ? 'raised' : 'pending' })}
        >올리기 전달</button>
        {canMenuOut && (
          <button
            className={`seat-toggle${order.menu_out ? ' is-on' : ''}`}
            onClick={() => patch({ menu_out: !order.menu_out })}
          >메뉴 나감</button>
        )}
      </div>

      <div className="seat-cell seat-cell-notes">
        <input
          className="seat-input"
          value={order.notes || ''}
          placeholder="특이사항"
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>

      {/* 전체에게 전달(버튼). R7: 해당 행을 모든 역할 화면에 즉시 반영 */}
      <div className="seat-cell seat-cell-broadcast">
        <button className="seat-toggle" onClick={() => onCommit?.(order.id, 'all')}>전체에게 전달</button>
      </div>

      {/* 확인필요 플래그 — 상태선택과 별개의 빠른 플래그 */}
      <div className="seat-cell seat-cell-confirm">
        <button
          className={`seat-toggle${order.confirm_flag ? ' is-on' : ''}`}
          onClick={() => patch({ confirm_flag: !order.confirm_flag })}
        >확인필요</button>
      </div>
    </div>
  )
}
