import React from 'react'
import { X } from 'lucide-react'
import { ownerHue } from './scheduleUtils'

/**
 * 캘린더 설정 모달.
 * Phase 1.5: 계정 체크박스 + 마스터 전체 토글 + owner hue 마커.
 *   - 토글은 즉시 반영 (props 콜백으로 부모 state 갱신 → 캘린더 자동 refetch)
 *   - 모달 안 닫고도 캘린더 갱신 확인 가능
 *
 * Phase 2 이후: 기본 색/알림/RRULE 디폴트 등이 이 모달에 추가됨.
 */
const COLOR_PRESETS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#64748b',
]

export default function ScheduleSettingsModal({
  isOpen,
  onClose,
  selfUid,
  selfEmail,
  linkedAccounts,
  enabledOwners,
  onToggleOwner,
  isMaster,
  masterAll,
  onToggleMasterAll,
  colorLabels = {},
  onSetColorLabel,
}) {
  if (!isOpen) return null

  const rows = [
    { uid: selfUid, email: selfEmail || '내 계정', isSelf: true },
    ...linkedAccounts.map(la => ({
      uid: la.linked_auth_uid,
      email: la.linked_email,
      isSelf: false,
    })),
  ].filter(r => r.uid)

  return (
    <div className="event-editor-backdrop" onClick={onClose}>
      <div className="event-editor schedule-settings" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h3>캘린더 설정</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="section-label">표시할 계정</label>
          <div className="owner-list">
            {rows.map(r => {
              const on = enabledOwners.includes(r.uid)
              const hue = ownerHue(r.uid, selfUid)
              return (
                <label key={r.uid} className="owner-row">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggleOwner(r.uid)}
                  />
                  <span className="owner-marker" style={{ background: hue }} />
                  <span className="owner-email">
                    {r.email}{r.isSelf ? ' (나)' : ''}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {isMaster && (
          <div className="master-section">
            <label className="section-label">마스터 옵션</label>
            <label className="owner-row">
              <input
                type="checkbox"
                checked={masterAll}
                onChange={onToggleMasterAll}
              />
              <span className="owner-marker master-marker">★</span>
              <span className="owner-email">
                전체 계정 일정 표시 (위 체크박스 무시)
              </span>
            </label>
          </div>
        )}

        {/* 색상 카테고리 라벨 — 7색에 사용자 정의 이름 부여. localStorage 영속화. */}
        <div className="master-section">
          <label className="section-label">색상 라벨 (선택)</label>
          <div className="color-label-list">
            {COLOR_PRESETS.map(c => (
              <div key={c} className="color-label-row">
                <span className="owner-marker" style={{ background: c }} />
                <input
                  type="text"
                  placeholder="라벨 (예: 업무, 개인…)"
                  value={colorLabels[c] || ''}
                  onChange={e => onSetColorLabel?.(c, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="actions">
          <div />
          <button className="primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  )
}
