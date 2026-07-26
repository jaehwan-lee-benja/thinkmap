// 자리안내·제조매니저 화면의 주문 입력 행. (SEAT-SPEC §9.1 / 슬라이드 자리안내 열 구성 / 규칙 R1~R5)
// order 객체 + onPatch(id, patch)(필드 수정) + onCommit(id, scope)(명시 전달 버튼) 콜백.
// "전달" 흐름은 명시 버튼 방식(A안): 자리후 전달 / 올리기 전달 / 전체에게 전달.
import { REVIEW_FLAGS } from '../config/seatRoles'
import { hasManufactureOption, isRaiseEnabled } from '../utils/seatRules'

export default function OrderRow({ order, onPatch, onCommit, canMenuOut = false, gated = false }) {
  const patch = (p) => onPatch?.(order.id, p)
  const optChecked = hasManufactureOption(order) // R1: 제조옵션 있으면 자리후 아님
  const raiseEnabled = isRaiseEnabled(order)     // R2: 앉음/올림(또는 옵션) 전엔 올리기 비활성
  // 게이팅(제조매니저 화면 전용): "자리후 전달" 전(!seat_delivered) 행은 dim + 하위단계 버튼 숨김.
  // gated=true 는 ManagerScreen 만 넘긴다. 자리안내(Guide)는 입력·전달 주체라 게이팅 제외.
  // ★제조옵션 주문(optChecked)은 자리 불필요(R1) → 자리후 전달 대상이 아니므로 게이팅 제외(항상 활성).
  const undelivered = gated && !order.seat_delivered && !optChecked
  // R1+R4 수렴: 제조옵션(자리 불필요) 또는 순서취소 → 둘 다 '필요없음'. 비활성 룩 없이 앰버 표시.
  const seatNeeded = order.seat_order_alive && !optChecked

  // 제조옵션 = 드랍다운(단일 선택). 데이터모델(3 boolean 컬럼) 불변 — 선택값을 boolean 3개에 매핑.
  // (기존 체크박스 다중선택 → 단일선택으로 UX 수렴. hasManufactureOption/R1 그대로 성립.)
  const optValue = order.opt_outdoor ? 'outdoor'
    : order.opt_takeout ? 'takeout'
    : order.opt_outdoor_parallel ? 'parallel' : 'none'
  const setOpt = (v) => patch({
    opt_outdoor: v === 'outdoor',
    opt_takeout: v === 'takeout',
    opt_outdoor_parallel: v === 'parallel',
  })

  return (
    <div className={`seat-row${undelivered ? ' seat-row--gated' : ''}`} role="row">
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

      {/* 자리후 전달 = 체크박스(전달 여부 시각확인 + 토글, 버튼 대체로 중복 UX 제거).
          컬럼 위치 = 상태와 제조옵션 사이(유저 지시). 상태원본=seat_delivered.
          체크→commitOrder('seat')(seat_status pending + seat_delivered=true) / 해제→seat_delivered=false.
          R1: 제조옵션 시 자리후 아님 → 비활성. */}
      <div className="seat-cell seat-cell-deliver">
        <label className="seat-check seat-deliver-check">
          <input
            type="checkbox"
            disabled={optChecked}
            checked={!!order.seat_delivered}
            onChange={(e) => (e.target.checked ? onCommit?.(order.id, 'seat') : patch({ seat_delivered: false }))}
          /> 전달
        </label>
      </div>

      {/* 제조옵션 = 드랍다운 단일 선택(선택지=기존 항목). 데이터모델 불변(3 boolean에 매핑). */}
      <div className="seat-cell seat-cell-opts">
        <select
          className="seat-select"
          value={optValue}
          onChange={(e) => setOpt(e.target.value)}
        >
          <option value="none">제조옵션 없음</option>
          <option value="outdoor">야외</option>
          <option value="takeout">포장</option>
          <option value="parallel">야외병행</option>
        </select>
      </div>

      {/* R1+R4: 제조옵션 또는 순서취소 → '필요없음'(앰버)으로 수렴. 제조옵션 시 토글만 잠그되 비활성 룩은 없앰.
          게이팅: 전달 전(undelivered)엔 하위단계라 숨김(셀은 정렬 유지 위해 유지). */}
      <div className="seat-cell seat-cell-seat" aria-disabled={optChecked}>
        {!undelivered && (
          <button
            className={`seat-toggle seat-order-btn ${seatNeeded ? 'is-alive' : 'is-none'}`}
            disabled={optChecked}
            onClick={() => patch({ seat_order_alive: !order.seat_order_alive })}
          >{seatNeeded ? '살아있음' : '필요없음'}</button>
        )}
      </div>

      {/* 자리앉음 → 올리기 전달(버튼). R2: 그 전엔 비활성. R5: 메뉴 나감은 매니저만.
          게이팅: 전달 전(undelivered)엔 올림 단계 전체 숨김. */}
      <div className="seat-cell seat-cell-raise">
        {!undelivered && (<>
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
