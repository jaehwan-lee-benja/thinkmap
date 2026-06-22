// 카이막/커피 스테이션 화면 — 동일 컴포넌트를 role.station 으로 재사용, 서로 독립(R6). (SEAT-SPEC §9.3)
// 카메라 슬롯 + 올림(자리잡음) 목록 + 자리후(대기중) + 내 완료 리스트.
import LiveCameraFeed from '../components/LiveCameraFeed'

export default function StationScreen({ role, orders = [], stations = [], onPatchStation }) {
  const stationKey = role?.station
  return (
    <div className="seat-screen seat-screen-station">
      <div className="seat-screen-grid">
        <div className="seat-col-main">
          <div className="seat-panel">
            <div className="seat-panel-title">올림 (자리잡음)</div>
            {/* TODO: 올림된 주문 목록 + 각 번호 [완료] 버튼(이 스테이션 독립, R6) + 변동사항 */}
            <div className="seat-panel-body">— 연결 예정 —</div>
          </div>
          <div className="seat-panel">
            <div className="seat-panel-title">자리후 (대기중)</div>
            <div className="seat-panel-body">— 연결 예정 —</div>
          </div>
          <div className="seat-panel">
            <div className="seat-panel-title">완료된 리스트 (내 완료)</div>
            <div className="seat-panel-body">— 연결 예정 —</div>
          </div>
        </div>

        <aside className="seat-col-side">
          <LiveCameraFeed station={stationKey} label={role?.label} enabled={false} />
        </aside>
      </div>
    </div>
  )
}
