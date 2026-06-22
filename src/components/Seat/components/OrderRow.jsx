// 자리안내·제조매니저 화면의 주문 입력 행. (SEAT-SPEC §9.1 / 규칙 R1·R2·R3·R4·R5)
// order 객체와 onPatch(id, patch) 콜백을 받아 표시/수정한다. 실제 저장은 부모가 연결.
import { REVIEW_FLAGS } from '../config/seatRoles'
import { hasManufactureOption, isRaiseEnabled } from '../utils/seatRules'

export default function OrderRow({ order, onPatch, canMenuOut = false }) {
  const patch = (p) => onPatch?.(order.id, p)
  const optChecked = hasManufactureOption(order) // R1: 제조옵션 있으면 자리후 아님
  const raiseEnabled = isRaiseEnabled(order)     // R2: 앉음/올림 전엔 제조 칸 비활성

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

      {/* R1: 제조옵션 체크 시 자리순서(자리후) 컨트롤 비활성. R4: 살아있음/순서없이 토글. */}
      <div className="seat-cell seat-cell-seat" aria-disabled={optChecked}>
        <button
          className={`seat-toggle${order.seat_order_alive ? ' is-on' : ''}`}
          disabled={optChecked}
          onClick={() => patch({ seat_order_alive: !order.seat_order_alive })}
        >{order.seat_order_alive ? '살아있음' : '순서없이'}</button>
        <button
          className={`seat-toggle${order.seated ? ' is-on' : ''}`}
          disabled={optChecked}
          onClick={() => patch({ seated: !order.seated })}
        >자리앉음</button>
      </div>

      {/* R2: 자리앉음/올림(또는 제조옵션) 전에는 비활성. */}
      <div className="seat-cell seat-cell-raise">
        <button
          className={`seat-toggle${order.raised ? ' is-on' : ''}`}
          disabled={!raiseEnabled}
          onClick={() => patch({ raised: !order.raised, seat_status: !order.raised ? 'raised' : 'pending' })}
        >제조 올리기</button>
        {/* R5: 메뉴 나감은 제조매니저만 */}
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
    </div>
  )
}
