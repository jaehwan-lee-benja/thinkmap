// 카이막/커피 스테이션 화면 — 동일 컴포넌트를 role.station 으로 재사용, 서로 독립(R6). (SEAT-SPEC §9.3)
// 슬라이드 레이아웃: [카메라 大 좌측] · [올림(자리잡음)+완료 중앙] · [자리후 대기 우측].
import LiveCameraFeed from '../components/LiveCameraFeed'
import QueueChips from '../components/QueueChips'
import { isWaitingOrder, isRaisedOrder, orderLabel } from '../utils/seatRules'

export default function StationScreen({ role, orders = [], stations = [], onPatchStation }) {
  const stationKey = role?.station
  const stStatus = (orderId) => stations.find((s) => s.order_id === orderId && s.station === stationKey)

  const waiting = orders.filter(isWaitingOrder)
  const raised = orders.filter(isRaisedOrder)
  const active = raised.filter((o) => !stStatus(o.id)?.completed)   // 아직 완료 안 한 올림
  const completed = raised.filter((o) => stStatus(o.id)?.completed) // 내가 완료한 것(스테이션 독립)

  const setStation = (orderId, patch) => onPatchStation?.(orderId, stationKey, patch)

  return (
    <div className="seat-screen seat-screen-station">
      <div className="seat-station-grid">
        {/* 좌: 카메라 라이브(큰 영역) */}
        <div className="seat-station-camera">
          <LiveCameraFeed station={stationKey} label={role?.label} enabled={false} />
        </div>

        {/* 중: 올림(자리잡음) + 완료된 리스트 */}
        <div className="seat-station-work">
          <div className="seat-panel">
            <div className="seat-panel-title">
              자리 잡음 (올림) <span className="seat-panel-hint">* 해당 없으면 완료 누르기</span>
            </div>
            <div className="seat-panel-body">
              {active.length === 0 ? (
                <div className="seat-chips-empty">— 올림 없음 —</div>
              ) : (
                <div className="seat-raised-list">
                  {active.map((o) => {
                    const st = stStatus(o.id)
                    return (
                      <div key={o.id} className="seat-raised-card">
                        <span className="seat-raised-no">{orderLabel(o)}</span>
                        <input
                          className="seat-input seat-raised-note"
                          value={st?.change_note || ''}
                          placeholder="변동 사항 (예: 포장으로 변경)"
                          onChange={(e) => setStation(o.id, { change_note: e.target.value })}
                        />
                        <button className="seat-toggle" onClick={() => setStation(o.id, { completed: true })}>완료</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="seat-panel">
            <div className="seat-panel-title">완료된 리스트 (내 완료)</div>
            <div className="seat-panel-body"><QueueChips orders={completed} empty="— 완료 없음 —" done /></div>
          </div>
        </div>

        {/* 우: 자리후(대기중) */}
        <div className="seat-station-waiting">
          <div className="seat-panel">
            <div className="seat-panel-title">자리 후 (대기중)</div>
            <div className="seat-panel-body"><QueueChips orders={waiting} empty="— 대기 없음 —" /></div>
          </div>
        </div>
      </div>
    </div>
  )
}
