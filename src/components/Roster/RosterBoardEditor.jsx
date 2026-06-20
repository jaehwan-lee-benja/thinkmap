// 배치도 작전판 — 레이아웃 편집 (Phase D + §12). 자리(블럭) 추가/삭제·드래그 이동·역할 편집은
// 체제별(slots). 홀·주방/바 네모는 보드 공통(layout) — 모든 체제에 공유.
// 좌표: %(2~98 클램프). PLAN-roster-visual-board.md §6.1b·§12.

import React, { useRef } from 'react'
import { X, Plus, GripVertical } from 'lucide-react'
import { ROSTER_ROLE_PRESETS, ROLE_TASKS } from '../../utils/rosterPresets'

let TMP = 0
const tmpKey = () => `tmp-${++TMP}`
const clamp = (v) => Math.max(2, Math.min(98, Math.round(v)))
const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)))

export default function RosterBoardEditor({ slots, setSlots, layout, setLayout }) {
  const fieldRef = useRef(null)
  const dragRef = useRef(null)
  const rectRef = useRef(null)

  const pct = (e) => {
    const rect = fieldRef.current.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    }
  }

  // ── 자리 블럭 드래그(그립 핸들) ────────────────────────────────────────────
  const onGripDown = (e, slot) => {
    e.stopPropagation()
    // 잡은 지점과 카드 중앙(grid_col/row)의 오프셋을 기억 → 이동 중 핸들이 커서를 따라오게(중앙 점프 방지).
    const p = fieldRef.current ? pct(e) : { x: slot.grid_col, y: slot.grid_row }
    dragRef.current = { key: slot._key, offX: p.x - slot.grid_col, offY: p.y - slot.grid_row }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const onGripMove = (e) => {
    if (!dragRef.current || !fieldRef.current) return
    const p = pct(e)
    const { key, offX, offY } = dragRef.current
    setSlots((prev) => prev.map((s) => (s._key === key ? { ...s, grid_col: clamp(p.x - offX), grid_row: clamp(p.y - offY) } : s)))
  }
  const onGripUp = () => { dragRef.current = null }

  // ── 홀·주방 네모 이동/리사이즈 (보드 공통 layout) ──────────────────────────
  const rects = [
    { key: 'hall', label: '홀', cls: 'roster-field-hall', x: layout.hall_x, y: layout.hall_y, w: layout.hall_w, h: layout.hall_h },
    { key: 'kitchen', label: '주방 · 바', cls: 'roster-field-kitchen', x: layout.kitchen_x, y: layout.kitchen_y, w: layout.kitchen_w, h: layout.kitchen_h },
  ]
  const onRectDown = (e, rect, mode) => {
    e.stopPropagation()
    const p = pct(e)
    rectRef.current = { key: rect.key, mode, startX: p.x, startY: p.y, orig: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const onRectMove = (e) => {
    if (!rectRef.current || !fieldRef.current) return
    const p = pct(e)
    const { key, mode, startX, startY, orig } = rectRef.current
    let nx = orig.x, ny = orig.y, nw = orig.w, nh = orig.h
    if (mode === 'move') {
      const dx = p.x - startX, dy = p.y - startY
      nx = cl(orig.x + dx, 0, 100 - orig.w); ny = cl(orig.y + dy, 0, 100 - orig.h)
    } else {
      nw = cl(p.x - orig.x, 10, 100 - orig.x); nh = cl(p.y - orig.y, 10, 100 - orig.y)
    }
    setLayout((prev) => ({ ...prev, [`${key}_x`]: nx, [`${key}_y`]: ny, [`${key}_w`]: nw, [`${key}_h`]: nh }))
  }
  const onRectUp = () => { rectRef.current = null }

  // ── 자리 블럭 추가/삭제/편집 ───────────────────────────────────────────────
  const addSlot = () => {
    const used = new Set(slots.map((s) => s.role))
    const role = ROSTER_ROLE_PRESETS.find((r) => !used.has(r)) || '커피'
    setSlots((prev) => [...prev, { _key: tmpKey(), grid_col: 50, grid_row: 50, role, tasks: ROLE_TASKS[role] || '', shift: null }])
  }
  const removeSlot = (key) => setSlots((prev) => prev.filter((s) => s._key !== key))
  const updateSlot = (key, patch) => setSlots((prev) => prev.map((s) => (s._key === key ? { ...s, ...patch } : s)))
  const stop = (e) => e.stopPropagation()

  return (
    <div className="roster-board">
      <div className="roster-edit-hint">
        <b>홀·주방 네모</b>는 드래그/모서리로 조절(모든 체제 공통). <b>자리 블럭</b>은 추가 후 그립(⋮⋮)으로 옮기고 역할·설명을 편집합니다.
      </div>

      <div className="roster-field is-editing" ref={fieldRef} style={{ '--roster-field-ratio': layout.field_ratio ?? 1.6, '--roster-field-size': `${layout.field_size ?? 56}vh` }}>
        {rects.map((r) => (
          <div
            key={r.key} className={`${r.cls} is-editing`}
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
            onPointerDown={(e) => onRectDown(e, r, 'move')} onPointerMove={onRectMove} onPointerUp={onRectUp}
          >
            <span className={r.key === 'hall' ? 'roster-field-hall-label' : 'roster-field-kitchen-label'}>{r.label} (드래그/모서리)</span>
            <div className="roster-kitchen-resize"
              onPointerDown={(e) => onRectDown(e, r, 'resize')} onPointerMove={onRectMove} onPointerUp={onRectUp} />
          </div>
        ))}

        {slots.map((s) => (
          <div key={s._key} className="roster-fieldslot editing" style={{ left: `${s.grid_col}%`, top: `${s.grid_row}%` }}>
            <div className="roster-editslot-bar">
              <button type="button" className="roster-editslot-grip" title="드래그 이동"
                onPointerDown={(e) => onGripDown(e, s)} onPointerMove={onGripMove} onPointerUp={onGripUp}>
                <GripVertical size={13} />
              </button>
              <button type="button" className="roster-chip-del" title="블럭 삭제" onClick={() => removeSlot(s._key)}>
                <X size={12} />
              </button>
            </div>
            <input
              className="roster-input roster-editslot-role" list="roster-edit-roles"
              value={s.role || ''} placeholder="역할"
              onPointerDown={stop} onChange={(e) => updateSlot(s._key, { role: e.target.value })}
            />
            <input
              className="roster-input roster-editslot-tasks"
              value={s.tasks || ''} placeholder="세부 설명 (예: 샷, 스팀)"
              onPointerDown={stop} onChange={(e) => updateSlot(s._key, { tasks: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="roster-edit-toolbar">
        <button type="button" className="roster-add-btn" onClick={addSlot}><Plus size={14} /> 멤버 자리(블럭) 추가</button>
        <span className="roster-edit-count">자리 {slots.length}개</span>
        <label className="roster-ratio-ctrl" title="배경 캔버스 가로:세로 비율 (낮을수록 덜 가로로 김)">
          배경 비율
          <input type="range" min="0.8" max="2.2" step="0.05"
            value={layout.field_ratio ?? 1.6}
            onChange={(e) => setLayout((prev) => ({ ...prev, field_ratio: parseFloat(e.target.value) }))} />
          <span className="roster-ratio-val">{Number(layout.field_ratio ?? 1.6).toFixed(2)}</span>
        </label>
        <label className="roster-ratio-ctrl" title="배경 캔버스 크기 (클수록 배경이 커져 자리 카드가 상대적으로 작아짐)">
          배경 크기
          <input type="range" min="40" max="92" step="2"
            value={layout.field_size ?? 56}
            onChange={(e) => setLayout((prev) => ({ ...prev, field_size: parseInt(e.target.value, 10) }))} />
          <span className="roster-ratio-val">{layout.field_size ?? 56}</span>
        </label>
      </div>

      <datalist id="roster-edit-roles">
        {ROSTER_ROLE_PRESETS.map((r) => <option key={r} value={r} />)}
      </datalist>
    </div>
  )
}
