// 배치도 보드 뷰 — 작전판(자리판)만. 홀(바깥)+주방/바 네모, 자리 슬롯(자유 좌표).
// PLAN-roster-visual-board.md §6·§12. 미배치 풀은 우측 명단 패널이 담당(중복 제거).
//   - 배치: 우측 확정 인원을 자리로 드래그(또는 클릭 후 자리 클릭). DnD 컨텍스트는 RosterModal이 소유.
//   - 자리 칩 X = 자리 빼기(role=null, 명단 확정 유지).

import React from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { X } from 'lucide-react'

function SlotChip({ item, canEdit, held, onPick, onUnplace }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `slot:${item.assignmentId}`, data: item, disabled: !canEdit })
  const isHeld = held?.kind === 'row' && held.assignmentId === item.assignmentId
  return (
    <span className={`roster-chip ${isHeld ? 'is-held' : ''} ${isDragging ? 'is-dragging' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" ref={setNodeRef} className="roster-chip-name as-btn" disabled={!canEdit}
        onClick={() => canEdit && onPick(item)} {...listeners} {...attributes} title={canEdit ? '드래그/클릭해 이동' : item.name}>
        {item.name}
      </button>
      {item.temp && <span className="roster-tag-temp" title="멤버 마스터 미연결">임시</span>}
      {canEdit && <button type="button" className="roster-chip-del" title="자리 빼기(미배치)" onClick={() => onUnplace(item.assignmentId)}><X size={12} /></button>}
    </span>
  )
}

function FieldSlot({ s, placed, canEdit, held, onPlaceClick, chipProps }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${s.id}`, data: { kind: 'slot', slot: s } })
  const canDrop = canEdit && !!held
  return (
    <div
      ref={setNodeRef}
      className={`roster-fieldslot ${canDrop ? 'can-drop' : ''} ${isOver ? 'is-over' : ''} ${placed.length ? 'is-filled' : ''}`}
      style={{ left: `${s.grid_col}%`, top: `${s.grid_row}%` }}
      onClick={(e) => { e.stopPropagation(); if (canEdit && held) onPlaceClick(s) }}
    >
      <div className="roster-fieldslot-head"><span className="roster-slot-role">{s.label || s.role}</span></div>
      {s.tasks && <span className="roster-fieldslot-tasks">{s.tasks}</span>}
      <div className="roster-fieldslot-members">
        {placed.map((it) => <SlotChip key={`r${it.assignmentId}`} item={it} {...chipProps} />)}
        {placed.length === 0 && <span className="roster-slot-empty">{canDrop ? '여기로' : '—'}</span>}
      </div>
    </div>
  )
}

export default function RosterBoardView({ template, layout, slotItems, canEdit, held, onPlaceClick, onPick, onUnplace, onDeselect }) {
  const chipProps = { canEdit, held, onPick, onUnplace }
  const L = layout || {}
  return (
    <div className="roster-field" onClick={onDeselect} style={{ '--roster-field-ratio': L.field_ratio ?? 1.6, '--roster-field-size': `${L.field_size ?? 56}vh` }}>
      {/* 홀·주방 네모 = 보드 공통 레이아웃 (모든 체제 공유) */}
      <div className="roster-field-hall" style={{ left: `${L.hall_x ?? 6}%`, top: `${L.hall_y ?? 4}%`, width: `${L.hall_w ?? 88}%`, height: `${L.hall_h ?? 36}%` }}>
        <span className="roster-field-hall-label">홀</span>
      </div>
      <div className="roster-field-kitchen" style={{ left: `${L.kitchen_x ?? 6}%`, top: `${L.kitchen_y ?? 44}%`, width: `${L.kitchen_w ?? 88}%`, height: `${L.kitchen_h ?? 52}%` }}>
        <span className="roster-field-kitchen-label">주방 · 바</span>
      </div>
      {!template && (
        <div className="roster-field-hint">상단에서 <b>체제를 불러오면</b> 자리(카드)가 표시됩니다.<br />우측 <b>확정 인원</b>을 자리로 드래그하세요.</div>
      )}
      {(template?.slots || []).map((s) => (
        <FieldSlot key={s.id} s={s} placed={slotItems.get(s.id) || []} canEdit={canEdit} held={held} onPlaceClick={onPlaceClick} chipProps={chipProps} />
      ))}
    </div>
  )
}
