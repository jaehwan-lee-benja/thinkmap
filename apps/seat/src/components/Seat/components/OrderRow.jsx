// 자리안내·주문서관리 화면의 주문 입력 행. (SEAT-SPEC §9 / 게이팅 도메인 모델 R8~R9)
// order 객체 + onPatch(id, patch)(필드 수정) + onCommit(id, scope)(명시 전달) 콜백.
// gateMode: 'guide'(전달버튼 살리고 제조옵션부터 잠금) | 'manager'(행 dim + 하위버튼 숨김) | undefined.
import { REVIEW_FLAGS } from '../config/seatRoles'
import { isRaiseEnabled, isDineIn, removesFromSeatQueue } from '../utils/seatRules'

export default function OrderRow({ order, onPatch, onCommit, gateMode, dragHandleProps, rowDropProps, onDelete }) {
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
  // 제조옵션 선택 시 자동 전환(유저 지시 2026-07-31):
  //   야외·포장  → 자리앉음 취소(seated=false, 자리큐 제외) + 올리기 전달 체크(raised=true).
  //   야외병행   → 자리앉음은 빈 체크 유지(seated=false, 자리큐는 유지) + 올리기 전달 체크(raised=true).
  //   (셋 다 seated=false·raised=true. 차이는 자리앉음 조작 가능 여부 — 야외/포장은 잠김(✕), 야외병행은 활성.)
  const setOpt = (v) => {
    const isOpt = v !== 'none'
    patch({
      opt_outdoor: v === 'outdoor',
      opt_takeout: v === 'takeout',
      opt_outdoor_parallel: v === 'parallel',
      ...(isOpt ? {
        seated: false,
        raised: true,
        raised_at: order.raised ? order.raised_at : new Date().toISOString(),
        seat_status: 'raised',
      } : {}),
    })
  }

  // 확인 신호(주문서관리 → 자리안내): 확인필요 켜짐 + 아직 확인완료 안 됨 = 하이라이트(자리안내 화면에서만).
  // 확인완료를 누르면 하이라이트만 꺼지고 확인필요 체크는 남는다(기록). 다시 확인필요를 껐다 켜면 재신호.
  const needsAttention = !!order.confirm_flag && !order.confirm_done
  const rowCls = `seat-row${managerGated ? ' seat-row--gated' : ''}${guideLocked ? ' seat-row--guide-locked' : ''}${needsAttention ? ' seat-row--flagged' : ''}`

  return (
    <div className={rowCls} role="row" {...rowDropProps}>
      {/* 테이블링(queue_no) = B방식: 생성 시 자동 순번이 붙되(자리안내가 부여) 여기서 나중에 수정 가능.
          주문번호만 먼저 넣고 자리 배정 후 테이블링을 손봐도 되게 입력 필드로 둔다.
          dragHandleProps 가 오면(자리안내) 왼쪽에 순서 이동 핸들. */}
      <div className="seat-cell seat-cell-no">
        {dragHandleProps && (
          <span className="seat-drag-handle" title="순서 이동" aria-label="순서 이동" {...dragHandleProps}>⠿</span>
        )}
        <input
          className="seat-input seat-input-no"
          value={order.queue_no > 0 ? order.queue_no : ''}
          placeholder="-"
          inputMode="numeric"
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, '')
            patch({ queue_no: v === '' ? null : Number(v) })
          }}
        />
      </div>

      <div className="seat-cell seat-cell-order">
        <input
          className="seat-input"
          value={order.order_no || ''}
          placeholder="주문번호"
          onChange={(e) => patch({ order_no: e.target.value })}
        />
      </div>

      {/* 시작 갈래(order_origin)는 표에 열로 노출하지 않음(내부 게이팅 로직·DB에만 유지, 유저 지시).
          세팅은 '+새 주문' 툴바의 컴팩트 픽커에서 생성 시 결정. */}

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

      {/* ★열 순서: 자리순서 → 제조옵션 (2026-07-31 유저 지시로 교체).
          두 열은 한 묶음(제조 단계)으로 음영을 달리한다 — Seat.css 마디 2 밴드.
          ※셀 순서를 바꾸면 Guide·Manager 헤더 2곳도 같이 바꿔야 한다(3곳 동기화). */}

      {/* 자리순서 = 상태 표시 전용(클릭 불가, 2026-07-31 유저 지시). 값은 다른 액션이 결정:
          자리앉음·야외/포장 옵션 → '필요없음' / 그 외 실내 대기 → '살아있음'. */}
      <div className="seat-cell seat-cell-seat">
        {!managerGated && (
          <span className={`seat-order-status ${seatNeeded ? 'is-alive' : 'is-none'}`}>
            {seatNeeded ? '살아있음' : '필요없음'}
          </span>
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

      {/* 자리앉음 → 올리기 전달 = '전달'과 같은 체크박스 구조(2026-07-31 유저 지시). R2: 올리기는 그 전엔 비활성.
          게이팅: manager 모드 전달 전엔 올림 단계 숨김. guide 모드는 CSS dim/disable.
          '메뉴 나감' 버튼은 제거(menu_out 컬럼은 DB에 그대로 둔다). */}
      <div className="seat-cell seat-cell-raise">
        {!managerGated && (<>
          {/* 자리앉음: 자리순서가 필요없어져(야외/포장) 잠기면 체크박스를 ✕ + 취소선으로 = '이 단계 무효'.
              체크하면 자리 배정 완료 → 자리순서를 '필요없음'으로(seat_order_alive=false, 2026-07-31 유저 지시). */}
          <label className={`seat-check${seatToggleLocked ? ' seat-check--void' : ''}`}>
            <input
              type="checkbox"
              checked={!!order.seated}
              disabled={seatToggleLocked}
              onChange={(e) => patch({ seated: e.target.checked, ...(e.target.checked ? { seat_order_alive: false } : {}) })}
            /> <span className="seat-check-text">자리앉음</span>
          </label>
          <label className="seat-check">
            <input
              type="checkbox"
              checked={!!order.raised}
              disabled={!raiseEnabled}
              onChange={(e) => patch({ raised: e.target.checked, raised_at: e.target.checked ? new Date().toISOString() : null, seat_status: e.target.checked ? 'raised' : 'pending' })}
            /> 올리기 전달
          </label>
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

      {/* '전체에게 전달' 버튼은 제거(2026-07-31). updated_at 만 건드리는 no-op 이었고,
          모든 필드 수정이 이미 Realtime 으로 즉시 전파된다. 명시 전달 원칙(R7)은
          상태를 실제로 바꾸는 두 관문 — 자리후 전달(seat_delivered)·올리기 전달(raised) — 이 지탱한다. */}

      {/* 확인 = 주문서관리(확인필요) → 자리안내(확인완료) 신호. 윗줄/아랫줄 체크박스.
          · 확인필요 체크 → 자리안내에 하이라이트. 해제 → 확인완료도 리셋(다시 확인 필요 준비).
          · 확인완료 체크 → 하이라이트만 꺼짐. 확인필요 체크는 남음(처리 기록). 확인필요 없으면 확인완료 비활성. */}
      <div className="seat-cell seat-cell-confirm">
        <label className="seat-check">
          <input
            type="checkbox"
            checked={!!order.confirm_flag}
            onChange={(e) => patch(e.target.checked
              ? { confirm_flag: true, confirm_done: false }
              : { confirm_flag: false, confirm_done: false })}
          /> <span className="seat-check-text">확인필요</span>
        </label>
        {/* 확인완료 = 취소 개념 없음. 체크/해제만(확인필요 없으면 비활성). ✕·취소선 안 씀. */}
        <label className="seat-check">
          <input
            type="checkbox"
            checked={!!order.confirm_done}
            disabled={!order.confirm_flag}
            onChange={(e) => patch({ confirm_done: e.target.checked })}
          /> 확인완료
        </label>
      </div>

      {/* 줄 삭제 = 제일 오른쪽(확인 오른쪽). soft delete(deleted_at) — DB 복구 가능. */}
      <div className="seat-cell seat-cell-del">
        {onDelete && (
          <button type="button" className="seat-del-btn" aria-label="줄 삭제" title="줄 삭제" onClick={() => onDelete(order.id)}>✕</button>
        )}
      </div>
    </div>
  )
}
