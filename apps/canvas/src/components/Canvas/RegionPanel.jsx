// 영역 사이드 패널 — 영역 클릭 시 우측에서 슬라이드 인
// 관련: docs/MARKETING-CANVAS-WIREFRAMES.md W3
//
// Props:
//   - region    : { key, label, bbox, nodes }
//   - mappings  : 해당 영역의 canvas_mappings rows
//   - stats     : canvas_region_stats row (해당 영역)
//   - statusMap : workflow status_key → {label, color}
//   - onClose   : () => void
//   - onCardClick : (mapping) => void

import React, { useState } from 'react'
import { useUserDailyBlocks } from '../../hooks/useUserDailyBlocks'
import './RegionPanel.css'

const FALLBACK_STATUS_COLOR = {
  todo: '#9ca3af',
  doing: '#3b82f6',
  done: '#10b981',
  blocked: '#ef4444',
}

const PRIORITY_LABEL = ['P0', 'P1', 'P2', 'P3']
const PRIORITY_COLOR = ['#ef4444', '#f59e0b', '#9ca3af', '#d1d5db']

function StatusDot({ status, statusMap }) {
  const color =
    statusMap?.[status]?.color || FALLBACK_STATUS_COLOR[status] || '#9ca3af'
  return <span className="rp-status-dot" style={{ background: color }} />
}

function StatusLabel({ status, statusMap }) {
  return statusMap?.[status]?.label || status
}

function SourceBadge({ mapping }) {
  if (mapping.source_daily_block_id) {
    return <span className="rp-source-badge rp-source-badge--daily" title="업무일지 토글에서 가져옴 — 원본 삭제 시 자동 제거">↙ 업무일지</span>
  }
  if (mapping.source_block_id) {
    return <span className="rp-source-badge rp-source-badge--block" title="일반 페이지 토글에서 가져옴">↙ 토글</span>
  }
  if (mapping.source_page_id) {
    return <span className="rp-source-badge rp-source-badge--page" title="페이지 자체에서 가져옴">↙ 페이지</span>
  }
  return null
}

