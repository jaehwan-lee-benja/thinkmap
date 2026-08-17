// 카이막/커피 스테이션 화면 — 동일 컴포넌트를 role.station 으로 재사용, 서로 독립(R6). (SEAT-SPEC §9.3)
// 멀리서 빠르게. 세 영역(각 타이틀 위 + 가로 스크롤, 오른쪽으로 쌓임):
//   올라감(큰 카드: 번호 大·변동입력·완료) → 자리후(1/2 카드: 번호·특이사항, 곧 올라올 대기) → 완료(칩·되돌리기).
import { useState, useEffect } from 'react'
import LiveCameraFeed from '../components/LiveCameraFeed'
import { isWaitingOrder, isRaisedOrder, orderLabel, showsTakeoutLabel } from '../utils/seatRules'
import { IconCheck } from '../components/SeatIcon'
import { emptyText } from '../utils/seatLoadState'

// 색종이 가루 입자 — 고정 배열(랜덤 없이 결정적: 매 완료마다 같은 모양이라 깜빡임·재현 이슈 없음).
//   x/y = 흩어지는 방향(px), r = 회전(deg), d = 시작 지연(ms).
const CONFETTI = [
  { x: -58, y: -46, r: 220, d: 0 },   { x: -34, y: -62, r: -180, d: 40 },
  { x: -12, y: -70, r: 300, d: 15 },  { x: 12, y: -66, r: -240, d: 55 },
  { x: 36, y: -58, r: 200, d: 25 },   { x: 58, y: -42, r: -300, d: 70 },
  { x: -70, y: -20, r: 160, d: 60 },  { x: 70, y: -16, r: -160, d: 30 },
  { x: -46, y: -8, r: 260, d: 85 },   { x: 46, y: -4, r: -220, d: 10 },
  { x: -22, y: -34, r: 340, d: 100 }, { x: 24, y: -30, r: -340, d: 75 },
]

