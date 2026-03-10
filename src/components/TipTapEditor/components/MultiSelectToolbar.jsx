import React from 'react'

export function MultiSelectToolbar({ count, onConvertToTodo, onDelete, onClear }) {
  return (
    <div className="multi-select-toolbar">
      <span className="multi-select-count">{count}개 선택</span>
      <div className="multi-select-divider"></div>
      <div className="multi-select-actions">
        <button onClick={onConvertToTodo} className="multi-select-btn todo" title="체크박스로 변환">
          ☑ 체크박스 전환
        </button>
        <button onClick={onDelete} className="multi-select-btn delete" title="선택한 블록 삭제">
          삭제
        </button>
      </div>
      <div className="multi-select-divider"></div>
      <button onClick={onClear} className="multi-select-btn close" title="선택 해제 (Esc)">
        ✕
      </button>
    </div>
  )
}