function CardRow({
  mapping,
  statusMap,
  stepsToRender,
  onUpdateMapping,
  onDeleteMapping,
}) {
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleStatus = async (newStatus) => {
    if (newStatus === mapping.status) return
    setBusy(true)
    try {
      await onUpdateMapping?.(mapping.id, { status: newStatus })
    } finally {
      setBusy(false)
    }
  }

  const handlePriority = async (newPriority) => {
    if (newPriority === mapping.priority) return
    setBusy(true)
    try {
      await onUpdateMapping?.(mapping.id, { priority: newPriority })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await onDeleteMapping?.(mapping.id)
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <li className={`rp-card ${busy ? 'rp-card--busy' : ''}`}>
      <StatusDot status={mapping.status} statusMap={statusMap} />
      <div className="rp-card-body">
        <div className="rp-card-title">
          {mapping.note || '(무제)'}
          <SourceBadge mapping={mapping} />
        </div>
        <div className="rp-card-meta">
          <select
            className="rp-card-select"
            value={mapping.status}
            onChange={(e) => handleStatus(e.target.value)}
            disabled={busy}
          >
            {stepsToRender.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <select
            className="rp-card-select"
            value={mapping.priority}
            onChange={(e) => handlePriority(Number(e.target.value))}
            disabled={busy}
          >
            <option value={0}>P0</option>
            <option value={1}>P1</option>
            <option value={2}>P2</option>
            <option value={3}>P3</option>
          </select>
          {mapping.priority <= 1 && (
            <span
              className="rp-priority"
              style={{ color: PRIORITY_COLOR[mapping.priority] }}
            >
              {PRIORITY_LABEL[mapping.priority]}
            </span>
          )}
          {mapping.due_date && <span className="rp-due">~{mapping.due_date}</span>}
          <button
            type="button"
            className={`rp-card-delete ${confirmDelete ? 'rp-card-delete--confirm' : ''}`}
            onClick={handleDelete}
            onBlur={() => setConfirmDelete(false)}
            disabled={busy}
            title={confirmDelete ? '한 번 더 클릭해서 확정' : '카드 삭제'}
          >
            {confirmDelete ? '확정?' : '✕'}
          </button>
        </div>
      </div>
    </li>
  )
}

export default function RegionPanel({
  region,
  mappings = [],
  stats,
  statusMap,
  workflowSteps = [],   // [{key,label,color,order}, ...]
  onClose,
  onCardClick,
  onCreateMapping,      // async ({ region_key, note, status, priority }) => void
  onUpdateMapping,      // async (id, patch) => void
  onDeleteMapping,      // async (id) => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('todo')
  const [priority, setPriority] = useState(2)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  // 업무일지에서 가져오기 (검색 + 매핑)
  const [importOpen, setImportOpen] = useState(false)
  const [importQuery, setImportQuery] = useState('')
  const { results: dailyHits, loading: importLoading } =
    useUserDailyBlocks(importQuery, { limit: 12 })
  const [importingId, setImportingId] = useState(null)

  if (!region) return null

  const resetForm = () => {
    setNote('')
    setStatus('todo')
    setPriority(2)
    setFormError(null)
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!note.trim()) {
      setFormError(new Error('카드 텍스트를 입력해주세요.'))
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await onCreateMapping?.({
        region_key: region.key,
        note: note.trim(),
        status,
        priority,
      })
      resetForm()
      setFormOpen(false)
    } catch (err) {
      setFormError(err)
    } finally {
      setSubmitting(false)
    }
  }

  const stepsToRender = workflowSteps.length > 0
    ? workflowSteps
    : [
        { key: 'todo',    label: '대기' },
        { key: 'doing',   label: '진행' },
        { key: 'done',    label: '완료' },
        { key: 'blocked', label: '막힘' },
      ]

  const handleImportDailyBlock = async (block) => {
    setImportingId(block.block_id)
    try {
      await onCreateMapping?.({
        region_key: region.key,
        note: block.text_content || '',
        status: 'todo',
        priority: 2,
        source_daily_block_id: block.block_id,  // 양방향 참조
      })
    } finally {
      setImportingId(null)
    }
  }

  const total = stats?.total ?? mappings.length
  const doneN = stats?.done_n ?? mappings.filter(m => m.status === 'done').length
  const stalledN = stats?.stalled_n ?? 0
  const progress = total > 0 ? Math.round((doneN / total) * 100) : 0

  const sourceCounts = mappings.reduce((acc, m) => {
    if (m.source_block_id) acc.block += 1
    else if (m.source_page_id) acc.page += 1
    return acc
  }, { block: 0, page: 0 })

  return (
    <aside className="region-panel">
      <header className="rp-header">
        <h3>{region.label}</h3>
        <button className="rp-close" onClick={onClose}>✕</button>
      </header>

      <section className="rp-section rp-diagnostics">
        <h4>진단</h4>
        <dl>
          <dt>카드</dt><dd>{total}건</dd>
          <dt>완료</dt><dd>{doneN}건 ({progress}%)</dd>
          <dt>정체</dt>
          <dd className={stalledN > 0 ? 'rp-warn' : ''}>
            {stalledN}건 {stalledN > 0 ? '⚠ (7일+)' : ''}
          </dd>
          <dt>최근 활동</dt>
          <dd>{stats?.last_active ? new Date(stats.last_active).toLocaleDateString() : '—'}</dd>
        </dl>
        <p className="rp-source">
          출처 분포 — 업무일지/블록 {sourceCounts.block} · 페이지 {sourceCounts.page}
        </p>
      </section>

      <section className="rp-section rp-cards">
        <h4>카드 ({total})</h4>
        {mappings.length === 0 ? (
          <p className="rp-empty">이 영역에 매핑된 카드가 없습니다.</p>
        ) : (
          <ul className="rp-card-list">
            {mappings.map((m) => (
              <CardRow
                key={m.id}
                mapping={m}
                statusMap={statusMap}
                stepsToRender={stepsToRender}
                onUpdateMapping={onUpdateMapping}
                onDeleteMapping={onDeleteMapping}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className="rp-footer">
        {!formOpen && !importOpen && (
          <div className="rp-footer-actions">
            <button
              className="rp-add-btn"
              onClick={() => setFormOpen(true)}
            >
              + 직접 작성
            </button>
            <button
              className="rp-add-btn"
              onClick={() => setImportOpen(true)}
            >
              ↙ 업무일지에서 가져오기
            </button>
          </div>
        )}

        {importOpen && (
          <div className="rp-import">
            <div className="rp-import-head">
              <input
                type="text"
                className="rp-import-search"
                placeholder="업무일지에서 검색..."
                value={importQuery}
                onChange={(e) => setImportQuery(e.target.value)}
                autoFocus
              />
              <button
                className="rp-form-btn rp-form-btn--ghost"
                onClick={() => { setImportOpen(false); setImportQuery('') }}
              >
                닫기
              </button>
            </div>
            <ul className="rp-import-list">
              {importLoading && <li className="rp-import-empty">검색 중...</li>}
              {!importLoading && dailyHits.length === 0 && (
                <li className="rp-import-empty">
                  {importQuery ? '결과 없음' : '검색어를 입력하거나 빈 상태로 두면 최근 항목 표시'}
                </li>
              )}
              {!importLoading && dailyHits.map((b) => (
                <li
                  key={b.block_id}
                  className={`rp-import-item ${importingId === b.block_id ? 'rp-import-item--busy' : ''}`}
                  onClick={() => handleImportDailyBlock(b)}
                  title="이 영역에 매핑"
                >
                  <div className="rp-import-text">{b.text_content}</div>
                  <div className="rp-import-meta">
                    {b.pages?.page_date || b.pages?.name || '업무일지'}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {formOpen && (
          <form className="rp-form" onSubmit={handleSubmit}>
            <textarea
              className="rp-form-note"
              placeholder="카드 텍스트 (예: 핵심역량: 패러다임 정의)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              rows={2}
              disabled={submitting}
            />

            <div className="rp-form-row">
              <label className="rp-form-field">
                <span>상태</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={submitting}
                >
                  {stepsToRender.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="rp-form-field">
                <span>우선순위</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  disabled={submitting}
                >
                  <option value={0}>P0 긴급</option>
                  <option value={1}>P1 중요</option>
                  <option value={2}>P2 보통</option>
                  <option value={3}>P3 낮음</option>
                </select>
              </label>
            </div>

            {formError && (
              <div className="rp-form-error">
                {formError.message || String(formError)}
              </div>
            )}

            <div className="rp-form-actions">
              <button
                type="button"
                onClick={() => { resetForm(); setFormOpen(false) }}
                disabled={submitting}
                className="rp-form-btn rp-form-btn--ghost"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || !note.trim()}
                className="rp-form-btn rp-form-btn--primary"
              >
                {submitting ? '추가 중...' : '추가'}
              </button>
            </div>
          </form>
        )}
      </footer>
    </aside>
  )
}
