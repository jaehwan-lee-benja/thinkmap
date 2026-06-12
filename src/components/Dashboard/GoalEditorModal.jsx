import React, { useEffect, useState } from 'react'
import { X, Trash2 } from 'lucide-react'

// 목표 생성/편집 모달. EventEditor draft 패턴 준수:
//   저장 버튼을 누르기 전에는 DB 에 흔적을 남기지 않는다.
//   goal=null → 신규(삭제 버튼 숨김), goal=row → 편집.

const DOMAINS = [
  { value: 'general', label: '일반' },
  { value: 'routine', label: '루틴/시간' },
  { value: 'business', label: '사업체' },
  { value: 'asset', label: '자산' },
  { value: 'fitness', label: '체력' },
]

const METRIC_SOURCES = [
  { value: 'routine_completion', label: '루틴 달성으로 측정' },
  { value: 'todo_completion', label: '투두 완료로 측정' },
  { value: 'manual', label: '직접 입력' },
]

const PERIODS = [
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'quarterly', label: '분기' },
  { value: 'yearly', label: '매년' },
  { value: 'once', label: '단발(마감일)' },
]

function buildDraft(goal) {
  return {
    domain: goal?.domain || 'general',
    title: goal?.title || '',
    description: goal?.description || '',
    metric_source: goal?.metric_source || 'routine_completion',
    metric_filter: goal?.metric_filter || {},
    target_value: goal?.target_value ?? 1,
    current_value: goal?.current_value ?? 0,
    unit: goal?.unit || '',
    period: goal?.period || 'weekly',
    deadline: goal?.deadline || '',
    is_shared: !!goal?.is_shared,
  }
}

export default function GoalEditorModal({ isOpen, goal, routineEvents = [], onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(() => buildDraft(goal))
  const [saving, setSaving] = useState(false)

  // 모달이 새 대상으로 열릴 때마다 draft 리셋
  useEffect(() => {
    if (isOpen) setDraft(buildDraft(goal))
  }, [isOpen, goal?.id])

  if (!isOpen) return null

  const set = (patch) => setDraft(d => ({ ...d, ...patch }))
  const isNew = !goal?.id

  const handleSave = async () => {
    if (saving) return
    // 루틴 측정인데 대상 미선택이면 막기
    if (draft.metric_source === 'routine_completion' && !draft.metric_filter?.event_id) {
      alert('측정할 루틴을 선택해 주세요.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...draft,
        // metric_source 에 맞지 않는 filter 정리
        metric_filter:
          draft.metric_source === 'routine_completion'
            ? { event_id: draft.metric_filter?.event_id }
            : draft.metric_source === 'todo_completion'
              ? (draft.metric_filter?.page_id ? { page_id: draft.metric_filter.page_id } : {})
              : {},
        deadline: draft.period === 'once' ? (draft.deadline || null) : null,
      }
      await onSave(payload)
      onClose()
    } catch {
      alert('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (isNew) return
    if (!confirm('이 목표를 삭제할까요?')) return
    try {
      await onDelete(goal.id)
      onClose()
    } catch {
      alert('삭제에 실패했습니다.')
    }
  }

  return (
    <div className="dash-modal-overlay" onMouseDown={onClose}>
      <div className="dash-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="dash-modal-header">
          <h3>{isNew ? '새 목표' : '목표 편집'}</h3>
          <button className="dash-icon-btn" onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </div>

        <div className="dash-modal-body">
          <label className="dash-field">
            <span>제목</span>
            <input
              type="text" value={draft.title} placeholder="예: 주 5회 아침 루틴"
              onChange={e => set({ title: e.target.value })}
            />
          </label>

          <label className="dash-field">
            <span>영역</span>
            <select value={draft.domain} onChange={e => set({ domain: e.target.value })}>
              {DOMAINS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>

          <label className="dash-field">
            <span>측정 방식</span>
            <select value={draft.metric_source} onChange={e => set({ metric_source: e.target.value })}>
              {METRIC_SOURCES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>

          {draft.metric_source === 'routine_completion' && (
            <label className="dash-field">
              <span>측정 대상(루틴)</span>
              <select
                value={draft.metric_filter?.event_id || ''}
                onChange={e => set({ metric_filter: { event_id: e.target.value } })}
              >
                <option value="">— 루틴 선택 —</option>
                {routineEvents.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.title || '(제목 없음)'}</option>
                ))}
              </select>
            </label>
          )}

          {draft.metric_source === 'manual' && (
            <label className="dash-field">
              <span>현재값</span>
              <input
                type="number" value={draft.current_value}
                onChange={e => set({ current_value: e.target.value })}
              />
            </label>
          )}

          <div className="dash-field-row">
            <label className="dash-field">
              <span>목표치</span>
              <input
                type="number" value={draft.target_value} min="0"
                onChange={e => set({ target_value: e.target.value })}
              />
            </label>
            <label className="dash-field">
              <span>단위</span>
              <input
                type="text" value={draft.unit} placeholder="회 / 원 / kg"
                onChange={e => set({ unit: e.target.value })}
              />
            </label>
          </div>

          <label className="dash-field">
            <span>주기</span>
            <select value={draft.period} onChange={e => set({ period: e.target.value })}>
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>

          {draft.period === 'once' && (
            <label className="dash-field">
              <span>마감일</span>
              <input type="date" value={draft.deadline || ''} onChange={e => set({ deadline: e.target.value })} />
            </label>
          )}

          <label className="dash-field dash-field-inline">
            <input
              type="checkbox" checked={draft.is_shared}
              onChange={e => set({ is_shared: e.target.checked })}
            />
            <span>공유 목표 (linked 계정에 표시)</span>
          </label>
        </div>

        <div className="dash-modal-footer">
          {!isNew && (
            <button className="dash-btn dash-btn-danger" onClick={handleDelete}>
              <Trash2 size={14} /> 삭제
            </button>
          )}
          <div className="dash-modal-footer-right">
            <button className="dash-btn" onClick={onClose}>취소</button>
            <button className="dash-btn dash-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
