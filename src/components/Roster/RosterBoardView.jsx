// 배치도 보드 뷰 — 매장 작전판. 상위 캔버스 위에 "주방/바 사각형"을 두고, 자리 슬롯을
// 자유 좌표(grid_col=x%, grid_row=y%)로 배치. 네모 안(주방)·밖(홀) 모두 가능.
// 오픈/마감/상시는 보드에서 분리 — 매칭은 role 기준만. (PLAN-roster-visual-board.md §6)
// 배치: 풀(또는 다른 자리)에서 멤버 "선택" → 자리 클릭 → 그 자리의 role 로 배치.

import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { ROSTER_ROLE_PRESETS, ROLE_TASKS } from '../../utils/rosterPresets'

const STATUS_META = {
  planned: { label: '예정', cls: 'st-planned' },
  worked: { label: '근무', cls: 'st-worked' },
  requested: { label: '요청', cls: 'st-requested' },
  accepted: { label: '수락', cls: 'st-accepted' },
  declined: { label: '거절', cls: 'st-declined' },
  tentative: { label: '미정', cls: 'st-tentative' },
}

function MemberChip({ row, canEdit, held, onPick, onRemove, onSetStatus }) {
  const meta = STATUS_META[row.status] || STATUS_META.planned
  const isHeld = held?.assignmentId === row.id
  return (
    <span className={`roster-chip ${isHeld ? 'is-held' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button" className="roster-chip-name as-btn"
        title={canEdit ? '선택 후 다른 자리 클릭 = 이동' : row.member_name}
        disabled={!canEdit} onClick={() => canEdit && onPick(row)}
      >
        {row.member_name}
      </button>
      {!row.member_id && <span className="roster-tag-temp" title="멤버 마스터 미연결">임시</span>}
      <button
        type="button" className={`roster-chip-status ${meta.cls}`}
        title={canEdit ? '예정/근무 전환' : meta.label} disabled={!canEdit}
        onClick={() => canEdit && onSetStatus(row.id, row.status === 'worked' ? 'planned' : 'worked')}
      >
        {meta.label}
      </button>
      {canEdit && (
        <button type="button" className="roster-chip-del" title="빼기(풀로)" onClick={() => onRemove(row.id)}>
          <X size={12} />
        </button>
      )}
    </span>
  )
}

export default function RosterBoardView({
  rows, template, members = [], canEdit, onPlace, onRemove, onSetStatus,
}) {
  const [held, setHeld] = useState(null)

  const assignedMemberIds = useMemo(
    () => new Set(rows.map((r) => r.member_id).filter(Boolean)), [rows]
  )
  const poolMembers = useMemo(
    () => members.filter((m) => !assignedMemberIds.has(m.id)), [members, assignedMemberIds]
  )

  // 슬롯별 배치 매핑(역할 기준) + 미배치
  const { slotRows, unassigned } = useMemo(() => {
    const consumed = new Set()
    const map = new Map()
    for (const s of template?.slots || []) {
      const matched = rows.filter((r) => !consumed.has(r.id) && r.role === s.role)
      matched.forEach((r) => consumed.add(r.id))
      map.set(s.id, matched)
    }
    return { slotRows: map, unassigned: rows.filter((r) => !consumed.has(r.id)) }
  }, [rows, template])

  const place = (slot) => {
    if (!held || !canEdit) return
    onPlace(held, slot)
    setHeld(null)
  }
  const pickRow = (row) => setHeld((h) => (h?.assignmentId === row.id ? null : { assignmentId: row.id, memberId: row.member_id, memberName: row.member_name }))
  const pickPool = (m) => setHeld((h) => (h?.memberId === m.id && !h?.assignmentId ? null : { memberId: m.id, memberName: m.name }))

  // ── 폴백: 템플릿 없음 → role 그룹핑 카드 ───────────────────────────────────
  if (!template) {
    const byRole = new Map(); const noRole = []
    for (const r of rows) {
      const role = (r.role || '').trim()
      if (!role) { noRole.push(r); continue }
      if (!byRole.has(role)) byRole.set(role, [])
      byRole.get(role).push(r)
    }
    const ordered = ROSTER_ROLE_PRESETS.filter((role) => byRole.has(role))
      .map((role) => ({ role, tasks: ROLE_TASKS[role] || '', members: byRole.get(role) }))
    if (rows.length === 0) {
      return <div className="roster-empty">상단에서 <b>체제를 불러오면</b> 작전판이 표시됩니다. (또는 [표] 보기에서 멤버 추가)</div>
    }
    return (
      <div className="roster-board">
        <div className="roster-board-grid">
          {ordered.map((slot) => (
            <div key={slot.role} className="roster-slot">
              <div className="roster-slot-head">
                <span className="roster-slot-role">{slot.role}</span>
                {slot.tasks && <span className="roster-slot-tasks">{slot.tasks}</span>}
              </div>
              <div className="roster-slot-members">
                {slot.members.map((r) => (
                  <MemberChip key={r.id} row={r} canEdit={canEdit} held={held} onPick={pickRow} onRemove={onRemove} onSetStatus={onSetStatus} />
                ))}
              </div>
            </div>
          ))}
        </div>
        {noRole.length > 0 && (
          <div className="roster-slot roster-slot-unassigned">
            <div className="roster-slot-head"><span className="roster-slot-role">미배치 / 기타</span></div>
            <div className="roster-slot-members">
              {noRole.map((r) => (
                <MemberChip key={r.id} row={r} canEdit={canEdit} held={held} onPick={pickRow} onRemove={onRemove} onSetStatus={onSetStatus} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 작전판(캔버스 + 주방 사각형) ───────────────────────────────────────────
  return (
    <div className="roster-board">
      {canEdit && (
        <div className="roster-pool">
          <span className="roster-pool-label">미배치 멤버{held ? ' · 작전판의 자리를 클릭해 배치' : ''}</span>
          <div className="roster-pool-chips">
            {poolMembers.length === 0 && <span className="roster-pool-empty">모두 배치됨</span>}
            {poolMembers.map((m) => (
              <button
                key={m.id} type="button"
                className={`roster-pool-chip ${held?.memberId === m.id && !held?.assignmentId ? 'is-held' : ''}`}
                onClick={() => pickPool(m)}
              >
                {m.name}{m.seniority ? <span className="roster-pool-sr">{m.seniority}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="roster-field" onClick={() => setHeld(null)}>
        {/* 상위 배경 = 홀, 안쪽 사각형 = 주방/바 (체제별 좌표) */}
        <span className="roster-field-hall-label">홀</span>
        <div
          className="roster-field-kitchen"
          style={{
            left: `${template.kitchen_x ?? 6}%`, top: `${template.kitchen_y ?? 44}%`,
            width: `${template.kitchen_w ?? 88}%`, height: `${template.kitchen_h ?? 52}%`,
          }}
        >
          <span className="roster-field-kitchen-label">주방 · 바</span>
        </div>

        {(template.slots || []).map((s) => {
          const placed = slotRows.get(s.id) || []
          const canDrop = canEdit && !!held
          return (
            <div
              key={s.id}
              className={`roster-fieldslot ${canDrop ? 'can-drop' : ''} ${placed.length ? 'is-filled' : ''}`}
              style={{ left: `${s.grid_col}%`, top: `${s.grid_row}%` }}
              onClick={(e) => { e.stopPropagation(); if (canDrop) place(s) }}
            >
              <div className="roster-fieldslot-head">
                <span className="roster-slot-role">{s.label || s.role}</span>
              </div>
              {s.tasks && <span className="roster-fieldslot-tasks">{s.tasks}</span>}
              <div className="roster-fieldslot-members">
                {placed.map((r) => (
                  <MemberChip key={r.id} row={r} canEdit={canEdit} held={held} onPick={pickRow} onRemove={onRemove} onSetStatus={onSetStatus} />
                ))}
                {placed.length === 0 && <span className="roster-slot-empty">{canDrop ? '여기 클릭' : '—'}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="roster-slot roster-slot-unassigned">
          <div className="roster-slot-head">
            <span className="roster-slot-role">미배치 / 기타</span>
            <span className="roster-slot-tasks">이 체제 자리에 없는 역할 — 자리 클릭해 재배치하거나 [표]에서 정리</span>
          </div>
          <div className="roster-slot-members">
            {unassigned.map((r) => (
              <MemberChip key={r.id} row={r} canEdit={canEdit} held={held} onPick={pickRow} onRemove={onRemove} onSetStatus={onSetStatus} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
