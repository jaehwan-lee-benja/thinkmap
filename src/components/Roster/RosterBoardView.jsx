// 배치도 보드 뷰 — 매장 작전판. 상위 캔버스 위에 "주방/바 사각형"을 두고, 자리 슬롯을
// 자유 좌표(grid_col=x%, grid_row=y%)로 배치. 네모 안(주방)·밖(홀) 모두 가능.
// 오픈/마감/상시는 보드에서 분리 — 매칭은 role 기준만. (PLAN-roster-visual-board.md §6)
// 배치(Phase C): 멤버를 자리로 "드래그"(dnd-kit) 또는 "선택 후 클릭". 둘 다 그 자리의 role 로 배치.
//   - 풀 멤버 → 자리 = 배치 추가 / 자리 → 다른 자리 = 이동(role 변경) / 자리 → 풀 = 빼기.

import React, { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, useDraggable, useDroppable,
} from '@dnd-kit/core'
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

// 배치된 멤버 칩 — 이름이 드래그 핸들(+클릭 선택). 상태/빼기 버튼은 드래그 비대상.
function MemberChip({ row, canEdit, held, onPick, onRemove, onSetStatus }) {
  const meta = STATUS_META[row.status] || STATUS_META.planned
  const isHeld = held?.assignmentId === row.id
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${row.id}`,
    data: { kind: 'placed', assignmentId: row.id, memberId: row.member_id, memberName: row.member_name },
    disabled: !canEdit,
  })
  return (
    <span
      className={`roster-chip ${isHeld ? 'is-held' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button" ref={setNodeRef} className="roster-chip-name as-btn"
        title={canEdit ? '드래그해 자리 이동, 또는 클릭 후 다른 자리 클릭' : row.member_name}
        disabled={!canEdit} onClick={() => canEdit && onPick(row)}
        {...listeners} {...attributes}
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

// 풀(미배치) 멤버 칩 — 드래그 소스 + 클릭 선택.
function PoolChip({ m, held, canEdit, onPick }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:${m.id}`,
    data: { kind: 'pool', memberId: m.id, memberName: m.name },
    disabled: !canEdit,
  })
  const isHeld = held?.memberId === m.id && !held?.assignmentId
  return (
    <button
      ref={setNodeRef} type="button"
      className={`roster-pool-chip ${isHeld ? 'is-held' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onClick={() => onPick(m)} {...listeners} {...attributes}
    >
      {m.name}{m.seniority ? <span className="roster-pool-sr">{m.seniority}</span> : null}
    </button>
  )
}

// 자리 슬롯(작전판) — 드롭존. 클릭 배치도 지원.
function FieldSlot({ s, placed, canEdit, held, dragging, onPlaceClick, chipProps }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${s.id}`, data: { kind: 'slot', slot: s } })
  const canDrop = canEdit && (!!held || dragging)
  return (
    <div
      ref={setNodeRef}
      className={`roster-fieldslot ${canDrop ? 'can-drop' : ''} ${isOver ? 'is-over' : ''} ${placed.length ? 'is-filled' : ''}`}
      style={{ left: `${s.grid_col}%`, top: `${s.grid_row}%` }}
      onClick={(e) => { e.stopPropagation(); if (canEdit && held) onPlaceClick(s) }}
    >
      <div className="roster-fieldslot-head">
        <span className="roster-slot-role">{s.label || s.role}</span>
      </div>
      {s.tasks && <span className="roster-fieldslot-tasks">{s.tasks}</span>}
      <div className="roster-fieldslot-members">
        {placed.map((r) => <MemberChip key={r.id} row={r} {...chipProps} />)}
        {placed.length === 0 && <span className="roster-slot-empty">{canDrop ? '여기로 드래그/클릭' : '—'}</span>}
      </div>
    </div>
  )
}

// 역할 그룹 카드(폴백/미배치) — 드롭존(역할 키만).
function RoleCard({ role, tasks, members, canEdit, held, dragging, extraClass = '', headTask, onPlaceClick, chipProps }) {
  const { setNodeRef, isOver } = useDroppable({ id: `role:${role}`, data: { kind: 'slot', slot: { role } } })
  const canDrop = canEdit && (!!held || dragging)
  return (
    <div
      ref={setNodeRef}
      className={`roster-slot ${extraClass} ${canDrop ? 'can-drop' : ''} ${isOver ? 'is-over' : ''}`}
      onClick={() => { if (canEdit && held) onPlaceClick({ role }) }}
    >
      <div className="roster-slot-head">
        <span className="roster-slot-role">{role}</span>
        {(tasks || headTask) && <span className="roster-slot-tasks">{tasks || headTask}</span>}
      </div>
      <div className="roster-slot-members">
        {members.map((r) => <MemberChip key={r.id} row={r} {...chipProps} />)}
      </div>
    </div>
  )
}

export default function RosterBoardView({
  rows, template, members = [], canEdit, onPlace, onRemove, onSetStatus,
}) {
  const [held, setHeld] = useState(null)
  const [activeDrag, setActiveDrag] = useState(null)

  const sensors = useSensors(
    // 활성 거리 6px → 짧은 탭/클릭은 드래그로 보지 않음(클릭 배치·버튼 클릭 보존).
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

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

  // 클릭 배치(선택→자리 클릭). 드래그와 동일하게 onPlace 로 흡수.
  const placeClick = (slot) => {
    if (!held || !canEdit) return
    onPlace(held, slot)
    setHeld(null)
  }
  const pickRow = (row) => setHeld((h) => (h?.assignmentId === row.id ? null : { assignmentId: row.id, memberId: row.member_id, memberName: row.member_name }))
  const pickPool = (m) => setHeld((h) => (h?.memberId === m.id && !h?.assignmentId ? null : { memberId: m.id, memberName: m.name }))

  // 드래그 종료 → 드롭 대상에 따라 배치/이동/빼기.
  const handleDragStart = ({ active }) => { setHeld(null); setActiveDrag(active.data.current) }
  const handleDragCancel = () => setActiveDrag(null)
  const handleDragEnd = ({ active, over }) => {
    setActiveDrag(null)
    if (!over || !canEdit) return
    const a = active.data.current
    const o = over.data.current
    if (!o) return
    if (o.kind === 'slot') {
      const item = a.kind === 'placed'
        ? { assignmentId: a.assignmentId, memberId: a.memberId, memberName: a.memberName }
        : { memberId: a.memberId, memberName: a.memberName }
      // 같은 자리에 그대로 떨어뜨리면 무시(불필요한 쓰기 방지)
      if (a.kind === 'placed' && o.slot.role === (rows.find((r) => r.id === a.assignmentId)?.role)) return
      onPlace(item, o.slot)
    } else if (o.kind === 'pool' && a.kind === 'placed') {
      onRemove(a.assignmentId)
    }
  }

  const chipProps = { canEdit, held, onPick: pickRow, onRemove, onSetStatus }
  const dragging = !!activeDrag

  // 풀(드롭=빼기) 드롭존
  function Pool() {
    const { setNodeRef, isOver } = useDroppable({ id: 'pool', data: { kind: 'pool' } })
    return (
      <div ref={setNodeRef} className={`roster-pool ${isOver ? 'is-over-remove' : ''}`}>
        <span className="roster-pool-label">
          미배치 멤버{held ? ' · 작전판의 자리를 클릭해 배치' : ' · 자리로 드래그해 배치'}
          {dragging ? ' · 여기로 끌면 빼기' : ''}
        </span>
        <div className="roster-pool-chips">
          {poolMembers.length === 0 && <span className="roster-pool-empty">모두 배치됨</span>}
          {poolMembers.map((m) => (
            <PoolChip key={m.id} m={m} held={held} canEdit={canEdit} onPick={pickPool} />
          ))}
        </div>
      </div>
    )
  }

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
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        <div className="roster-board">
          {canEdit && <Pool />}
          <div className="roster-board-grid">
            {ordered.map((slot) => (
              <RoleCard
                key={slot.role} role={slot.role} tasks={slot.tasks} members={slot.members}
                canEdit={canEdit} held={held} dragging={dragging}
                onPlaceClick={placeClick} chipProps={chipProps}
              />
            ))}
          </div>
          {noRole.length > 0 && (
            <RoleCard
              role="미배치 / 기타" tasks="" members={noRole}
              canEdit={canEdit} held={held} dragging={dragging} extraClass="roster-slot-unassigned"
              onPlaceClick={() => { /* 역할 없는 그룹엔 클릭배치 비활성 */ }} chipProps={chipProps}
            />
          )}
        </div>
        <DragOverlay>{activeDrag ? <span className="roster-chip roster-chip-overlay"><span className="roster-chip-name">{activeDrag.memberName}</span></span> : null}</DragOverlay>
      </DndContext>
    )
  }

  // ── 작전판(캔버스 + 주방 사각형) ───────────────────────────────────────────
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="roster-board">
        {canEdit && <Pool />}

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

          {(template.slots || []).map((s) => (
            <FieldSlot
              key={s.id} s={s} placed={slotRows.get(s.id) || []}
              canEdit={canEdit} held={held} dragging={dragging}
              onPlaceClick={placeClick} chipProps={chipProps}
            />
          ))}
        </div>

        {unassigned.length > 0 && (
          <RoleCard
            role="미배치 / 기타" tasks="이 체제 자리에 없는 역할 — 자리로 드래그하거나 [표]에서 정리"
            members={unassigned} canEdit={canEdit} held={held} dragging={dragging}
            extraClass="roster-slot-unassigned"
            onPlaceClick={() => { /* 역할 없는 그룹엔 클릭배치 비활성 */ }} chipProps={chipProps}
          />
        )}
      </div>
      <DragOverlay>{activeDrag ? <span className="roster-chip roster-chip-overlay"><span className="roster-chip-name">{activeDrag.memberName}</span></span> : null}</DragOverlay>
    </DndContext>
  )
}
