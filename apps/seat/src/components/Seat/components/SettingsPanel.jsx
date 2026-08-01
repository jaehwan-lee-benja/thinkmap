// 설정 패널 — config/seatSettings.js 의 SEAT_SETTINGS 만 보고 그리는 범용 렌더러.
// ★ 새 설정을 넣을 때 이 파일은 건드리지 않는다(항목만 SEAT_SETTINGS 에 추가).
//   단, 새로운 type 을 도입할 때만 아래 렌더 분기를 확장한다.
import { useState } from 'react'
import { getThemePref, setThemePref } from '@thinkmap/core'
import { SEAT_SETTINGS, toggleHiddenColumn } from '../config/seatSettings'
import SeatModal from './SeatModal'

const THEMES = [
  { key: 'system', label: '시스템' },
  { key: 'light', label: '라이트' },
  { key: 'dark', label: '다크' },
]

export default function SettingsPanel({ open, settings = {}, onChange, onResetColumnWidths, onOpenStatus, onOpenStats, onResetToday, onClose }) {
  // 화면 테마 — 공유 헬퍼(@thinkmap/core)로 <html data-theme> 적용. 모선·다른 위성과 같은 저장키를 쓴다.
  const [theme, setTheme] = useState(getThemePref)
  const pickTheme = (k) => { setThemePref(k); setTheme(k) }

  return (
    <SeatModal open={open} title="설정" onClose={onClose} foot="이 설정은 이 기기에만 저장됩니다.">
      <div className="seat-settings-body">
        {/* 화면 테마 — 라이트/다크/시스템. */}
        <div className="seat-settings-row seat-settings-row--block">
          <span className="seat-settings-row-text">
            <span className="seat-settings-row-label">화면 테마</span>
            <span className="seat-settings-row-hint">밝기를 고릅니다. ‘시스템’은 기기 설정을 따릅니다.</span>
          </span>
          <div className="seat-theme-pick">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`seat-btn${theme === t.key ? ' seat-btn-primary' : ''}`}
                aria-pressed={theme === t.key}
                onClick={() => pickTheme(t.key)}
              >{t.label}</button>
            ))}
          </div>
        </div>
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

        {/* 통계 — 오늘/지난 날짜의 플로우 소요시간·제조옵션 분포 등. */}
        {onOpenStats && (
          <div className="seat-settings-row seat-settings-row--block">
            <span className="seat-settings-row-text">
              <span className="seat-settings-row-label">통계 보기</span>
              <span className="seat-settings-row-hint">구간 소요시간·제조옵션 변경·운영 신호. 지난 날짜도 볼 수 있습니다.</span>
            </span>
            <div>
              <button type="button" className="seat-btn" onClick={onOpenStats}>통계 열기</button>
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

        {/* 오늘자 초기화 — 오늘 주문을 모두 비운다(soft delete). 실행 후 10초간 하단에서 되돌릴 수 있다. */}
        {onResetToday && (
          <div className="seat-settings-row seat-settings-row--block">
            <span className="seat-settings-row-text">
              <span className="seat-settings-row-label">오늘자 초기화</span>
              <span className="seat-settings-row-hint">오늘 주문 기록을 모두 비웁니다. 실행 후 10초간 ‘초기화 취소’로 되돌릴 수 있습니다.</span>
            </span>
            <div>
              <button type="button" className="seat-btn seat-btn-danger" onClick={onResetToday}>오늘자 초기화</button>
            </div>
          </div>
        )}
      </div>
    </SeatModal>
  )
}
