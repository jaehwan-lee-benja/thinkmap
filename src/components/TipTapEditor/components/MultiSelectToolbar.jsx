import React from 'react'

export function MultiSelectToolbar({ count, onConvertToTodo, onDelete, onClear }) {
  // 에디터 포커스/state 변경 방지용 핸들러
  const handleAction = (e, action) => {
    e.preventDefault()
    e.stopPropagation()
    action()
  }

  return (
    <div className="multi-select-toolbar" onMouseDown={(e) => e.preventDefault()}>
      <span className="multi-select-count">{count}개 선택</span>
      <div className="multi-select-divider"></div>
      <div className="multi-select-actions">
        <button onMouseDown={(e) => handleAction(e, onConvertToTodo)} className="multi-select-btn todo" title="체크박스로 변환">
          ☑ 체크박스 전환
        </button>
        <button onMouseDown={(e) => handleAction(e, onDelete)} className="multi-select-btn delete" title="선택한 블록 삭제">
          삭제
        </button>
      </div>
      <div className="multi-select-divider"></div>
      <button onMouseDown={(e) => handleAction(e, onClear)} className="multi-select-btn close" title="선택 해제 (Esc)">
        ✕
      </button>
    </div>
  )
}
