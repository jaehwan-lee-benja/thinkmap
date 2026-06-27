// 라이브 카메라 — 순수 '스트림 표시' 슬롯. (SEAT-SPEC §11)
// ★ orders / station_status 데이터 로직과 절대 결합하지 않는다. props 만 받는다.
//   현재: enabled=false 또는 streamUrl 없으면 placeholder.
//   향후: streamUrl 주입 시 같은 슬롯에 <img> 드롭인(레이아웃 재작업 없이).
export default function LiveCameraFeed({ station = '', streamUrl = '', enabled = false, label = '' }) {
  const active = enabled && !!streamUrl
  return (
    <div className="seat-camera" data-station={station}>
      {active ? (
        <img className="seat-camera-stream" src={streamUrl} alt={`${label || station} 카메라`} />
      ) : (
        <div className="seat-camera-placeholder">
          <div className="seat-camera-placeholder-title">카메라 연동 예정</div>
          <div className="seat-camera-placeholder-sub">하드웨어 입고 후 MJPEG 연결</div>
        </div>
      )}
    </div>
  )
}
