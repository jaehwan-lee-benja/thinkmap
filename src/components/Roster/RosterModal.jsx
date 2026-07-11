// 배치도 모달 — 특정 (board, 날짜)의 멤버×역할 배치를 입력/편집.
// docs/MEMBER-SPEC.md §7.2. daily 본문(daily_blocks)과 분리된 독립 테이블(roster_assignments).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { X, Plus, Trash2, Users, LayoutGrid, List } from 'lucide-react'
import { useRoster } from '../../hooks/useRoster'
import { useMembers } from '@thinkmap/core'
import { useRosterTemplates } from '../../hooks/useRosterTemplates'
import { useRosterSchedule } from '../../hooks/useRosterSchedule'
import { useRosterWeekdayPreset } from '../../hooks/useRosterWeekdayPreset'
import { useRosterLayout, DEFAULT_LAYOUT } from '../../hooks/useRosterLayout'
import {
  ROSTER_ROLE_PRESETS, ROSTER_SHIFTS, ROSTER_STATUS, ROSTER_STATUS_LABEL, WEEKDAYS,
} from '@thinkmap/core'
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
  const { rows, loading, addAssignment, seedAssignments, updateAssignment, removeAssignment } = useRoster(boardId, workDate, pageId)
  const { members } = useMembers({ includeInactive: false })
  const { templates, replaceSlots, createTemplate, markMaster } = useRosterTemplates(boardId)
  const { layout, saveLayout } = useRosterLayout(boardId)
  const schedule = useRosterSchedule(boardId)
  const wkPreset = useRosterWeekdayPreset(boardId)

  const [selectedMemberId, setSelectedMemberId] = useState('')
  // 우측 명단에서 보고 있는 인원배치 버전(요일별). 기본 = 활성(별표) 버전.
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [adding, setAdding] = useState(false)
  // 요일→버전 배정 패널 토글
  const [schedOpen, setSchedOpen] = useState(false)
  // 보드(시각) / 표(빠른입력) 토글. 기본은 보드 — 슬라이드 작전보드 대체. (PLAN-roster-visual-board Phase A)
  const [view, setView] = useState('board')
  // 출력/풀스크린 읽기 뷰(Phase E). canEdit 무관.
  const [printMode, setPrintMode] = useState(false)

  // 선택된 체제(버전). 미선택('') = 폴백(역할 그룹핑). 요일/날짜 배정(schedule)으로 자동 선택.
  const [templateId, setTemplateId] = useState('')
  const [templateTouched, setTemplateTouched] = useState(false)
  // 그날 적용 버전 해석: 날짜 오버라이드 > 요일 기본 > 없음.
  const resolved = useMemo(() => schedule.resolve(workDate), [schedule.resolve, workDate])
  useEffect(() => {
    if (templateTouched || !schedule.loaded) return
    setTemplateId(resolved.id || '')
  }, [resolved, schedule.loaded, templateTouched])
  const template = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId])
  // 풀 배치(전체 마스터) — 보드당 1개(is_default). 다른 체제는 여기서 빼서 파생.
  const masterTemplate = useMemo(() => templates.find((t) => t.is_default && t.board_id) || null, [templates])

  // ── 레이아웃 편집(Phase D) ───────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false)
  const [draftSlots, setDraftSlots] = useState([])
  const [draftLayout, setDraftLayout] = useState(DEFAULT_LAYOUT)
  const [savingTpl, setSavingTpl] = useState(false)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  // '현재 체제 갱신' 대상(편집 시작 출처). 풀배치/빈 편집은 null → 새로 저장 유도.
  const [editTarget, setEditTarget] = useState(null)

  const beginEdit = (slots, target) => {
    setDraftSlots((slots || []).map((s) => ({ ...s, _key: s.id ?? s._key })))
    setDraftLayout(layout) // 홀·주방 = 보드 공통
    setEditTarget(target)
    setSaveMenuOpen(false)
    setEditMode(true)
  }
  const enterEdit = () => { if (template) beginEdit(template.slots, template) }            // 현재 체제 편집
  const enterEditFromMaster = () => { if (masterTemplate) beginEdit(masterTemplate.slots, null) } // 풀배치에서 빼기(새로 저장)
  const enterMaster = () => beginEdit(masterTemplate ? masterTemplate.slots : [], masterTemplate || null) // 풀 배치 설정(수정/신규)
  const cancelEdit = () => { setEditMode(false); setDraftSlots([]); setEditTarget(null); setSaveMenuOpen(false) }

  const finishSave = (tplId) => { setTemplateId(tplId); setTemplateTouched(true); setEditMode(false); setDraftSlots([]); setEditTarget(null); setSaveMenuOpen(false) }

  // 기존 체제 덮어쓰기(현재 또는 목록에서 고른 다른 체제) + 홀·주방 공통 레이아웃 저장.
  const saveToExisting = async (tplId) => {
    if (!tplId) return
    setSavingTpl(true)
    const { error } = await replaceSlots(tplId, draftSlots)
    const { error: e2 } = await saveLayout(draftLayout)
    setSavingTpl(false)
    if (error || e2) { alert('갱신 실패: 권한이 없거나 오류입니다. (전역 체제=마스터, 홀·주방=마스터·보드멤버)'); return }
    finishSave(tplId)
  }
  const saveUpdate = () => editTarget && saveToExisting(editTarget.id)

  const saveAsNew = async () => {
    const name = prompt('새 체제 이름:', editTarget ? `${editTarget.name} (수정)` : '새 체제')
    if (!name?.trim()) return
    setSavingTpl(true)
    const { data, error } = await createTemplate({ name: name.trim(), slots: draftSlots, scope: 'board', createdBy: userId })
    if (!error && data) await saveLayout(draftLayout)
    setSavingTpl(false)
    if (error || !data) { alert('새 체제 저장 실패: 권한이 없거나 오류입니다.'); return }
    finishSave(data.id)
  }

  // 풀 배치로 저장 — 기존 마스터가 있으면 갱신, 없으면 새로 만들어 마스터 지정.
  const saveAsMaster = async () => {
    setSavingTpl(true)
    let targetId = masterTemplate?.id
    if (targetId) {
      const { error } = await replaceSlots(targetId, draftSlots)
      if (error) { setSavingTpl(false); alert('풀 배치 갱신 실패: 권한이 없거나 오류입니다.'); return }
    } else {
      const name = prompt('풀 배치 이름:', '풀 배치')
      if (!name?.trim()) { setSavingTpl(false); return }
      const { data, error } = await createTemplate({ name: name.trim(), slots: draftSlots, scope: 'board', createdBy: userId })
      if (error || !data) { setSavingTpl(false); alert('풀 배치 저장 실패: 권한이 없거나 오류입니다.'); return }
      targetId = data.id
    }
    const { error: e3 } = await markMaster(targetId)
    const { error: e2 } = await saveLayout(draftLayout)
    setSavingTpl(false)
    if (e3 || e2) { alert('풀 배치 지정 일부 실패: 권한이 없거나 오류입니다.'); return }
    finishSave(targetId)
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

  // ── 요일별 인원배치 버전(별표=주배치): 빈 날짜를 열면 활성 버전을 자동으로 깐다 ──────
  const weekdayPresets = useMemo(() => (weekday ? wkPreset.byWeekday[weekday] || [] : []), [wkPreset.byWeekday, weekday])
  const activePreset = useMemo(() => (weekday ? wkPreset.activeByWeekday[weekday] || null : null), [wkPreset.activeByWeekday, weekday])
  // 선택 버전: 명시 선택 우선, 없으면 활성(별표). 요일/로드 바뀌면 활성으로 리셋.
  useEffect(() => {
    if (!wkPreset.loaded) return
    setSelectedPresetId(activePreset?.id || weekdayPresets[0]?.id || '')
  }, [weekday, wkPreset.loaded, activePreset?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const selectedPreset = useMemo(() => weekdayPresets.find((p) => p.id === selectedPresetId) || null, [weekdayPresets, selectedPresetId])

  const currentPlacements = () => confirmedRows.map((r) => ({ member_id: r.member_id, member_name: r.member_name, role: r.role || null, shift: r.shift || null, status: r.status }))

  const seededRef = useRef({})
  useEffect(() => {
    // 가드: 로드 완료 + 그날 배치 0개 + 활성(별표) 버전 존재 + 이 세션에서 이 날짜에 아직 안 깖.
    if (loading || !wkPreset.loaded || !canEdit || !weekday) return
    if (rows.length > 0 || !activePreset || !activePreset.items.length) return
    if (seededRef.current[workDate]) return
    seededRef.current[workDate] = true
    seedAssignments(activePreset.items, userId)
  }, [loading, wkPreset.loaded, canEdit, weekday, workDate, rows.length, activePreset, seedAssignments, userId])

  // 현재 배치를 새 버전으로 저장(이름). 그 요일 첫 버전이면 자동으로 별표(주배치).
  const savePresetAsNew = async () => {
    if (!weekday) return
    const name = prompt('새 인원배치 버전 이름:', `${new Date().getFullYear()} ${weekday}요일`)
    if (!name?.trim()) return
    const first = weekdayPresets.length === 0
    const { error } = await wkPreset.createPreset({ weekday, name: name.trim(), placements: currentPlacements(), asActive: first, createdBy: userId })
    if (error) alert('버전 저장 실패: 권한이 없거나 오류입니다.')
  }
  // 선택 버전을 현재 배치로 갱신
  const updateSelectedPreset = async () => {
    if (!selectedPreset) return
    if (!confirm(`"${selectedPreset.name}" 버전을 현재 인원 배치로 갱신할까요?`)) return
    const { error } = await wkPreset.replaceItems(selectedPreset.id, currentPlacements())
    if (error) alert('버전 갱신 실패: 권한이 없거나 오류입니다.')
  }
  // 선택 버전을 별표(주배치)로 지정 → 다음 주부터 빈 날짜에 이게 자동 적용
  const markSelectedActive = async () => {
    if (!selectedPreset || selectedPreset.is_active) return
    const { error } = await wkPreset.setActive(selectedPreset.id)
    if (error) alert('주배치 지정 실패: 권한이 없거나 오류입니다.')
  }
  // 선택 버전 인원을 지금 채우기(이미 있는 인원은 건너뜀 → 중복 방지)
  const applySelectedPreset = async () => {
    if (!selectedPreset) return
    const have = new Set(rows.map((r) => r.member_id).filter(Boolean))
    const toAdd = selectedPreset.items.filter((d) => !d.member_id || !have.has(d.member_id))
    if (!toAdd.length) return
    await seedAssignments(toAdd, userId)
  }
  const deleteSelectedPreset = async () => {
    if (!selectedPreset) return
    if (!confirm(`"${selectedPreset.name}" 버전을 삭제할까요?`)) return
    const { error } = await wkPreset.deletePreset(selectedPreset.id)
    if (error) alert('버전 삭제 실패: 권한이 없거나 오류입니다.')
  }

  // 보드: 파생 멤버 → 확정 row 생성+role / 기존 row → role 갱신. 빼기 = role=null.
  const placeItem = (item, role) => {
    if (item.kind === 'member') {
      addAssignment({ memberId: item.memberId, memberName: item.name, role: role || null, status: 'confirmed', createdBy: userId })
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
                      {t.name}{t.is_default && t.board_id ? ' ★풀배치' : t.board_id ? ' (이 보드)' : ''}
                    </option>
                  ))}
                </select>
                {!editMode && (
                  <span className="roster-template-source" title="이 날짜에 적용된 자리판(역할카드 버전)의 출처">
                    {templateTouched ? '수동 선택'
                      : resolved.source === 'date' ? '이 날짜 자리판'
                      : resolved.source === 'weekday' ? `${weekday}요일 자리판`
                      : '자리판 미배정'}
                  </span>
                )}
                {!editMode && (
                  <button className="roster-add-custom" onClick={() => setPrintMode(true)} title="현장 표시·인쇄용 읽기 전용 보기">전체화면·인쇄</button>
                )}
                {canEdit && !editMode && (
                  <button className={`roster-add-custom ${schedOpen ? 'is-active' : ''}`} onClick={() => setSchedOpen((v) => !v)} title="요일/날짜에 어떤 자리판(역할카드 버전)을 쓸지 배정">요일별 자리판</button>
                )}
                {canEdit && !editMode && (
                  <button className={`roster-add-custom ${masterTemplate ? '' : 'is-active'}`} onClick={enterMaster}
                    title={masterTemplate ? '풀 배치(전체 마스터) 수정' : '풀 배치(전체 마스터) 새로 만들기 — 최대 인원으로 깔고 저장 ▾ → 풀 배치로 저장'}>
                    풀 배치 설정
                  </button>
                )}
                {canEdit && masterTemplate && !editMode && (
                  <button className="roster-add-custom" onClick={enterEditFromMaster} title="풀 배치를 불러와 카드를 빼서 새 체제로 저장(파생 버전)">풀 배치에서 빼기</button>
                )}
                {canEdit && template && !editMode && (
                  <button className="roster-add-custom" onClick={enterEdit} title="현재 선택된 체제의 자리 위치/구성 편집">레이아웃 편집</button>
                )}
                {editMode && (
                  <div className="roster-edit-actions">
                    <div className="roster-savemenu">
                      <button className="roster-add-btn" disabled={savingTpl} onClick={() => setSaveMenuOpen((v) => !v)}>저장 ▾</button>
                      {saveMenuOpen && (
                        <div className="roster-savemenu-pop" onClick={(e) => e.stopPropagation()}>
                          <button className="roster-savemenu-item" disabled={savingTpl || !editTarget} onClick={saveUpdate}>
                            현재 체제 갱신{editTarget ? ` · ${editTarget.name}` : ' (없음)'}
                          </button>
                          <label className="roster-savemenu-item roster-savemenu-pick">
                            다른 체제 갱신…
                            <select className="roster-select" defaultValue="" disabled={savingTpl}
                              onChange={(e) => { const id = e.target.value; e.target.value = ''; if (id) saveToExisting(id) }}>
                              <option value="">체제 선택…</option>
                              {templates.filter((t) => t.board_id).map((t) => (
                                <option key={t.id} value={t.id}>{t.is_default ? '★ ' : ''}{t.name}</option>
                              ))}
                            </select>
                          </label>
                          <button className="roster-savemenu-item" disabled={savingTpl} onClick={saveAsNew}>새 이름으로 저장…</button>
                          <button className="roster-savemenu-item" disabled={savingTpl} onClick={saveAsMaster}>
                            풀 배치로 저장{masterTemplate ? ` · ${masterTemplate.name} 갱신` : ' (새로 지정)'}
                          </button>
                        </div>
                      )}
                    </div>
                    <button className="roster-add-custom" disabled={savingTpl} onClick={cancelEdit}>취소</button>
                  </div>
                )}
              </div>
              {canEdit && !editMode && schedOpen && (
                <div className="roster-sched-panel">
                  <div className="roster-sched-title">요일별 자리판 (역할카드 버전)</div>
                  <div className="roster-sched-grid">
                    {WEEKDAYS.map((wd) => (
                      <label key={wd} className="roster-sched-row">
                        <span className="roster-sched-dow">{wd}</span>
                        <select className="roster-select" value={schedule.weekdayMap[wd] || ''}
                          onChange={(e) => schedule.setWeekday(wd, e.target.value || null)}>
                          <option value="">— 없음 —</option>
                          {templates.map((t) => <option key={t.id} value={t.id}>{t.is_default && t.board_id ? '★ ' : ''}{t.name}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="roster-sched-title">이 날짜만 자리판 바꾸기 ({workDate})</div>
                  <label className="roster-sched-row">
                    <span className="roster-sched-dow">{weekday}</span>
                    <select className="roster-select" value={schedule.dateMap[workDate] || ''}
                      onChange={(e) => { schedule.setDate(workDate, e.target.value || null); setTemplateTouched(false) }}>
                      <option value="">— 요일 자리판 사용 —</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.is_default && t.board_id ? '★ ' : ''}{t.name}</option>)}
                    </select>
                  </label>
                  <div className="roster-sched-hint">자리판(역할카드 버전)은 "레이아웃 편집/풀 배치에서 시작 → 저장"으로 만들고, 여기서 요일·날짜에 꽂습니다. ★=풀 배치(전체 마스터). · 사람(인원) 배치는 우측 명단의 "○요일 인원배치 새 버전 저장"에서 버전으로 저장하고, 별표(주배치)가 빈 날짜에 자동 적용됩니다.</div>
                </div>
              )}
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
                    presets={weekdayPresets}
                    selectedPresetId={selectedPresetId}
                    onSelectPreset={setSelectedPresetId}
                    onSavePresetAsNew={savePresetAsNew}
                    onUpdatePreset={updateSelectedPreset}
                    onMarkActive={markSelectedActive}
                    onApplyPreset={applySelectedPreset}
                    onDeletePreset={deleteSelectedPreset}
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
