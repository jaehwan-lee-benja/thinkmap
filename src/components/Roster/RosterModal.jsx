// 배치도 모달 — 특정 (board, 날짜)의 멤버×역할 배치를 입력/편집.
// docs/MEMBER-SPEC.md §7.2. daily 본문(daily_blocks)과 분리된 독립 테이블(roster_assignments).

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { X, Plus, Trash2, Users, LayoutGrid, List } from 'lucide-react'
import { useRoster } from '../../hooks/useRoster'
import { useMembers } from '../../hooks/useMembers'
import { useRosterTemplates, suggestTemplate } from '../../hooks/useRosterTemplates'
import { useRosterLayout, DEFAULT_LAYOUT } from '../../hooks/useRosterLayout'
import {
  ROSTER_ROLE_PRESETS, ROSTER_SHIFTS, ROSTER_STATUS, ROSTER_STATUS_LABEL,
} from '../../utils/rosterPresets'
import RosterBoardView from './RosterBoardView'
import RosterBoardEditor from './RosterBoardEditor'
import RosterPrintView from './RosterPrintView'
import RosterMemberPanel from './RosterMemberPanel'
import './Roster.css'

function formatDateKo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${dateStr} (${days[d.getDay()]})`
}

export default function RosterModal({
  boardId, workDate, pageId, session, isMaster = false, canEdit = true, onClose, onNavigateToMembers,
}) {
  const userId = session?.user?.id || null
  const { rows, loading, addAssignment, updateAssignment, removeAssignment } = useRoster(boardId, workDate, pageId)
  const { members } = useMembers({ includeInactive: false })
  const { templates, replaceSlots, createTemplate } = useRosterTemplates(boardId)
  const { layout, saveLayout } = useRosterLayout(boardId)

  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [adding, setAdding] = useState(false)
  // 보드(시각) / 표(빠른입력) 토글. 기본은 보드 — 슬라이드 작전보드 대체. (PLAN-roster-visual-board Phase A)
  const [view, setView] = useState('board')
  // 출력/풀스크린 읽기 뷰(Phase E). canEdit 무관.
  const [printMode, setPrintMode] = useState(false)

  // 선택된 체제(템플릿). 미선택('') = 폴백(역할 그룹핑). 날짜/인원 기반 자동 추천을 기본값으로.
  const [templateId, setTemplateId] = useState('')
  const [templateTouched, setTemplateTouched] = useState(false)
  useEffect(() => {
    if (templateTouched || !templates.length) return
    const sug = suggestTemplate(templates, workDate, rows.length || null)
    if (sug) setTemplateId(sug.id)
  }, [templates, workDate, rows.length, templateTouched])
  const template = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId])

  // ── 레이아웃 편집(Phase D) ───────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [draftSlots, setDraftSlots] = useState([])
  const [draftLayout, setDraftLayout] = useState(DEFAULT_LAYOUT)
  const [savingTpl, setSavingTpl] = useState(false)

  const enterEdit = () => {
    if (!template) return
    setDraftSlots((template.slots || []).map((s) => ({ ...s, _key: s.id })))
    setDraftLayout(layout) // 홀·주방 = 보드 공통
    setEditMode(true)
  }
  const cancelEdit = () => { setEditMode(false); setDraftSlots([]) }

  const saveUpdate = async () => {
    if (!template) return
    setSavingTpl(true)
    const { error } = await replaceSlots(template.id, draftSlots)
    const { error: e2 } = await saveLayout(draftLayout) // 홀·주방 = 보드 공통
    setSavingTpl(false)
    if (error || e2) { alert('갱신 실패: 권한이 없거나 오류입니다. (전역 체제=마스터, 홀·주방=마스터·보드멤버)'); return }
    setEditMode(false); setDraftSlots([])
  }

  const saveAsNew = async () => {
    if (!template) return
    const name = prompt('새 체제 이름:', `${template.name} (수정)`)
    if (!name?.trim()) return
    setSavingTpl(true)
    const { data, error } = await createTemplate({
      name: name.trim(), weekday: template.weekday, headcount: template.headcount,
      slots: draftSlots, scope: 'board', createdBy: userId,
    })
    if (!error && data) await saveLayout(draftLayout) // 홀·주방 = 보드 공통
    setSavingTpl(false)
    if (error || !data) { alert('새 버전 저장 실패: 권한이 없거나 오류입니다.'); return }
    setTemplateId(data.id); setTemplateTouched(true)
    setEditMode(false); setDraftSlots([])
  }

  // ── 그날 명단 ↔ 배치 핸들러 (PLAN §12) ─────────────────────────────────────
  // "변수 없으면 요일 인원이 그대로 확정으로 파생" → row는 변수(오프/추가/배치) 때만 생성.
  const weekday = useMemo(() => (workDate ? ['일', '월', '화', '수', '목', '금', '토'][new Date(workDate + 'T00:00:00').getDay()] : null), [workDate])
  const assignedIds = useMemo(() => new Set(rows.map((r) => r.member_id).filter(Boolean)), [rows])
  const confirmedRows = useMemo(() => rows.filter((r) => r.status === 'confirmed' || r.status === 'planned'), [rows])
  const defaultMembers = useMemo(
    () => members.filter((m) => (m.work_days || []).includes(weekday) && !assignedIds.has(m.id)),
    [members, weekday, assignedIds]
  )

  // 보드: 파생 멤버 → 확정 row 생성+role / 기존 row → role 갱신. 빼기 = role=null.
  const placeItem = (item, role) => {
    if (item.kind === 'member') {
      addAssignment({ memberId: item.memberId, memberName: item.memberName, role: role || null, status: 'confirmed', createdBy: userId })
    } else {
      updateAssignment(item.assignmentId, { role: role || null })
    }
  }
  const unplace = (id) => updateAssignment(id, { role: null })
  // 명단(우측 패널)
  const offMember = (m) => addAssignment({ memberId: m.id, memberName: m.name, status: 'off', createdBy: userId })
  const offRow = (id) => updateAssignment(id, { status: 'off', role: null })
  const returnRow = (id) => updateAssignment(id, { status: 'confirmed' })
  const removeRow = (id) => removeAssignment(id)
  const addConfirmed = (m) => addAssignment({ memberId: m.id, memberName: m.name, role: m.seniority === '매니저' ? '매니저' : null, status: 'confirmed', createdBy: userId })

  // 확정 인원 아이템(파생 멤버 + 확정 row) — 우측 리스트 = 배치 드래그 소스
  const confirmedItems = useMemo(() => [
    ...defaultMembers.map((m) => ({ kind: 'member', memberId: m.id, name: m.name, seniority: m.seniority, role: null })),
    ...confirmedRows.map((r) => ({ kind: 'row', assignmentId: r.id, name: r.member_name, temp: !r.member_id, role: r.role || null })),
  ], [defaultMembers, confirmedRows])
  // 슬롯별 배치(자리에 놓인 확정 row만)
  const slotItems = useMemo(() => {
    const map = new Map(); const consumed = new Set()
    for (const s of template?.slots || []) {
      const matched = confirmedRows.filter((r) => !consumed.has(r.id) && r.role === s.role)
      matched.forEach((r) => consumed.add(r.id))
      map.set(s.id, matched.map((r) => ({ kind: 'row', assignmentId: r.id, name: r.member_name, temp: !r.member_id, role: r.role })))
    }
    return map
  }, [confirmedRows, template])
  const offRows = useMemo(() => rows.filter((r) => r.status === 'off'), [rows])
  const addableMembers = useMemo(() => members.filter((m) => !(m.work_days || []).includes(weekday) && !assignedIds.has(m.id)), [members, weekday, assignedIds])

  // ── DnD(좌우 통합) + 클릭 배치 ─────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const [held, setHeld] = useState(null)
  const [activeDrag, setActiveDrag] = useState(null)
  const sameItem = (a, b) => !!a && !!b && a.kind === b.kind && (a.kind === 'row' ? a.assignmentId === b.assignmentId : a.memberId === b.memberId)
  const pick = (item) => setHeld((h) => (sameItem(h, item) ? null : item))
  const placeOnSlot = (slot) => { if (!held) return; placeItem(held, slot.role); setHeld(null) }
  const offItem = (item) => { if (item.kind === 'member') offMember({ id: item.memberId, name: item.name }); else offRow(item.assignmentId) }
  const onDragStart = ({ active }) => { setHeld(null); setActiveDrag(active.data.current) }
  const onDragCancel = () => setActiveDrag(null)
  const onDragEnd = ({ active, over }) => {
    setActiveDrag(null)
    if (!over || !canEdit) return
    const a = active.data.current, o = over.data.current
    if (!o) return
    if (o.kind === 'slot') placeItem(a, o.slot.role)
    else if (o.kind === 'unplace' && a.kind === 'row') unplace(a.assignmentId)
  }

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
      <div className={`roster-modal ${view === 'board' ? 'is-board is-fullscreen' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="roster-modal-header">
          <div className="roster-modal-title">
            <Users size={16} />
            <span>배치도 · {formatDateKo(workDate)}</span>
          </div>
          <div className="roster-view-toggle" role="tablist" aria-label="보기 전환">
            <button
              className={`roster-view-btn ${view === 'board' ? 'active' : ''}`}
              onClick={() => setView('board')} title="보드 보기" aria-selected={view === 'board'}
            >
              <LayoutGrid size={14} /> 보드
            </button>
            <button
              className={`roster-view-btn ${view === 'table' ? 'active' : ''}`}
              onClick={() => setView('table')} title="표 보기" aria-selected={view === 'table'}
            >
              <List size={14} /> 표
            </button>
          </div>
          {isMaster && onNavigateToMembers && (
            <button className="roster-add-custom roster-manage-members" onClick={() => { onClose(); onNavigateToMembers() }} title="전체 멤버 리스트 관리 페이지로 이동 (마스터 전용)">
              <Users size={14} /> 멤버 관리하기
            </button>
          )}
          <button className="roster-modal-close" onClick={onClose} title="닫기"><X size={18} /></button>
        </div>

        <div className="roster-modal-body">
          {loading ? (
            <div className="roster-empty">불러오는 중…</div>
          ) : view === 'board' ? (
            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
            <div className="roster-split">
              <div className="roster-split-left">
              <div className="roster-template-bar">
                <label className="roster-template-label">체제</label>
                <select
                  className="roster-select roster-template-select"
                  value={templateId}
                  disabled={editMode}
                  onChange={(e) => { setTemplateId(e.target.value); setTemplateTouched(true) }}
                >
                  <option value="">— 체제 미선택 (역할 그룹) —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.board_id ? ' (이 보드)' : ''}
                    </option>
                  ))}
                </select>
                {!editMode && (
                  <button className="roster-add-custom" onClick={() => setPrintMode(true)} title="현장 표시·인쇄용 읽기 전용 보기">전체화면·인쇄</button>
                )}
                {canEdit && template && !editMode && (
                  <button className="roster-add-custom" onClick={enterEdit} title="자리 위치/구성 편집">레이아웃 편집</button>
                )}
                {editMode && (
                  <div className="roster-edit-actions">
                    <button className="roster-add-btn" disabled={savingTpl} onClick={saveUpdate}>이 체제 갱신</button>
                    <button className="roster-add-custom" disabled={savingTpl} onClick={saveAsNew}>새 버전 저장</button>
                    <button className="roster-add-custom" disabled={savingTpl} onClick={cancelEdit}>취소</button>
                  </div>
                )}
              </div>
              {editMode ? (
                <RosterBoardEditor
                  slots={draftSlots} setSlots={setDraftSlots}
                  layout={draftLayout} setLayout={setDraftLayout}
                />
              ) : (
                <RosterBoardView
                  template={template} layout={layout} slotItems={slotItems} canEdit={canEdit}
                  held={held} onPlaceClick={placeOnSlot} onPick={pick}
                  onUnplace={unplace} onDeselect={() => setHeld(null)}
                />
              )}
              </div>
              {!editMode && (
                <div className="roster-split-right">
                  <RosterMemberPanel
                    items={confirmedItems} offRows={offRows} addable={addableMembers} weekday={weekday}
                    canEdit={canEdit} held={held} dragging={!!activeDrag}
                    onPick={pick} onOffItem={offItem} onRemoveRow={removeRow}
                    onAddConfirmed={addConfirmed} onAddCustom={handleAddCustom} onReturnRow={returnRow}
                  />
                </div>
              )}
            </div>
            <DragOverlay>{activeDrag ? <span className="roster-chip roster-chip-overlay"><span className="roster-chip-name">{activeDrag.name}</span></span> : null}</DragOverlay>
            </DndContext>
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

        {canEdit && view === 'table' && (
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

        {printMode && (
          <RosterPrintView
            rows={rows} template={template} layout={layout} workDate={workDate}
            onClose={() => setPrintMode(false)}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
