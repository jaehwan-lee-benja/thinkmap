import React, { useState, useRef, useEffect } from 'react'
import './TabBar.css'

export function TabBar({
  tabs, activeTabId, onSwitch, onAdd, onRemove, onRename,
  splitMode, splitPanes, activePaneIndex, onSplitToggle,
}) {
  const [editingTabId, setEditingTabId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  const handleDoubleClick = (tab) => {
    setEditingTabId(tab.id)
    setEditValue(tab.label)
  }

  const handleEditSubmit = (tabId) => {
    if (editValue.trim()) {
      onRename(tabId, editValue.trim())
    }
    setEditingTabId(null)
  }

  // 분할 모드에서 탭이 어느 패널에 있는지 표시
  const getPaneIndicator = (tabId) => {
    if (!splitMode || !splitPanes) return null
    if (splitPanes[0] === tabId && splitPanes[1] === tabId) return 'both'
    if (splitPanes[0] === tabId) return 'left'
    if (splitPanes[1] === tabId) return 'right'
    return null
  }

  return (
    <div className="tab-bar">
      <div className="tab-bar-tabs">
        {tabs.map(tab => {
          const panePos = getPaneIndicator(tab.id)
          return (
            <div
              key={tab.id}
              className={`tab-bar-tab ${tab.id === activeTabId ? 'active' : ''} ${panePos ? `in-pane-${panePos}` : ''}`}
              onClick={() => onSwitch(tab.id)}
              onDoubleClick={() => handleDoubleClick(tab)}
            >
              {/* 분할 패널 인디케이터 */}
              {panePos && panePos !== 'both' && (
                <span className={`tab-pane-dot ${panePos}`} title={panePos === 'left' ? '왼쪽 패널' : '오른쪽 패널'} />
              )}
              {editingTabId === tab.id ? (
                <input
                  ref={inputRef}
                  className="tab-bar-edit-input"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => handleEditSubmit(tab.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleEditSubmit(tab.id)
                    if (e.key === 'Escape') setEditingTabId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="tab-bar-label">{tab.label}</span>
                  {tab.impersonatedUserEmail && (
                    <span className="tab-bar-badge" title={`${tab.impersonatedUserEmail}로 활동 중`}>
                      {tab.impersonatedUserEmail.split('@')[0].slice(0, 6)}
                    </span>
                  )}
                </>
              )}
              {tabs.length > 1 && (
                <button
                  className="tab-bar-close"
                  onClick={e => { e.stopPropagation(); onRemove(tab.id) }}
                  title="탭 닫기"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div className="tab-bar-actions">
        <button className="tab-bar-add" onClick={onAdd} title="새 탭 추가">
          +
        </button>
        {onSplitToggle && (
          <button
            className={`tab-bar-split ${splitMode ? 'active' : ''}`}
            onClick={onSplitToggle}
            title={splitMode ? '분할 닫기' : '화면 분할'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="7" y1="1.5" x2="7" y2="12.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
