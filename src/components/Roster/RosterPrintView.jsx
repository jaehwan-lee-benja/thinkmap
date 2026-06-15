// 배치도 출력/풀스크린 읽기 뷰 (Phase E). PLAN-roster-visual-board.md §6.3.
// canEdit 무관 읽기 전용 — 입력 UI 없이 칩만. 매장 화면 표시(풀스크린) + 인쇄(종이 1장).
// 항상 흰 종이(roster-print-*) 스타일로 렌더 → 앱 다크테마와 무관하게 출력이 깔끔.

import React, { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { ROSTER_ROLE_PRESETS, ROLE_TASKS } from '../../utils/rosterPresets'

const STATUS_LABEL = {
  planned: '예정', worked: '근무', requested: '요청',
  accepted: '수락', declined: '거절', tentative: '미정',
}

function formatDateKo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${dateStr} (${days[d.getDay()]})`
}

function PrintChip({ row }) {
  const worked = row.status === 'worked'
  return (
    <span className={`roster-print-chip ${worked ? 'is-worked' : ''}`}>
      <span className="roster-print-chip-name">{row.member_name}</span>
      {!row.member_id && <span className="roster-print-chip-temp">임시</span>}
      <span className="roster-print-chip-status">{STATUS_LABEL[row.status] || ''}</span>
    </span>
  )
}

export default function RosterPrintView({ rows = [], template, workDate, onClose }) {
  // 슬롯별 배치 매핑(역할 기준) + 미배치 — 보드 뷰와 동일 규칙.
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

  // 템플릿 없을 때: 역할 그룹핑 카드.
  const roleGroups = useMemo(() => {
    if (template) return null
    const byRole = new Map(); const noRole = []
    for (const r of rows) {
      const role = (r.role || '').trim()
      if (!role) { noRole.push(r); continue }
      if (!byRole.has(role)) byRole.set(role, [])
      byRole.get(role).push(r)
    }
    const ordered = ROSTER_ROLE_PRESETS.filter((role) => byRole.has(role))
      .map((role) => ({ role, tasks: ROLE_TASKS[role] || '', members: byRole.get(role) }))
    return { ordered, noRole }
  }, [template, rows])

  return createPortal(
    <div className="roster-print-overlay">
      <div className="roster-print-toolbar no-print">
        <span className="roster-print-toolbar-title">배치도 · {formatDateKo(workDate)}</span>
        <div className="roster-print-toolbar-actions">
          <button type="button" className="roster-print-btn" onClick={() => window.print()}>
            <Printer size={15} /> 인쇄
          </button>
          <button type="button" className="roster-print-btn ghost" onClick={onClose}>
            <X size={15} /> 닫기
          </button>
        </div>
      </div>

      <div className="roster-print-sheet">
        <div className="roster-print-head">
          <h2 className="roster-print-title">멤버 배치도</h2>
          <span className="roster-print-date">{formatDateKo(workDate)}</span>
        </div>

        {rows.length === 0 ? (
          <div className="roster-print-empty">배치된 인원이 없습니다.</div>
        ) : template ? (
          // ── 작전판(캔버스 + 주방 사각형) ──
          <div className="roster-print-field">
            <span className="roster-print-hall">홀</span>
            <div
              className="roster-print-kitchen"
              style={{
                left: `${template.kitchen_x ?? 6}%`, top: `${template.kitchen_y ?? 44}%`,
                width: `${template.kitchen_w ?? 88}%`, height: `${template.kitchen_h ?? 52}%`,
              }}
            >
              <span className="roster-print-kitchen-label">주방 · 바</span>
            </div>
            {(template.slots || []).map((s) => {
              const placed = slotRows.get(s.id) || []
              return (
                <div
                  key={s.id} className="roster-print-slot"
                  style={{ left: `${s.grid_col}%`, top: `${s.grid_row}%` }}
                >
                  <div className="roster-print-slot-role">{s.label || s.role}</div>
                  {s.tasks && <div className="roster-print-slot-tasks">{s.tasks}</div>}
                  <div className="roster-print-slot-members">
                    {placed.map((r) => <PrintChip key={r.id} row={r} />)}
                    {placed.length === 0 && <span className="roster-print-slot-empty">—</span>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // ── 폴백: 역할 그룹 그리드 ──
          <div className="roster-print-grid">
            {roleGroups.ordered.map((g) => (
              <div key={g.role} className="roster-print-card">
                <div className="roster-print-slot-role">{g.role}</div>
                {g.tasks && <div className="roster-print-slot-tasks">{g.tasks}</div>}
                <div className="roster-print-slot-members">
                  {g.members.map((r) => <PrintChip key={r.id} row={r} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 미배치/기타 — 템플릿 모드에서만(폴백은 위 그리드에 포함 안 된 noRole 처리) */}
        {template && unassigned.length > 0 && (
          <div className="roster-print-unassigned">
            <span className="roster-print-unassigned-label">미배치 / 기타</span>
            <div className="roster-print-slot-members">
              {unassigned.map((r) => <PrintChip key={r.id} row={r} />)}
            </div>
          </div>
        )}
        {!template && roleGroups.noRole.length > 0 && (
          <div className="roster-print-unassigned">
            <span className="roster-print-unassigned-label">미배치 / 기타</span>
            <div className="roster-print-slot-members">
              {roleGroups.noRole.map((r) => <PrintChip key={r.id} row={r} />)}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
