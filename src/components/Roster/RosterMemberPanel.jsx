// 그날 인원 명단 관리 패널 (우측) — PLAN-roster-visual-board.md §12.
// "변수 없으면 요일 인원이 그대로 확정으로 파생"(row 없이). 확정 리스트에서 빼기(오프)·더하기.
// 이 리스트가 곧 배치 소스: 칩(이름)을 좌측 자리로 드래그(또는 클릭 후 자리 클릭)해 배치.
// 리스트 영역은 드롭존(unplace) — 자리에 있는 칩을 여기로 끌면 미배치로 복귀.

import React, { useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Moon, Plus, X, RotateCcw } from 'lucide-react'

function PanelChip({ item, canEdit, held, onPick }) {
  const id = `panel:${item.kind === 'row' ? `r${item.assignmentId}` : `m${item.memberId}`}`
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: item, disabled: !canEdit })
  const isHeld = held && held.kind === item.kind && (item.kind === 'row' ? held.assignmentId === item.assignmentId : held.memberId === item.memberId)
  return (
    <button
      type="button" ref={setNodeRef}
      className={`roster-panel-name as-grab ${isHeld ? 'is-held' : ''} ${isDragging ? 'is-dragging' : ''}`}
      disabled={!canEdit} onClick={() => canEdit && onPick(item)} {...listeners} {...attributes}
      title={canEdit ? '드래그해 좌측 자리에 배치 / 클릭 후 자리 클릭' : item.name}
    >
      {item.name}{item.seniority && <em>{item.seniority}</em>}{item.temp && <em>임시</em>}
    </button>
  )
}

export default function RosterMemberPanel({
  items = [], offRows = [], addable = [], weekday, canEdit = true, held, dragging,
  onPick, onOffItem, onRemoveRow, onAddConfirmed, onAddCustom, onReturnRow,
  presets = [], selectedPresetId, onSelectPreset, onSavePresetAsNew, onUpdatePreset, onMarkActive, onApplyPreset, onDeletePreset,
}) {
  const { setNodeRef: unplaceRef, isOver: unplaceOver } = useDroppable({ id: 'unplace', data: { kind: 'unplace' } })
  const [pick, setPick] = useState('')
  const selected = presets.find((p) => p.id === selectedPresetId) || null

  return (
    <div className="roster-panel">
      <section ref={unplaceRef} className={`roster-panel-sec roster-panel-confirmed ${unplaceOver ? 'is-unplace-over' : ''}`}>
        <h4>확정 인원 <span className="roster-panel-count">{items.length}</span>
          {weekday && <span className="roster-panel-dow">{weekday}요일 근무자 자동 포함</span>}
        </h4>
        <div className="roster-panel-list">
          {items.length === 0 && <span className="roster-panel-empty">확정 인원이 없습니다. 아래에서 추가하세요.</span>}
          {items.map((it) => (
            <div key={it.kind === 'row' ? `r${it.assignmentId}` : `m${it.memberId}`} className={`roster-panel-row is-confirmed ${it.role ? '' : 'is-unplaced'}`}>
              <PanelChip item={it} canEdit={canEdit} held={held} onPick={onPick} />
              <span className="roster-panel-role">{it.role || '미배치'}</span>
              {canEdit && (
                <span className="roster-panel-acts">
                  <button type="button" className="rp-btn rp-off" onClick={() => onOffItem(it)} title="오프(휴가)"><Moon size={12} /></button>
                  {it.kind === 'row' && <button type="button" className="rp-btn rp-cancel" onClick={() => onRemoveRow(it.assignmentId)} title="명단에서 제거"><X size={12} /></button>}
                </span>
              )}
            </div>
          ))}
        </div>
        {dragging && <div className="roster-panel-droplabel">여기로 끌면 자리 빼기(미배치)</div>}
        {canEdit && (
          <div className="roster-panel-add">
            <select className="roster-select" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">＋ 인원 추가 (요일 외)…</option>
              {addable.map((m) => <option key={m.id} value={m.id}>{m.name}{m.seniority ? ` (${m.seniority})` : ''}</option>)}
            </select>
            <button type="button" className="rp-btn" disabled={!pick}
              onClick={() => { const m = addable.find((x) => x.id === pick); if (m) { onAddConfirmed(m); setPick('') } }}>
              <Plus size={12} /> 확정
            </button>
            <button type="button" className="rp-btn" onClick={onAddCustom} title="멤버 마스터에 없는 임시 인원">임시</button>
          </div>
        )}
        {canEdit && weekday && (
          <div className="roster-panel-wkdef">
            {presets.length > 0 && (
              <div className="roster-wkpreset-pick">
                <select className="roster-select" value={selectedPresetId || ''}
                  onChange={(e) => onSelectPreset(e.target.value)} title="이 요일에 저장된 인원배치 버전">
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>{p.is_active ? '★ ' : ''}{p.name} ({p.items.length}명)</option>
                  ))}
                </select>
                <button type="button" className="rp-link" onClick={onApplyPreset} title="이 버전 인원을 지금 채우기 (이미 있는 인원은 건너뜀)">채우기</button>
                {selected && !selected.is_active && (
                  <button type="button" className="rp-link" onClick={onMarkActive} title="이 버전을 주배치(별표)로 — 다음 주부터 빈 날짜에 자동 적용">★ 주배치</button>
                )}
                <button type="button" className="rp-link" onClick={onUpdatePreset} title="현재 인원 배치로 이 버전 갱신">갱신</button>
                <button type="button" className="rp-link" onClick={onDeletePreset} title="이 버전 삭제">삭제</button>
              </div>
            )}
            <button type="button" className="rp-btn" onClick={onSavePresetAsNew}
              title="현재 인원 배치를 새 버전으로 저장 (예: '2026 성수기 토요일'). 그 요일 첫 버전은 자동으로 주배치(별표)가 됩니다">
              {weekday}요일 인원배치 새 버전 저장
            </button>
          </div>
        )}
      </section>

      <section className="roster-panel-sec">
        <h4>오프 (휴가)</h4>
        <div className="roster-panel-list">
          {offRows.length === 0 && <span className="roster-panel-empty">없음</span>}
          {offRows.map((r) => (
            <div key={r.id} className="roster-panel-row is-off">
              <span className="roster-panel-name">{r.member_name}</span>
              {canEdit && (
                <span className="roster-panel-acts">
                  <button type="button" className="rp-btn rp-confirm" onClick={() => onReturnRow(r.id)} title="복귀(확정)"><RotateCcw size={12} /> 복귀</button>
                  <button type="button" className="rp-btn rp-cancel" onClick={() => onRemoveRow(r.id)} title="제거"><X size={12} /></button>
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
