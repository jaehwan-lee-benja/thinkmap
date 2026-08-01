// 카이막/커피 스테이션 화면 — 동일 컴포넌트를 role.station 으로 재사용, 서로 독립(R6). (SEAT-SPEC §9.3)
// 멀리서 빠르게. 세 영역(각 타이틀 위 + 가로 스크롤, 오른쪽으로 쌓임):
//   올라감(큰 카드: 번호 大·변동입력·완료) → 자리후(1/2 카드: 번호·특이사항, 곧 올라올 대기) → 완료(칩·되돌리기).
import { useState } from 'react'
import LiveCameraFeed from '../components/LiveCameraFeed'
import { isWaitingOrder, isRaisedOrder, orderLabel, queueSuffixes } from '../utils/seatRules'

export default function StationScreen({ role, orders = [], stations = [], onPatchStation, onPatch, settings = {} }) {
  const stationKey = role?.station
  const stStatus = (orderId) => stations.find((s) => s.order_id === orderId && s.station === stationKey)

  const waiting = orders.filter(isWaitingOrder)
  const raised = orders.filter(isRaisedOrder)
  const active = raised.filter((o) => !stStatus(o.id)?.completed)   // 올라감(아직 완료 안 함)
  const completed = raised.filter((o) => stStatus(o.id)?.completed) // 내가 완료한 것(스테이션 독립)

  const setStation = (orderId, patch) => onPatchStation?.(orderId, stationKey, patch)

  // 중복 테이블링 번호 → 라벨에 -a,-b (같은 번호 카드 오배정 방지).
  const suffixMap = queueSuffixes(orders)
  const labelOf = (o) => { const s = suffixMap[o.id]; return s ? `${orderLabel(o)}-${s}` : orderLabel(o) }

  // 완료 = 축하 애니메이션 끝까지 보여준 뒤 처리(여운). 카드별 Set → A 축하 중에도 B 를 바로 누름.
  const [celebrating, setCelebrating] = useState(() => new Set())
  const complete = (orderId) => {
    if (celebrating.has(orderId)) return
    setCelebrating((prev) => new Set(prev).add(orderId))
    setTimeout(() => {
      setStation(orderId, { completed: true })
      setCelebrating((prev) => { const n = new Set(prev); n.delete(orderId); return n })
    }, 700)
  }

  return (
    <div className="seat-screen seat-screen-station">
      {/* 카메라(설정 시). */}
      {settings.cameraEnabled ? (
        <div className="seat-station-camera">
          <LiveCameraFeed station={stationKey} label={role?.label} enabled={false} />
        </div>
      ) : null}

      {/* 올라감 — 큰 카드(번호 大·변동입력·완료). 오른쪽으로 쌓이고 가로 스크롤. */}
      <section className="seat-st-section seat-st-active">
        <div className="seat-st-title">올라감</div>
        <div className="seat-st-track">
          {active.length === 0 ? (
            <div className="seat-st-empty">— 올림 없음 —</div>
          ) : (
            active.map((o) => (
              <div key={o.id} className="seat-st-card">
                <div className="seat-st-no">{labelOf(o)}</div>
                <input
                  className="seat-input"
                  value={o.notes || ''}
                  placeholder="특이사항"
                  onChange={(e) => onPatch?.(o.id, { notes: e.target.value })}
                />
                <button
                  type="button"
                  className={`seat-complete-btn${celebrating.has(o.id) ? ' is-celebrating' : ''}`}
                  onClick={() => complete(o.id)}
                  disabled={celebrating.has(o.id)}
                >
                  <span className="seat-complete-check" aria-hidden="true">✓</span> 완료
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 자리후 — 곧 올라올 대기. 올라감과 같은 카드(비율 동일, 크기만 작음). 번호·특이사항. */}
      <section className="seat-st-section seat-st-waiting">
        <div className="seat-st-title">자리후</div>
        <div className="seat-st-track">
          {waiting.length === 0 ? (
            <div className="seat-st-empty">— 대기 없음 —</div>
          ) : (
            waiting.map((o) => (
              <div key={o.id} className="seat-st-card">
                <div className="seat-st-no">{labelOf(o)}</div>
                {/* 변동(특이사항)은 아래 칸에 — 올라감과 같은 구조. 없으면 흐린 안내. */}
                <div className={`seat-st-note${o.notes ? '' : ' seat-st-note--empty'}`}>{o.notes || '변동 없음'}</div>
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
            <div className="seat-st-empty">— 완료 없음 —</div>
          ) : (
            completed.map((o) => (
              <div key={o.id} className="seat-st-card seat-st-card--done">
                <div className="seat-st-no">{labelOf(o)}</div>
                <button
                  type="button"
                  className="seat-undo-btn"
                  aria-label={`${labelOf(o)} 완료 되돌리기`}
                  onClick={() => setStation(o.id, { completed: false })}
                >↺ 되돌리기</button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
