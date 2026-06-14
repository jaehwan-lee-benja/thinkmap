// 배치도 모달 — 특정 (board, 날짜)의 멤버×역할 배치를 입력/편집.
// docs/MEMBER-SPEC.md §7.2. daily 본문(daily_blocks)과 분리된 독립 테이블(roster_assignments).

import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, Users } from 'lucide-react'
import { useRoster } from '../../hooks/useRoster'
import { useMembers } from '../../hooks/useMembers'
import {
  ROSTER_ROLE_PRESETS, ROSTER_SHIFTS, ROSTER_STATUS, ROSTER_STATUS_LABEL,
} from '../../utils/rosterPresets'
import './Roster.css'

function formatDateKo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${dateStr} (${days[d.getDay()]})`
}

export default function RosterModal({
  boardId, workDate, pageId, session, isMaster = false, canEdit = true, onClose,
}) {
  const userId = session?.user?.id || null
  const { rows, loading, addAssignment, updateAssignment, removeAssignment } = useRoster(boardId, workDate, pageId)
  const { members } = useMembers({ includeInactive: false })

  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [adding, setAdding] = useState(false)

  // 이미 배치된 멤버 id 집합 → 추가 드롭다운에서 제외
  const assignedMemberIds = useMemo(
    () => new Set(rows.map((r) => r.member_id).filter(Boolean)),
    [rows]
  )
  const availableMembers = useMemo(
    () => members.filter((m) => !assignedMemberIds.has(m.id)),
    [members, assignedMemberIds]
  )

  const handleAdd = async () => {
    if (!selectedMemberId) return
    const m = members.find((x) => x.id === selectedMemberId)
    if (!m) return
    setAdding(true)
    await addAssignment({
      memberId: m.id,
      memberName: m.name,
      role: m.seniority === '매니저' ? '매니저' : null,
      status: 'planned',
      createdBy: userId,
    })
    setSelectedMemberId('')
    setAdding(false)
  }

  const handleAddCustom = async () => {
    const name = prompt('멤버 마스터에 없는 인원 이름(임시):')
    if (!name?.trim()) return
    await addAssignment({ memberId: null, memberName: name.trim(), status: 'planned', createdBy: userId })
  }

  return createPortal(
    <div className="roster-modal-overlay" onClick={onClose}>
      <div className="roster-modal" onClick={(e) => e.stopPropagation()}>
        <div className="roster-modal-header">
          <div className="roster-modal-title">
            <Users size={16} />
            <span>배치도 · {formatDateKo(workDate)}</span>
          </div>
          <button className="roster-modal-close" onClick={onClose} title="닫기"><X size={18} /></button>
        </div>

        <div className="roster-modal-body">
          {loading ? (
            <div className="roster-empty">불러오는 중…</div>
          ) : rows.length === 0 ? (
            <div className="roster-empty">아직 배치된 인원이 없습니다.{canEdit ? ' 아래에서 멤버를 추가하세요.' : ''}</div>
          ) : (
            <table className="roster-table">
              <thead>
                <tr>
                  <th className="col-name">이름</th>
                  <th className="col-role">역할</th>
                  <th className="col-shift">오픈/마감</th>
                  <th className="col-status">상태</th>
                  {canEdit && <th className="col-del"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="col-name">
                      {r.member_name}
                      {!r.member_id && <span className="roster-tag-temp" title="멤버 마스터 미연결">임시</span>}
                    </td>
                    <td className="col-role">
                      {canEdit ? (
                        <input
                          list="roster-role-presets"
                          className="roster-input"
                          defaultValue={r.role || ''}
                          placeholder="역할"
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null
                            if (v !== (r.role || null)) updateAssignment(r.id, { role: v })
                          }}
                        />
                      ) : (r.role || '—')}
                    </td>
                    <td className="col-shift">
                      {canEdit ? (
                        <select className="roster-select" value={r.shift || ''} onChange={(e) => updateAssignment(r.id, { shift: e.target.value || null })}>
                          <option value="">—</option>
                          {ROSTER_SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (r.shift || '—')}
                    </td>
                    <td className="col-status">
                      {canEdit ? (
                        <select className="roster-select" value={r.status} onChange={(e) => updateAssignment(r.id, { status: e.target.value })}>
                          {ROSTER_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      ) : (ROSTER_STATUS_LABEL[r.status] || r.status)}
                    </td>
                    {canEdit && (
                      <td className="col-del">
                        <button className="roster-del-btn" title="제거" onClick={() => removeAssignment(r.id)}><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {canEdit && (
          <div className="roster-modal-footer">
            <select className="roster-select roster-add-select" value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)}>
              <option value="">멤버 선택…</option>
              {availableMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.seniority ? ` (${m.seniority})` : ''}
                </option>
              ))}
            </select>
            <button className="roster-add-btn" onClick={handleAdd} disabled={!selectedMemberId || adding}>
              <Plus size={14} /> 배치 추가
            </button>
            <button className="roster-add-custom" onClick={handleAddCustom} title="멤버 마스터에 없는 임시 인원">임시 인원</button>
          </div>
        )}

        <datalist id="roster-role-presets">
          {ROSTER_ROLE_PRESETS.map((r) => <option key={r} value={r} />)}
        </datalist>
      </div>
    </div>,
    document.body
  )
}
