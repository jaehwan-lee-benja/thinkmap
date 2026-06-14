// 배치도 작전판 — 레이아웃 편집 (Phase D). 멤버 자리(블럭)를 추가/삭제, 드래그로 이동,
// 블럭 위에서 역할·세부설명을 직접 편집. 주방/바 사각형도 이동/리사이즈. 저장은 모달(replaceSlots/createTemplate).
// 좌표: grid_col=x%, grid_row=y% (2~98 클램프, 정수 스냅). PLAN-roster-visual-board.md §6.1b.

import React, { useRef } from 'react'
import { X, Plus, GripVertical } from 'lucide-react'
import { ROSTER_ROLE_PRESETS, ROLE_TASKS } from '../../utils/rosterPresets'

let TMP = 0
const tmpKey = () => `tmp-${++TMP}`
const clamp = (v) => Math.max(2, Math.min(98, Math.round(v)))

export default function RosterBoardEditor({ slots, setSlots, kitchen, setKitchen }) {
  const fieldRef = useRef(null)
  const dragRef = useRef(null)
  const kitchenRef = useRef(null)

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
    dragRef.current = { key: slot._key }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const onGripMove = (e) => {
    if (!dragRef.current || !fieldRef.current) return
    const p = pct(e)
    setSlots((prev) => prev.map((s) => (s._key === dragRef.current.key ? { ...s, grid_col: clamp(p.x), grid_row: clamp(p.y) } : s)))
  }
  const onGripUp = () => { dragRef.current = null }

  // ── 주방 사각형 이동/리사이즈 ──────────────────────────────────────────────
  const onKitchenDown = (e, mode) => {
    e.stopPropagation()
    const p = pct(e)
    kitchenRef.current = { mode, startX: p.x, startY: p.y, orig: { ...kitchen } }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
  }
  const onKitchenMove = (e) => {
    if (!kitchenRef.current || !fieldRef.current) return
    const p = pct(e)
    const { mode, startX, startY, orig } = kitchenRef.current
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)))
    if (mode === 'move') {
      const dx = p.x - startX, dy = p.y - startY
      setKitchen({ ...orig, x: cl(orig.x + dx, 0, 100 - orig.w), y: cl(orig.y + dy, 0, 100 - orig.h) })
    } else {
      setKitchen({ ...orig, w: cl(p.x - orig.x, 15, 100 - orig.x), h: cl(p.y - orig.y, 15, 100 - orig.y) })
    }
  }
  const onKitchenUp = () => { kitchenRef.current = null }

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
        <b>멤버 자리(블럭)</b>를 추가하고, 그립(⋮⋮)으로 드래그해 옮기세요. 블럭 안에서 역할·설명을 바로 편집할 수 있습니다.
      </div>

      <div className="roster-field is-editing" ref={fieldRef}>
        <span className="roster-field-hall-label">홀</span>
        <div
          className="roster-field-kitchen is-editing"
          style={{ left: `${kitchen.x}%`, top: `${kitchen.y}%`, width: `${kitchen.w}%`, height: `${kitchen.h}%` }}
          onPointerDown={(e) => onKitchenDown(e, 'move')}
          onPointerMove={onKitchenMove}
          onPointerUp={onKitchenUp}
        >
          <span className="roster-field-kitchen-label">주방 · 바 (드래그/모서리로 조절)</span>
          <div className="roster-kitchen-resize"
            onPointerDown={(e) => onKitchenDown(e, 'resize')} onPointerMove={onKitchenMove} onPointerUp={onKitchenUp} />
        </div>

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
      </div>

      <datalist id="roster-edit-roles">
        {ROSTER_ROLE_PRESETS.map((r) => <option key={r} value={r} />)}
      </datalist>
    </div>
  )
}
