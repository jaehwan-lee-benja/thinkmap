// 카이막/커피 스테이션 화면 — 동일 컴포넌트를 role.station 으로 재사용, 서로 독립(R6). (SEAT-SPEC §9.3)
// 멀리서 빠르게 보는 화면 → 큼직·단순. 메인=올림 카드(번호 大 + 완료 버튼 大),
// 하단 풋터=자리후 대기(위) → 완료된 리스트(아래, 가로 스크롤).
import { useState } from 'react'
import LiveCameraFeed from '../components/LiveCameraFeed'
import QueueChips from '../components/QueueChips'
import { isWaitingOrder, isRaisedOrder, orderLabel } from '../utils/seatRules'

export default function StationScreen({ role, orders = [], stations = [], onPatchStation, settings = {} }) {
  const stationKey = role?.station
  const stStatus = (orderId) => stations.find((s) => s.order_id === orderId && s.station === stationKey)

  const waiting = orders.filter(isWaitingOrder)
  const raised = orders.filter(isRaisedOrder)
  const active = raised.filter((o) => !stStatus(o.id)?.completed)   // 아직 완료 안 한 올림
  const completed = raised.filter((o) => stStatus(o.id)?.completed) // 내가 완료한 것(스테이션 독립)

  const setStation = (orderId, patch) => onPatchStation?.(orderId, stationKey, patch)

  // 완료 = 축하 애니메이션을 끝까지 보여준 뒤(카드가 곧장 사라지지 않게) 완료 처리. (유저 지시: 여운 남기기)
  const [celebrating, setCelebrating] = useState(null)
  const complete = (orderId) => {
    if (celebrating) return
    setCelebrating(orderId)
    setTimeout(() => { setStation(orderId, { completed: true }); setCelebrating(null) }, 700)
  }

  return (
    <div className="seat-screen seat-screen-station">
      {/* 카메라(설정 시) — 끄면 슬롯 자체를 렌더하지 않아 작업 영역이 넓어진다. */}
      {settings.cameraEnabled ? (
        <div className="seat-station-camera">
          <LiveCameraFeed station={stationKey} label={role?.label} enabled={false} />
        </div>
      ) : null}

      {/* 메인: 올림(자리잡음) 카드 — 번호 큼직 + 완료 버튼 큼직. 해당 없으면 바로 완료. */}
      <div className="seat-station-active">
        {active.length === 0 ? (
          <div className="seat-station-empty">— 올림 없음 —</div>
        ) : (
          active.map((o) => {
            const st = stStatus(o.id)
            return (
              <div key={o.id} className="seat-station-card">
                <div className="seat-station-no">{orderLabel(o)}</div>
                <input
                  className="seat-input"
                  value={st?.change_note || ''}
                  placeholder="변동 (예: 포장)"
                  onChange={(e) => setStation(o.id, { change_note: e.target.value })}
                />
                <button
                  type="button"
                  className={`seat-complete-btn${celebrating === o.id ? ' is-celebrating' : ''}`}
                  onClick={() => complete(o.id)}
                  disabled={celebrating === o.id}
                >
                  <span className="seat-complete-check" aria-hidden="true">✓</span> 완료
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* 풋터: 자리후 대기(위) → 완료된 리스트(아래, 가로 스크롤). 완료가 제일 아래. */}
      <footer className="seat-station-footer">
        <div className="seat-station-foot-row">
          <span className="seat-station-foot-label">자리 후</span>
          <div className="seat-station-foot-chips"><QueueChips orders={waiting} empty="— 대기 없음 —" /></div>
        </div>
        <div className="seat-station-foot-row seat-station-done">
          <span className="seat-station-foot-label">완료</span>
          <div className="seat-station-foot-chips">
            {completed.length === 0 ? (
              <div className="seat-chips-empty">— 완료 없음 —</div>
            ) : (
              <div className="seat-chips">
                {completed.map((o) => (
                  <span key={o.id} className="seat-chip seat-chip-done seat-done-chip">
                    {orderLabel(o)}
                    {/* 잘못 완료했을 때 되돌리기 → 다시 올림(active)으로. */}
                    <button
                      type="button"
                      className="seat-undo-btn"
                      aria-label={`${orderLabel(o)} 완료 되돌리기`}
                      onClick={() => setStation(o.id, { completed: false })}
                    >↺</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
