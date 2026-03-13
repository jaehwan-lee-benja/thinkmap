import React, { useState, useRef } from 'react'
import { useClickOutside } from '../../../hooks/useClickOutside'

export const COLORS = [
  { name: '기본', value: null },
  { name: '빨강', value: '#ef4444' },
  { name: '주황', value: '#f97316' },
  { name: '노랑', value: '#eab308' },
  { name: '초록', value: '#22c55e' },
  { name: '파랑', value: '#3b82f6' },
  { name: '보라', value: '#a855f7' },
  { name: '분홍', value: '#ec4899' },
  { name: '회색', value: '#9ca3af' },
]

export function ColorPicker({ editor, onClose }) {
  const ref = useRef(null)
  useClickOutside(ref, onClose)

  const currentColor = editor.getAttributes('textStyle').color || null

  return (
    <div className="color-picker-grid" ref={ref}>
      {COLORS.map(c => (
        <button
          key={c.name}
          className={`color-picker-swatch ${currentColor === c.value ? 'is-active' : ''}`}
          title={c.name}
          onClick={() => {
            if (c.value) {
              editor.chain().focus().setColor(c.value).run()
            } else {
              editor.chain().focus().unsetColor().run()
            }
            if (onClose) onClose()
          }}
        >
          <span
            className="color-picker-dot"
            style={{ background: c.value || '#e5e7eb' }}
          />
        </button>
      ))}
    </div>
  )
}
