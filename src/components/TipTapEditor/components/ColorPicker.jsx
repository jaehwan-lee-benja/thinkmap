import React, { useState, useRef } from 'react'
import { useClickOutside } from '@thinkmap/core'

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

export const BG_COLORS = [
  { name: '기본', value: null },
  { name: '빨강 배경', value: 'rgba(239, 68, 68, 0.15)' },
  { name: '주황 배경', value: 'rgba(249, 115, 22, 0.15)' },
  { name: '노랑 배경', value: 'rgba(234, 179, 8, 0.15)' },
  { name: '초록 배경', value: 'rgba(34, 197, 94, 0.15)' },
  { name: '파랑 배경', value: 'rgba(59, 130, 246, 0.15)' },
  { name: '보라 배경', value: 'rgba(168, 85, 247, 0.15)' },
  { name: '분홍 배경', value: 'rgba(236, 72, 153, 0.15)' },
  { name: '회색 배경', value: 'rgba(156, 163, 175, 0.15)' },
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
