import React, { useRef, useEffect } from 'react'
import { StickyNote, X } from 'lucide-react'
import './MemoPanel.css'

export function MemoPanel({ isOpen, onToggle, content, onContentChange, loading, saving }) {
  const textareaRef = useRef(null)
  const panelRef = useRef(null)

  // 패널 열릴 때 textarea에 포커스
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 200)
    }
  }, [isOpen])

  // 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        !e.target.closest('.memo-fab')
      ) {
        onToggle()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, onToggle])

  return (
    <>
      {/* 플로팅 연필 버튼 */}
      <button
        className={`memo-fab ${isOpen ? 'memo-fab-active' : ''}`}
        onClick={onToggle}
        title="간단 메모"
      >
        {isOpen ? <X size={20} /> : <StickyNote size={22} />}
      </button>

      {/* 메모 패널 */}
      <div className={`memo-panel ${isOpen ? 'memo-panel-open' : ''}`} ref={panelRef}>
        <div className="memo-panel-header">
          <span className="memo-panel-title">간단 메모</span>
          {saving && <span className="memo-saving-indicator">저장 중...</span>}
        </div>
        <div className="memo-panel-body">
          {loading ? (
            <div className="memo-loading">로딩 중...</div>
          ) : (
            <textarea
              ref={textareaRef}
              className="memo-textarea"
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              placeholder="여기에 메모를 작성하세요..."
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </>
  )
}
