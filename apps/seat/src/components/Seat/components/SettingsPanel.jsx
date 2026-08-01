// 설정 패널 — config/seatSettings.js 의 SEAT_SETTINGS 만 보고 그리는 범용 렌더러.
// ★ 새 설정을 넣을 때 이 파일은 건드리지 않는다(항목만 SEAT_SETTINGS 에 추가).
//   단, 새로운 type 을 도입할 때만 아래 렌더 분기를 확장한다.
import { SEAT_SETTINGS, toggleHiddenColumn } from '../config/seatSettings'
import SeatModal from './SeatModal'

export default function SettingsPanel({ open, settings = {}, onChange, onResetColumnWidths, onOpenStatus, onClose }) {
  return (
    <SeatModal open={open} title="설정" onClose={onClose} foot="이 설정은 이 기기에만 저장됩니다.">
      <div className="seat-settings-body">
        {/* 통합 현황 — 모든 역할 공용. 설정 안에서 연다(상단바에서 이동). */}
        {onOpenStatus && (
          <div className="seat-settings-row seat-settings-row--block">
            <span className="seat-settings-row-text">
              <span className="seat-settings-row-label">현황</span>
              <span className="seat-settings-row-hint">모든 역할이 같은 통합 현황을 봅니다.</span>
            </span>
            <div>
              <button type="button" className="seat-btn" onClick={onOpenStatus}>현황 열기</button>
            </div>
          </div>
        )}
        {SEAT_SETTINGS.map((s) => {
          const head = (
            <span className="seat-settings-row-text">
              <span className="seat-settings-row-label">{s.label}</span>
              {s.hint ? <span className="seat-settings-row-hint">{s.hint}</span> : null}
            </span>
          )

          // 열 표시/숨김 — 체크 = 보임. 저장값은 '숨긴 열' 목록.
          if (s.type === 'columns') {
            const hidden = Array.isArray(settings[s.key]) ? settings[s.key] : []
            return (
              <div key={s.key} className="seat-settings-row seat-settings-row--block">
                {head}
                <div className="seat-settings-cols">
                  {(s.options || []).map((c) => (
                    <label key={c.key} className="seat-settings-col">
                      <input
                        type="checkbox"
                        checked={!hidden.includes(c.key)}
                        onChange={(e) => onChange?.(s.key, toggleHiddenColumn(hidden, c.key, e.target.checked))}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <label key={s.key} className="seat-settings-row">
              {head}
              {s.type === 'toggle' ? (
                <span className="seat-check">
                  <input
                    type="checkbox"
                    checked={!!settings[s.key]}
                    onChange={(e) => onChange?.(s.key, e.target.checked)}
                  />
                </span>
              ) : null}
            </label>
          )
        })}

        {/* 열 폭 조절값 초기화 — 헤더 경계 드래그로 바꾼 폭을 기본값으로 되돌린다. */}
        {onResetColumnWidths && (
          <div className="seat-settings-row seat-settings-row--block">
            <span className="seat-settings-row-text">
              <span className="seat-settings-row-label">표 열 너비</span>
              <span className="seat-settings-row-hint">헤더 경계를 드래그해 열 폭을 조절합니다. 아래 버튼으로 기본값으로 되돌립니다.</span>
            </span>
            <div>
              <button type="button" className="seat-btn" onClick={onResetColumnWidths}>열 너비 초기화</button>
            </div>
          </div>
        )}
      </div>
    </SeatModal>
  )
}