// ※주문 필드(전달사항 등)는 이 화면에서 수정하지 않는다(읽기 전용) — 수정은 자리안내/주문서관리 표에서.
// ★세 영역의 「— … 없음 —」은 전부 emptyText(loadState, …) 를 거친다(2026-08-17 단일점 ②).
//   여기서 「없음」은 주방에 «올릴 것이 없다»는 지시로 읽힌다 — 읽기 실패가 그 얼굴로 착지하면 안 된다.
export default function StationScreen({ role, orders = [], stations = [], loadState = 'ready', onPatchStation, cardOrder, onReorderCards, settings = {} }) {
  const stationKey = role?.station
  const stStatus = (orderId) => stations.find((s) => s.order_id === orderId && s.station === stationKey)

  // 카드별 Set → A 축하 중에도 B 를 바로 누른다.
  const [celebrating, setCelebrating] = useState(() => new Set())

  const waiting = orders.filter(isWaitingOrder)
  const raised = orders.filter(isRaisedOrder)
  // ★올라감 = '올린 시간순'(raised_at asc). 번호순이 아니다(유저 지시 2026-08-02).
  // ★축하 중인 카드는 «완료로 쓰였어도» 잠시 이 목록에 남는다 — 그래야 쓰기를 먼저 하고도 연출이 끊기지 않는다.
  //   (2026-08-17: MOTION-CANON v1.2 「연출이 업무를 기다리게 하면 축하가 아니라 지연이다」 반영.)
  const active = raised
    .filter((o) => !stStatus(o.id)?.completed || celebrating.has(o.id))
    .sort((a, b) => String(a.raised_at || '').localeCompare(String(b.raised_at || '')))
  const completed = raised.filter((o) => stStatus(o.id)?.completed && !celebrating.has(o.id)) // 내가 완료한 것(스테이션 독립)

  // 수동 순서 — 올린 시간순이 기본, 화살표로 앞뒤 이동. ★순서는 워크스페이스(매장) 공유(유저 지시 2026-08-02).
  //   저장된 순서(cardOrder)에 없는 새 카드는 시간순 그대로 뒤에 붙고, 사라진 id 는 걸러낸다.
  const savedOrder = Array.isArray(cardOrder) ? cardOrder : []
  const activeIds = active.map((o) => o.id)
  const orderedIds = [
    ...savedOrder.filter((id) => activeIds.includes(id)),
    ...activeIds.filter((id) => !savedOrder.includes(id)),
  ]
  const activeOrdered = orderedIds.map((id) => active.find((o) => o.id === id)).filter(Boolean)

  const moveCard = (id, dir) => {
    const i = orderedIds.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= orderedIds.length) return
    const next = orderedIds.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onReorderCards?.(next)
  }

  const setStation = (orderId, patch) => onPatchStation?.(orderId, stationKey, patch)

  // 스테이션(카이막/커피)에는 -a,-b 접미사를 붙이지 않는다(주문번호 그대로 표시, 유저 지시 2026-08-02).
  const labelOf = (o) => orderLabel(o)

  // ★완료 = **쓰기 먼저, 연출은 그 위에서**(2026-08-17, MOTION-CANON v1.2 면제 조건 ⓓ).
  //   전에는 `setTimeout(…, 700)` **안에서** 쓰기를 했다 = 애니메이션이 **임계 경로**에 있었다.
  //   주방 체감으로는 「완료를 눌렀는데 0.7초 뒤에 반영」이었고, 그건 축하가 아니라 지연이다.
  //   지금은 누르는 즉시 DB 로 나가고(Realtime 도 즉시 퍼진다), 축하는 카드를 700ms 더 붙잡아 두는 것뿐이다.
  //   ※연출의 «성격»은 하나도 안 줄였다 — 임계 경로에서만 뺐다.
  const complete = (orderId) => {
    if (celebrating.has(orderId)) return
    setStation(orderId, { completed: true })                       // ← 쓰기: 즉시
    setCelebrating((prev) => new Set(prev).add(orderId))           // ← 연출: 그 위에서
    setTimeout(() => endCelebration(orderId), 700)
  }
  // ⓒ«스킵 가능» — 축하 중인 카드를 누르면 바로 끝난다. 아무것도 안 막지만, 기다리기 싫은 사람에게 길을 준다.
  const endCelebration = (orderId) =>
    setCelebrating((prev) => { if (!prev.has(orderId)) return prev; const n = new Set(prev); n.delete(orderId); return n })

  return (
    <div className="seat-screen seat-screen-station">
      {/* 카메라(설정 시). */}
      {settings.cameraEnabled ? (
        <div className="seat-station-camera">
          <LiveCameraFeed station={stationKey} label={role?.label} enabled={false} />
        </div>
      ) : null}

      {/* 올라감(제조하기) — 큰 카드(번호 大·전달사항·완료). 오른쪽으로 쌓이고 가로 스크롤. */}
      <section className="seat-st-section seat-st-active">
        <div className="seat-st-title">올라감(제조하기)</div>
        <div className="seat-st-track">
          {activeOrdered.length === 0 ? (
            <div className="seat-st-empty">{emptyText(loadState, '— 올림 없음 —')}</div>
          ) : (
            activeOrdered.map((o, i) => (
              // 카드 + 그 아래 이동 버튼(카드 밖) 한 묶음.
              <div key={o.id} className="seat-st-slot"
                onClick={celebrating.has(o.id) ? () => endCelebration(o.id) : undefined}>
              <div className="seat-st-card">
                {/* 포장으로 변경된 주문 = 스테이션에서 특별히 눈에 띄게(레이아웃 비침습 오버레이). */}
                {/* 체크 표시 = 수기 영수증에서 포장을 체크로 적는 관행과 경험 통일(유저 지시 2026-08-02). */}
                {/* 포장도고려(매장영수증)도 같은 라벨 — 주방 입장에선 '이 주문은 포장'이 새 정보인 건 같다(R11). */}
                {showsTakeoutLabel(o)
                  ? <div className="seat-st-tag seat-st-tag--takeout"><IconCheck />{o.opt_takeout ? '포장으로 변경됨' : '포장'}</div>
                  : null}
                <div className="seat-st-no">{labelOf(o)}</div>
                {/* 전달사항 = 읽기 전용 텍스트(자리후 대기 카드와 동일 구조). 수정은 표에서 — 유저 지시 2026-08-02. */}
                <div className={`seat-st-note${o.notes ? '' : ' seat-st-note--empty'}`}>{o.notes || '-'}</div>
                {/* ★축하 중에도 **비활성화하지 않는다**(2026-08-17 실측으로 갈린 지점).
                    전에는 `disabled` 였는데, 그러면 카드에서 **가장 크고 자연스러운 탭 자리**가
                    탭을 삼켜 «축하 건너뛰기»가 절반만 먹었다(비활성 요소는 click 을 내보내지도 버블하지도 않는다).
                    지금은 축하 중 누르면 **연출만 끝난다** — 이미 쓰기는 나갔으므로 두 번 눌러도 안전하다
                    (`complete()` 가 `celebrating` 을 보고 즉시 되돌아온다). 면제 조건 ⓒ«스킵 가능»·ⓓ«입력 안 막음». */}
                <button
                  type="button"
                  className={`seat-complete-btn${celebrating.has(o.id) ? ' is-celebrating' : ''}`}
                  onClick={() => (celebrating.has(o.id) ? endCelebration(o.id) : complete(o.id))}
                >
                  <IconCheck className="seat-complete-check" /> 완료
                  {/* 색종이 가루 — 완료 순간에만 흩뿌려진다(이모지 대신 실제 입자, 유저 지시 2026-08-02). */}
                  {celebrating.has(o.id) && (
                    <span className="seat-confetti" aria-hidden="true">
                      {CONFETTI.map((c, i) => <i key={i} style={{ '--x': `${c.x}px`, '--y': `${c.y}px`, '--r': `${c.r}deg`, '--d': `${c.d}ms` }} />)}
                    </span>
                  )}
                </button>
              </div>
              {/* 이동 버튼 = 카드 밖·아래, 동그라미(유저 지시 2026-08-02). 순서는 매장 공유. */}
              <div className="seat-st-move">
                <button
                  type="button"
                  className="seat-move-btn"
                  aria-label={`${labelOf(o)} 앞으로`}
                  title="앞으로"
                  disabled={i === 0}
                  onClick={() => moveCard(o.id, -1)}
                >◀</button>
                <button
                  type="button"
                  className="seat-move-btn"
                  aria-label={`${labelOf(o)} 뒤로`}
                  title="뒤로"
                  disabled={i === activeOrdered.length - 1}
                  onClick={() => moveCard(o.id, 1)}
                >▶</button>
              </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 자리후(대기) — 곧 올라올 대기. 올라감과 같은 카드(비율 동일, 크기만 작음). 번호·전달사항. */}
      <section className="seat-st-section seat-st-waiting">
        <div className="seat-st-title">자리후(대기)</div>
        <div className="seat-st-track">
          {waiting.length === 0 ? (
            <div className="seat-st-empty">{emptyText(loadState, '— 대기 없음 —')}</div>
          ) : (
            waiting.map((o) => (
              <div key={o.id} className="seat-st-card">
                <div className="seat-st-no">{labelOf(o)}</div>
                {/* 변동(특이사항)은 아래 칸에 — 올라감과 같은 구조. 없으면 흐린 안내. */}
                <div className={`seat-st-note${o.notes ? '' : ' seat-st-note--empty'}`}>{o.notes || '-'}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 완료 — 올라감·자리후와 같은 카드(가장 작음). 번호 위 + 되돌리기 버튼 아래. */}
      <section className="seat-st-section seat-st-done">
        <div className="seat-st-title">완료</div>
        <div className="seat-st-track">
          {completed.length === 0 ? (
            <div className="seat-st-empty">{emptyText(loadState, '— 완료 없음 —')}</div>
          ) : (
            completed.map((o) => (
              <div key={o.id} className="seat-st-card seat-st-card--done">
                {/* 되돌리기 = 번호 옆 아이콘(카드 아래가 잘리던 문제 — 유저 지시 2026-08-02). */}
                <div className="seat-st-doneline">
                  <span className="seat-st-no">{labelOf(o)}</span>
                  <button
                    type="button"
                    className="seat-undo-btn"
                    aria-label={`${labelOf(o)} 완료 되돌리기`}
                    title="완료 되돌리기"
                    onClick={() => setStation(o.id, { completed: false })}
                  >↺</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
