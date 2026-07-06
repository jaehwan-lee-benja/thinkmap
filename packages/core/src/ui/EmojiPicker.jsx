import React, { useState, useRef, useEffect } from 'react'
import './EmojiPicker.css'

const EMOJI_GROUPS = [
  { label: '자주 사용', emojis: ['📄', '📝', '📋', '📌', '📎', '🗂️', '📁', '📂', '🏠', '⭐'] },
  { label: '사람/활동', emojis: ['👤', '👥', '💼', '🎯', '🏆', '💡', '🔑', '🎨', '🎓', '💪'] },
  { label: '사물', emojis: ['📱', '💻', '🖥️', '📷', '🔧', '⚙️', '🛒', '📦', '🏷️', '💳'] },
  { label: '음식/자연', emojis: ['☕', '🍕', '🌱', '🌸', '🌍', '⛅', '🔥', '💧', '🌈', '🍀'] },
  { label: '기호', emojis: ['✅', '❌', '⚠️', '💬', '❤️', '🔴', '🟡', '🟢', '🔵', '⚡'] },
  { label: '숫자/문자', emojis: ['1️⃣', '2️⃣', '3️⃣', '🅰️', '🅱️', '🔤', '🔠', '#️⃣', '✉️', '🏁'] },
]

export default function EmojiPicker({ currentIcon, onSelect, onRemove, onClose }) {
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div ref={ref} className="emoji-picker">
      <div className="emoji-picker-search">
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="이모지 붙여넣기 (Ctrl+Cmd+Space)"
          className="emoji-picker-input"
          onKeyDown={e => {
            if (e.key === 'Enter' && search.trim()) {
              onSelect(search.trim())
            }
          }}
        />
      </div>
      {currentIcon && (
        <button className="emoji-picker-remove" onClick={onRemove}>
          아이콘 제거
        </button>
      )}
      <div className="emoji-picker-groups">
        {EMOJI_GROUPS.map(group => (
          <div key={group.label} className="emoji-picker-group">
            <div className="emoji-picker-group-label">{group.label}</div>
            <div className="emoji-picker-grid">
              {group.emojis.map(emoji => (
                <button
                  key={emoji}
                  className={`emoji-picker-item ${emoji === currentIcon ? 'selected' : ''}`}
                  onClick={() => onSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
