// 자리안내·주문서관리 화면의 주문 입력 행. (SEAT-SPEC §9 / 게이팅 도메인 모델 R8~R9)
// order 객체 + onPatch(id, patch)(필드 수정) + onCommit(id, scope)(명시 전달) 콜백.
// gateMode: 'guide'(전달버튼 살리고 제조옵션부터 잠금) | 'manager'(행 dim + 하위버튼 숨김) | undefined.
import { useState, useRef } from 'react'
import { REVIEW_FLAGS } from '../config/seatRoles'
import SeatTextField from './SeatTextField'
import { isDineIn, removesFromSeatQueue, raiseDetailText, DELIVER_MODES, isTakeoutMaybe, deliverModeLabel, raiseIgnored } from '../utils/seatRules'

export default function OrderRow({ order, onPatch, onCommit, gateMode, dragHandleProps, rowDropProps, onDelete, onAddSibling, onArchive, onRestore, dupSuffix, numpadOn, onOpenNumpad, raiseDetailOn }) {
  const patch = (p) => onPatch?.(order.id, p)
  // 올리기 전달을 풀 때 실수 방지 재확인(인라인). 세부 텍스트는 raiseDetailOn 일 때만 노출.
  const [confirmUncheck, setConfirmUncheck] = useState(false) // false | 'raise' | 'both'
  const [confirmSeatReset, setConfirmSeatReset] = useState(false) // 자리순서 리셋 재확인 모달
  // ★올림이 이미 전달된 주문은 주문번호 수정/삭제·줄 삭제 전에 재확인(유저 지시 2026-08-02).
  //   주방이 그 번호로 만들고 있는 중이라, 조용히 바뀌면 오배송이 난다.
  const [confirmOrderNo, setConfirmOrderNo] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [maybeOpen, setMaybeOpen] = useState(false) // 포장도고려 전달 갈래 선택 모달
  const [orderNoApproved, setOrderNoApproved] = useState(false) // 한 번 승인하면 그 행에서는 계속 편집 가능
  const orderNoRef = useRef(null)
  const orderNoGuarded = !!order.raised && !orderNoApproved
  // 승인 후 바로 입력으로 이어지게(키패드면 키패드 열기, 아니면 포커스).
  const approveOrderNo = () => {
    setOrderNoApproved(true)
    setConfirmOrderNo(false)
    if (numpadOn) onOpenNumpad?.(order.id, 'order_no')
    else setTimeout(() => orderNoRef.current?.focus(), 0)
  }
  const dineIn = isDineIn(order)                 // 실내 시작만 자리후 전달 관문 대상
  const removesQueue = removesFromSeatQueue(order) // 야외/포장 = 자리큐 제외(야외병행은 유지)
  // ※'자리앉음 → 올리기 전달' 선행조건(구 R2)은 폐지(유저 지시 2026-08-02).
  //   올림의 관문은 아래 preDeliver(자리후 전달) 하나뿐.

  // 게이팅: 실내(dine_in) + 미전달 시에만. 포장/야외 시작은 관문 없음(즉시 활성).
  const undelivered = !!gateMode && dineIn && !order.seat_delivered
  const managerGated = undelivered && gateMode === 'manager' // 행 dim + 하위버튼 숨김
  const guideLocked = undelivered && gateMode === 'guide'    // 제조옵션부터 dim/disable(전달버튼은 유지)
  // ★통합 화면(gateMode 없음)에서도 자리후 전달 전이면 자리순서·올림 영역을 확실히 비활성(유저 지시 2026-08-02).
  //   포장/야외 시작(!dineIn)은 전달 관문 자체가 없으므로 잠그지 않는다.
  const preDeliver = dineIn && !order.seat_delivered
  const raiseVoid = raiseIgnored(order) // 포장도고려(포장영수증) = 올림 무시 → 체크박스 ✕ 무효(R11)
  const canceled = order.seat_status === 'canceled' // 자리대기 취소된 줄(기록으로 남김, 복구 가능)
  const archived = !!order.archived_at            // R12: 안내 완료 → 완료 리스트로 아카이빙(삭제 아님)

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
  //   ★포장도고려(포장영수증)은 올림이 무시되는 줄이라 자동 올림을 걸지 않는다 — 자리큐 제외만 적용(R11).
  const setOpt = (v) => {
    const isOpt = v !== 'none'
    patch({
      opt_outdoor: v === 'outdoor',
      opt_takeout: v === 'takeout',
      opt_outdoor_parallel: v === 'parallel',
      ...(isOpt ? {
        seated: false,
        ...(raiseVoid ? {} : {
          raised: true,
          raised_at: order.raised ? order.raised_at : new Date().toISOString(),
          seat_status: 'raised',
        }),
        raise_canceled: null, // 제조옵션으로 다시 올림 → 취소이력 해제
      } : {}),
    })
  }

  // 자리후 전달 갈래(R11) — '전달'과 같은 위계. 아직 전달 전이면 이 선택이 곧 전달이다(전달+갈래 한 번에).
  //   영수증 포장(maybe_receipt) 로 바꾸면 올림이 무시되므로 남아있던 올림 표시도 함께 내린다
  //   (취소가 아니라 갈래 전환이라 raise_canceled 이력은 남기지 않는다).
  const setDeliverMode = (v) => {
    const extra = v === 'maybe_receipt' && order.raised
      ? { raised: false, raised_at: null, seat_status: 'pending' }
      : {}
    if (order.seat_delivered) patch({ deliver_mode: v, ...extra })
    else onCommit?.(order.id, 'seat', { deliver_mode: v, ...extra })
    setMaybeOpen(false)
  }

  // 자리순서 리셋 = ★'처음 전달을 눌렀던 상태'로 복귀. 전달(seat_delivered)은 유지하고
  //   그 이후 진행분(자리앉음·올림·제조옵션·올림취소이력)만 전부 되돌린다 → 자리순서 '살아있음'.
  const resetSeatOrder = () => {
    patch({
      seated: false, seat_order_alive: true,
      raised: false, raised_at: null, raise_canceled: null, seat_status: 'pending',
      opt_outdoor: false, opt_takeout: false, opt_outdoor_parallel: false,
    })
    setConfirmSeatReset(false)
  }

  // 올리기 전달 풀기 = ★한 스텝만 되돌린다(올림이 이뤄졌던 경로 그대로).
  //   · 제조옵션(야외/포장/야외병행)으로 올렸으면 → 그 옵션만 취소 + 자리앉음 다시 활성화(자리큐 복귀). seated 값은 유지.
  //   · 직접체크(제조옵션 없이)로 올렸으면 → 올림만 해제, 자리앉음(seated)은 그대로 둔다.
  //   두 경우 모두 raise_canceled=true → 세부설명에 '올림취소됨' 표시.
  //   ★'한번에' 로 걸었던 것을 풀면(mode==='both') 자리앉음까지 함께 되돌린다 — 건 것과 같은 단위로 푼다.
  const uncheckRaise = (mode = confirmUncheck) => {
    // 취소 당시 방식을 raise_canceled(text)에 남긴다 → '올림취소됨(야외)' 히스토리 + 다시 올림 활성(isRaiseEnabled).
    const method = order.opt_takeout ? 'takeout' : order.opt_outdoor ? 'outdoor' : order.opt_outdoor_parallel ? 'parallel' : 'direct'
    const base = { raised: false, raised_at: null, seat_status: 'pending', raise_canceled: method }
    const both = mode === 'both' ? { seated: false, seat_order_alive: true } : {}
    if (method !== 'direct') {
      patch({ ...base, ...both, opt_outdoor: false, opt_takeout: false, opt_outdoor_parallel: false, seat_order_alive: true })
    } else {
      patch({ ...base, ...both }) // 직접체크 → raised만 해제, 자리앉음(seated)은 유지('한번에' 취소면 함께 해제)
    }
    setConfirmUncheck(false)
  }

  // ★'한번에' = 자리앉음 + 올리기 전달을 한 번에(유저 지시 2026-08-03: "실질적으론 한번에 누르게 된다").
  //   나눠 누르는 두 체크박스는 그대로 두고 세 번째로 추가 — 개별/개별/함께 3종.
  //   켬 = 자리 배정 완료(자리순서 '필요없음') + 올림. 끔 = 재확인 후 둘 다 되돌림(uncheckRaise('both')).
  const bothOn = !!order.seated && !!order.raised && !raiseVoid
  const setBoth = () => patch({
    seated: true,
    seat_order_alive: false,
    raised: true,
    raised_at: order.raised ? order.raised_at : new Date().toISOString(),
    seat_status: 'raised',
    raise_canceled: null,
  })

  // 확인 신호(주문서관리 → 자리안내): 확인필요 켜짐 + 아직 확인완료 안 됨 = 하이라이트(자리안내 화면에서만).
  // 확인완료를 누르면 하이라이트만 꺼지고 확인필요 체크는 남는다(기록). 다시 확인필요를 껐다 켜면 재신호.
  const needsAttention = !!order.confirm_flag && !order.confirm_done
  const noQueue = !(order.queue_no > 0) // 테이블링 번호 없는 줄(‘+주문번호만’) = 파란 하이라이트

  // 세로형 스와이프-삭제 — 행을 오른쪽→왼쪽으로 밀면 삭제(✕)가 나타난다(유저 지시 2026-08-02).
  //   가로형에서는 CSS 가 이 클래스를 무시하고 삭제 열을 항상 보여준다.
  //   세로 스크롤과 충돌하지 않게 |dx| > |dy| 인 가로 제스처만 인정.
  const [swiped, setSwiped] = useState(false)
  const touchRef = useRef(null)
  const swipeProps = onDelete ? {
    onTouchStart: (e) => {
      const t = e.touches[0]
      touchRef.current = { x: t.clientX, y: t.clientY }
    },
    onTouchEnd: (e) => {
      const s = touchRef.current
      touchRef.current = null
      if (!s) return
      const t = e.changedTouches[0]
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      if (Math.abs(dx) < 44 || Math.abs(dx) <= Math.abs(dy)) return // 세로 스크롤·짧은 터치 무시
      setSwiped(dx < 0) // 왼쪽으로 밀면 열고, 오른쪽으로 밀면 닫는다
    },
  } : null

  // ★순서: no-queue(파랑) 먼저 → flagged(확인필요) 뒤 = 겹치면 확인필요가 우선(뒤 규칙이 이김).
  const rowCls = `seat-row${noQueue ? ' seat-row--no-queue' : ''}${managerGated ? ' seat-row--gated' : ''}${guideLocked ? ' seat-row--guide-locked' : ''}${needsAttention ? ' seat-row--flagged' : ''}${canceled ? ' seat-row--canceled' : ''}${swiped ? ' is-swiped' : ''}`

  return (
    <div className={rowCls} role="row" {...rowDropProps} {...swipeProps}>
      {/* 테이블링(queue_no) = B방식: 생성 시 자동 순번이 붙되(자리안내가 부여) 여기서 나중에 수정 가능.
          주문번호만 먼저 넣고 자리 배정 후 테이블링을 손봐도 되게 입력 필드로 둔다.
          dragHandleProps 가 오면(자리안내) 왼쪽에 순서 이동 핸들. */}
      <div className="seat-cell seat-cell-no">
        {dragHandleProps && (
          <span className="seat-drag-handle" title="순서 이동" aria-label="순서 이동" {...dragHandleProps}>⠿</span>
        )}
        {numpadOn ? (
          <input
            className="seat-input seat-input-no"
            value={order.queue_no > 0 ? order.queue_no : ''}
            placeholder="-"
            inputMode="numeric"
            readOnly
            onClick={() => onOpenNumpad?.(order.id, 'queue_no')}
          />
        ) : (
          <SeatTextField
            className="seat-input seat-input-no"
            value={order.queue_no > 0 ? String(order.queue_no) : ''}
            placeholder="-"
            inputMode="numeric"
            sanitize={(v) => v.replace(/[^0-9]/g, '')}
            onCommit={(v) => patch({ queue_no: v === '' ? null : Number(v) })}
          />
        )}
        {/* 같은 번호가 여러 개면 리스트에서 -a,-b 로 구분(중복 허용). */}
        {dupSuffix ? <span className="seat-no-suffix">-{dupSuffix}</span> : null}
        {/* 번호 아래 줄의 버튼 2종(유저 지시 2026-08-08 — 큰 숫자 옆에 붙어 번호 폭을 잡아먹던 걸 아래로 뗐다).
            · [+]  = 같은 테이블링 번호로 줄 하나 더(한 번호에 영수증 여러 장). 새 줄은 groupByQueue 로 바로 아래에 붙는다.
            · [취소/복구] = 자리대기 취소. 삭제와 달리 표에 기록으로 남고 되살릴 수 있다(스테이션 대기에서는 빠진다). */}
        <div className="seat-no-acts">
          {onAddSibling && order.queue_no > 0 && (
            <button
              type="button"
              className="seat-no-btn seat-no-add"
              aria-label="이 번호로 주문 추가"
              title="이 테이블링 번호로 주문(영수증) 한 줄 더"
              onClick={() => onAddSibling(order)}
            >+</button>
          )}
          <button
            type="button"
            className={`seat-no-btn seat-no-cancel${canceled ? ' is-on' : ''}`}
            aria-label={canceled ? '자리대기 취소 되돌리기' : '자리대기 취소'}
            title={canceled ? '취소 되돌리기' : '자리대기 취소(손님이 대기 포기)'}
            onClick={() => patch(canceled
              ? { seat_status: order.raised ? 'raised' : 'pending', seat_order_alive: true }
              : { seat_status: 'canceled', seat_order_alive: false })}
          >{canceled ? '복구' : '취소'}</button>
        </div>
      </div>

      <div className="seat-cell seat-cell-order">
        {numpadOn || orderNoGuarded ? (
          <input
            ref={orderNoRef}
            className="seat-input"
            value={order.order_no || ''}
            placeholder="-"
            readOnly
            onClick={orderNoGuarded ? () => setConfirmOrderNo(true) : () => onOpenNumpad?.(order.id, 'order_no')}
          />
        ) : (
          <SeatTextField
            className="seat-input"
            value={order.order_no || ''}
            placeholder="-"
            onCommit={(v) => patch({
              order_no: v,
              // 통계용: 주문번호가 처음 채워지는 순간만 시각 기록(이후 수정해도 최초 시각 유지).
              ...(!order.order_no && v && !order.order_no_at ? { order_no_at: new Date().toISOString() } : {}),
              // ★주문번호를 비우면 전달 체크도 함께 풀린다(비활성만 되고 체크가 남던 문제 — 유저 지시 2026-08-02).
              ...(!v && order.seat_delivered ? { seat_delivered: false, delivered_at: null, deliver_mode: null } : {}),
            })}
          />
        )}
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
      {/* 주문번호가 없으면 전달 비활성(주문번호 먼저 입력해야 스테이션에 올릴 수 있음, 유저 지시 2026-08-01). */}
      {/* ★두 번째 줄 = '포장도고려 전달'(R11) — 전달과 같은 위계의 갈래. 자리는 계속 기다리되 주문은 포장으로.
          영수증 매장 = 올림에 '포장' 라벨 / 영수증 포장 = 올림 무시(주방은 이미 만들고 있음). */}
      <div className="seat-cell seat-cell-deliver">
        {dineIn && (<>
          <label className={`seat-check seat-deliver-check${order.order_no ? '' : ' seat-check--void'}`}>
            <input
              type="checkbox"
              checked={!!order.seat_delivered}
              disabled={!order.order_no}
              onChange={(e) => (e.target.checked ? onCommit?.(order.id, 'seat') : patch({ seat_delivered: false, delivered_at: null, deliver_mode: null }))}
            /> <span className="seat-check-text">전달</span>
          </label>
          <button
            type="button"
            className={`seat-maybe-btn${isTakeoutMaybe(order) ? ' is-on' : ''}`}
            disabled={!order.order_no}
            onClick={() => setMaybeOpen(true)}
          >{isTakeoutMaybe(order) ? deliverModeLabel(order) : '포장도고려'}</button>
        </>)}
      </div>

      {/* ★열 순서: 자리순서 → 제조옵션 (2026-07-31 유저 지시로 교체).
          두 열은 한 묶음(제조 단계)으로 음영을 달리한다 — Seat.css 마디 2 밴드.
          ※셀 순서를 바꾸면 Guide·Manager 헤더 2곳도 같이 바꿔야 한다(3곳 동기화). */}

      {/* 자리순서 = 상태 표시 전용(클릭 불가, 2026-07-31 유저 지시). 값은 다른 액션이 결정:
          자리앉음·야외/포장 옵션 → '필요없음' / 그 외 실내 대기 → '살아있음'. */}
      <div className={`seat-cell seat-cell-seat${preDeliver ? ' is-locked' : ''}`}>
        {!managerGated && (<>
          <span className={`seat-order-status ${seatNeeded ? 'is-alive' : 'is-none'}`}>
            {seatNeeded ? '살아있음' : '필요없음'}
          </span>
          {/* 자리순서 리셋 — 처음 전달을 눌렀던 상태로 되돌린다(재확인 모달). */}
          <button
            type="button"
            className="seat-seatreset-btn"
            aria-label="자리순서 리셋"
            title="자리순서 리셋"
            onClick={() => setConfirmSeatReset(true)}
          >↺</button>
        </>)}
      </div>

      {/* 제조옵션 = 드랍다운 단일 선택. 실내 주문의 전달 후 변경기록(야외·포장=큐 제외 / 야외병행=큐 유지).
          ★자리순서 열의 아래줄 — 전달 전이면 자리순서(위)와 함께 잠근다(유저 지시 2026-08-02, 열 전체 비활성). */}
      <div className={`seat-cell seat-cell-opts${preDeliver ? ' is-locked' : ''}`}>
        <select
          className="seat-select"
          value={optValue}
          onChange={(e) => setOpt(e.target.value)}
        >
          <option value="none">-</option>
          <option value="outdoor">야외</option>
          <option value="parallel">야외병행</option>
          <option value="takeout">포장으로변경</option>
        </select>
      </div>

      {/* 자리앉음 → 올리기 전달 = '전달'과 같은 체크박스 구조(2026-07-31 유저 지시). R2: 올리기는 그 전엔 비활성.
          게이팅: manager 모드 전달 전엔 올림 단계 숨김. guide 모드는 CSS dim/disable.
          '메뉴 나감' 버튼은 제거(menu_out 컬럼은 DB에 그대로 둔다). */}
      <div className={`seat-cell seat-cell-raise${preDeliver ? ' is-locked' : ''}`}>
        {!managerGated && (<>
          {/* 자리앉음: 자리순서가 필요없어져(야외/포장) 잠기면 체크박스를 ✕ + 취소선으로 = '이 단계 무효'.
              체크=자리 배정 완료 → 자리순서 '필요없음'(seat_order_alive=false).
              해제=자리순서 '살아있음'으로 복귀(seat_order_alive=true) — 유저 지시 2026-08-01. */}
          <label className={`seat-check${seatToggleLocked ? ' seat-check--void' : ''}`}>
            <input
              type="checkbox"
              checked={!!order.seated}
              disabled={seatToggleLocked || preDeliver}
              onChange={(e) => patch({ seated: e.target.checked, seat_order_alive: !e.target.checked })}
            /> <span className="seat-check-text">자리앉음</span>
          </label>
          {/* 올리기 전달 = 스테이션(카이막/커피) 올림. 체크→올림 / 풀기→재확인 후 한 스텝 취소(uncheckRaise).
              ★포장도고려(포장영수증)은 올림이 무시되는 줄 → 자리앉음 잠금과 같은 관용으로 ✕+취소선 무효 표시(R11). */}
          <label className={`seat-check${raiseVoid ? ' seat-check--void' : ''}`}>
            <input
              type="checkbox"
              checked={!!order.raised && !raiseVoid}
              disabled={preDeliver || raiseVoid}
              onChange={(e) => {
                if (e.target.checked) patch({ raised: true, raised_at: new Date().toISOString(), seat_status: 'raised', raise_canceled: null })
                else setConfirmUncheck('raise') // 바로 풀지 않고 재확인 버튼을 띄운다
              }}
            /> <span className="seat-check-text">올리기 전달</span>
          </label>
          {/* 한번에 = 위 두 개를 동시에. 자리앉음이 잠긴 줄(야외/포장)·올림 무효 줄에서는 함께 잠근다. */}
          <label className={`seat-check seat-check-both${seatToggleLocked || raiseVoid ? ' seat-check--void' : ''}`}>
            <input
              type="checkbox"
              checked={bothOn}
              disabled={preDeliver || seatToggleLocked || raiseVoid}
              onChange={(e) => (e.target.checked ? setBoth() : setConfirmUncheck('both'))}
            /> <span className="seat-check-text">한번에</span>
          </label>
          {/* 세부보기(raiseDetailOn)는 '어떤 경로로 올림됐는지' 텍스트 표시만 제어.
              ★풀기 재확인은 설정과 무관하게 항상 동작하며, 모달로 뜬다(자리순서 리셋과 동일 — 유저 지시 2026-08-02). */}
          {raiseDetailOn && raiseDetailText(order) ? (
            <div className={`seat-raise-detail${order.raise_canceled ? ' is-canceled' : ''}`}>{raiseDetailText(order)}</div>
          ) : null}
        </>)}
      </div>

      {/* 특이사항 = 올림 열의 아래줄 — 전달 전이면 올림(위)과 함께 잠근다(유저 지시 2026-08-02, 열 전체 비활성). */}
      <div className={`seat-cell seat-cell-notes${preDeliver ? ' is-locked' : ''}`}>
        <SeatTextField
          className="seat-input"
          value={order.notes || ''}
          placeholder="전달사항"
          onCommit={(v) => patch({ notes: v })}
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
        {/* ★확인완료 아래 «완료» 버튼(유저 지시 2026-08-08) — 누르면 R12 아카이브(완료 탭으로).
            안내 동선의 마지막 칸이라 여기가 제자리다. 완료 탭에서는 같은 자리가 «대기열로»(복귀).
            ※삭제 셀에 있던 ✓ 는 제거했다 — 같은 동작이 두 곳이면 헷갈리고, 삭제 ✕ 바로 옆이라 오조작 위험도 컸다. */}
        {archived
          ? onRestore && (
            <button type="button" className="seat-done-btn is-restore" onClick={() => onRestore(order)}>대기열로</button>
          )
          : onArchive && (
            <button type="button" className="seat-done-btn" onClick={() => onArchive(order)}>완료</button>
          )}
      </div>

      {/* 메모 = 자유 메모판(자리안내·주문서관리 둘 다 읽기·수정. 행 단위, 두 줄 높이 전체). */}
      <div className="seat-cell seat-cell-memo">
        <SeatTextField
          as="textarea"
          className="seat-input seat-memo"
          value={order.memo || ''}
          placeholder="-"
          rows={2}
          onCommit={(v) => patch({ memo: v })}
        />
      </div>

      {/* 줄 삭제 = 제일 오른쪽(확인 오른쪽). soft delete(deleted_at) — DB 복구 가능.
          ※«완료»(R12 아카이브)는 2026-08-08 유저 지시로 **확인 셀**(확인완료 아래)로 옮겼다 — 여기엔 삭제만 둔다. */}
      <div className="seat-cell seat-cell-del">
        {onDelete && (
          <button type="button" className="seat-del-btn" aria-label="줄 삭제" title="줄 삭제" onClick={() => setConfirmDelete(true)}>✕</button>
        )}
      </div>

      {/* 주문번호 수정/삭제 재확인 — 이미 올림이 전달된 주문일 때만. */}
      {confirmOrderNo && (
        <div className="seat-confirm-scrim" onClick={() => setConfirmOrderNo(false)}>
          <div className="seat-confirm" role="dialog" aria-modal="true" aria-label="주문번호 수정" onClick={(e) => e.stopPropagation()}>
            <div className="seat-confirm-title">이미 올림이 전달된 주문입니다.</div>
            <div className="seat-confirm-desc">주문번호를 수정/삭제하시겠습니까? 주방이 이 번호로 만들고 있을 수 있습니다.</div>
            <div className="seat-confirm-acts">
              <button type="button" className="seat-btn" onClick={() => setConfirmOrderNo(false)}>취소</button>
              <button type="button" className="seat-btn seat-btn-danger" onClick={approveOrderNo}>수정하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 포장도고려 전달(R11) — 영수증 갈래를 고르는 순간이 곧 전달이다. 이미 골랐으면 '일반 전달로' 되돌리기. */}
      {maybeOpen && (
        <div className="seat-confirm-scrim" onClick={() => setMaybeOpen(false)}>
          <div className="seat-confirm" role="dialog" aria-modal="true" aria-label="포장도고려 전달" onClick={(e) => e.stopPropagation()}>
            <div className="seat-confirm-title">포장도고려 전달</div>
            <div className="seat-confirm-desc">
              자리가 나면 앉지만, 주문은 일단 포장으로 나갑니다. 영수증은 어느 쪽인가요?
              <br />· <b>매장</b> — 주방이 모르는 정보라 올림 카드에 ‘포장’ 라벨이 붙습니다.
              <br />· <b>포장</b> — 주방은 이미 포장으로 만들고 있어 올림하지 않습니다(표에만 남습니다).
            </div>
            <div className="seat-confirm-acts seat-confirm-acts--stack">
              {DELIVER_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`seat-btn${order.deliver_mode === m.value ? ' seat-btn-primary' : ''}`}
                  onClick={() => setDeliverMode(m.value)}
                >{m.desc}</button>
              ))}
              {isTakeoutMaybe(order) && (
                <button type="button" className="seat-btn" onClick={() => { patch({ deliver_mode: null }); setMaybeOpen(false) }}>일반 전달로</button>
              )}
              <button type="button" className="seat-btn" onClick={() => setMaybeOpen(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 줄 삭제 재확인 — ★모든 줄에 항상(유저 지시 2026-08-02). 올림된 주문이면 문구를 더 강하게. */}
      {confirmDelete && (
        <div className="seat-confirm-scrim" onClick={() => setConfirmDelete(false)}>
          <div className="seat-confirm" role="dialog" aria-modal="true" aria-label="줄 삭제" onClick={(e) => e.stopPropagation()}>
            <div className="seat-confirm-title">
              {order.raised
                ? '이 줄은 이미 올림이 진행된 줄입니다. 정말로 삭제하겠습니까?'
                : '이 줄을 삭제하시겠습니까?'}
            </div>
            <div className="seat-confirm-desc">
              {order.raised
                ? '주방이 이 주문을 만들고 있을 수 있습니다. 표에서 사라지며, 기록은 남아 복구할 수 있습니다.'
                : '표에서 사라집니다. 기록은 남아 있어 복구할 수 있습니다.'}
            </div>
            <div className="seat-confirm-acts">
              <button type="button" className="seat-btn" onClick={() => setConfirmDelete(false)}>취소</button>
              <button type="button" className="seat-btn seat-btn-danger" onClick={() => { setConfirmDelete(false); onDelete?.(order.id) }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 올리기 전달 취소 재확인 모달 — 한 스텝 되돌림(올림 경로 그대로). 'both' 면 자리앉음까지 함께. */}
      {confirmUncheck && (
        <div className="seat-confirm-scrim" onClick={() => setConfirmUncheck(false)}>
          <div className="seat-confirm" role="dialog" aria-modal="true" aria-label="올리기 전달 취소" onClick={(e) => e.stopPropagation()}>
            <div className="seat-confirm-title">
              {confirmUncheck === 'both' ? '자리앉음과 올림을 함께 취소하시겠습니까?' : '올리기 전달을 취소하시겠습니까?'}
            </div>
            <div className="seat-confirm-desc">
              {confirmUncheck === 'both'
                ? '자리앉음이 풀려 자리순서가 다시 살아나고, 올림도 해제됩니다.'
                : order.opt_takeout || order.opt_outdoor || order.opt_outdoor_parallel
                  ? '올림이 해제되고, 선택했던 야외·포장 옵션도 함께 취소됩니다(자리앉음 다시 가능).'
                  : '올림만 해제됩니다. 자리앉음은 그대로 유지됩니다.'}
            </div>
            <div className="seat-confirm-acts">
              <button type="button" className="seat-btn" onClick={() => setConfirmUncheck(false)}>유지</button>
              <button type="button" className="seat-btn seat-btn-danger" onClick={() => uncheckRaise(confirmUncheck)}>
                {confirmUncheck === 'both' ? '함께 취소' : '올림취소'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 자리순서 리셋 재확인 모달 — 실수로 진행분을 날리지 않게. */}
      {confirmSeatReset && (
        <div className="seat-confirm-scrim" onClick={() => setConfirmSeatReset(false)}>
          <div className="seat-confirm" role="dialog" aria-modal="true" aria-label="자리순서 리셋" onClick={(e) => e.stopPropagation()}>
            <div className="seat-confirm-title">자리순서 리셋하시겠습니까?</div>
            <div className="seat-confirm-desc">처음 ‘자리후 전달’을 눌렀던 상태로 되돌립니다. 자리앉음·올림·제조옵션이 모두 해제됩니다.</div>
            <div className="seat-confirm-acts">
              <button type="button" className="seat-btn" onClick={() => setConfirmSeatReset(false)}>취소</button>
              <button type="button" className="seat-btn seat-btn-danger" onClick={resetSeatOrder}>리셋</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
