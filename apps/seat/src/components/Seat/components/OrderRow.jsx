// 자리안내·제조매니저 화면의 주문 입력 행. (SEAT-SPEC §9 / 게이팅 도메인 모델 R8~R9)
// order 객체 + onPatch(id, patch)(필드 수정) + onCommit(id, scope)(명시 전달) 콜백.
// gateMode: 'guide'(전달버튼 살리고 제조옵션부터 잠금) | 'manager'(행 dim + 하위버튼 숨김) | undefined.
import { REVIEW_FLAGS } from '../config/seatRoles'
import { isRaiseEnabled, isDineIn, removesFromSeatQueue } from '../utils/seatRules'

// 주문 시작 갈래 선택지(order_origin).
const ORIGINS = [
  { value: 'dine_in', label: '실내' },
  { value: 'takeout', label: '포장' },
  { value: 'outdoor', label: '야외' },
]

export default function OrderRow({ order, onPatch, onCommit, canMenuOut = false, gateMode }) {
  const patch = (p) => onPatch?.(order.id, p)
  const dineIn = isDineIn(order)                 // 실내 시작만 자리후 전달 관문 대상
  const removesQueue = removesFromSeatQueue(order) // 야외/포장 = 자리큐 제외(야외병행은 유지)
  const raiseEnabled = isRaiseEnabled(order)     // R2

  // 게이팅: 실내(dine_in) + 미전달 시에만. 포장/야외 시작은 관문 없음(즉시 활성).
  const undelivered = !!gateMode && dineIn && !order.seat_delivered
  const managerGated = undelivered && gateMode === 'manager' // 행 dim + 하위버튼 숨김
  const guideLocked = undelivered && gateMode === 'guide'    // 제조옵션부터 dim/disable(전달버튼은 유지)

  // 자리순서: 실내 + 순서 살아있음 + 자리큐 유지(야외/포장로 안 빠짐). 야외병행은 유지.
  const seatNeeded = dineIn && order.seat_order_alive && !removesQueue
  const seatToggleLocked = !dineIn || removesQueue // 수동 살아있음/필요없음 토글 잠금(옵션/시작이 결정)

  // 제조옵션 = 드랍다운(단일 선택). 데이터모델(3 boolean) 불변 — 선택값 매핑. (실내 주문의 전달 후 변경기록)
  const optValue = order.opt_outdoor ? 'outdoor'
    : order.opt_takeout ? 'takeout'
    : order.opt_outdoor_parallel ? 'parallel' : 'none'
  const setOpt = (v) => patch({
    opt_outdoor: v === 'outdoor',
    opt_takeout: v === 'takeout',
    opt_outdoor_parallel: v === 'parallel',
  })

  const rowCls = `seat-row${managerGated ? ' seat-row--gated' : ''}${guideLocked ? ' seat-row--guide-locked' : ''}`

  return (
    <div className={rowCls} role="row">
      <div className="seat-cell seat-cell-no">{order.queue_no ?? '-'}</div>

      <div className="seat-cell seat-cell-order">
        <input
          className="seat-input"
          value={order.order_no || ''}
          placeholder="주문번호"
          onChange={(e) => patch({ order_no: e.target.value })}
        />
      </div>

      {/* 시작 갈래(order_origin): 실내=자리후 전달 관문 / 포장·야외=자리후 우회. 생성 시 선택. */}
      <div className="seat-cell seat-cell-origin">
        <select
          className="seat-select"
          value={order.order_origin || 'dine_in'}
          onChange={(e) => patch({ order_origin: e.target.value })}
        >
          {ORIGINS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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

      {/* 자리후 전달 = 체크박스(전달 여부 시각확인 + 토글). 실내(dine_in) 주문만 표시(포장/야외는 관문 없음).
          체크→commitOrder('seat')(seat_status pending + seat_delivered=true) / 해제→seat_delivered=false. */}
      <div className="seat-cell seat-cell-deliver">
        {dineIn && (
          <label className="seat-check seat-deliver-check">
            <input
              type="checkbox"
              checked={!!order.seat_delivered}
              onChange={(e) => (e.target.checked ? onCommit?.(order.id, 'seat') : patch({ seat_delivered: false }))}
            /> 전달
          </label>
        )}
      </div>

      {/* 제조옵션 = 드랍다운 단일 선택. 실내 주문의 전달 후 변경기록(야외·포장=큐 제외 / 야외병행=큐 유지). */}
      <div className="seat-cell seat-cell-opts">
        <select
          className="seat-select"
          value={optValue}
          onChange={(e) => setOpt(e.target.value)}
        >
          <option value="none">-</option>
          <option value="outdoor">야외</option>
          <option value="takeout">포장</option>
          <option value="parallel">야외병행</option>
        </select>
      </div>

      {/* 자리순서 살아있음/필요없음. 시작/옵션이 결정하면 수동토글 잠금(비활성 룩은 없앰).
          게이팅: manager 모드 전달 전엔 숨김(정렬 위해 셀은 유지). guide 모드는 CSS로 dim/disable. */}
      <div className="seat-cell seat-cell-seat" aria-disabled={seatToggleLocked}>
        {!managerGated && (
          <button
            className={`seat-toggle seat-order-btn ${seatNeeded ? 'is-alive' : 'is-none'}`}
            disabled={seatToggleLocked}
            onClick={() => patch({ seat_order_alive: !order.seat_order_alive })}
          >{seatNeeded ? '살아있음' : '필요없음'}</button>
        )}
      </div>

      {/* 자리앉음 → 올리기 전달(버튼). R2: 그 전엔 비활성. R5: 메뉴 나감은 매니저만.
          게이팅: manager 모드 전달 전엔 올림 단계 숨김. guide 모드는 CSS dim/disable. */}
      <div className="seat-cell seat-cell-raise">
        {!managerGated && (<>
          <button
            className={`seat-toggle${order.seated ? ' is-on' : ''}`}
            disabled={seatToggleLocked}
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
        </>)}
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
