import React from 'react'

export function TableToolbar({ editor, position, onClose }) {
  return (
    <div
      className="table-toolbar"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 1000,
      }}
    >
      <div className="table-toolbar-group">
        <button
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          title="왼쪽에 열 추가"
          className="table-toolbar-btn"
        >
          ← 열
        </button>
        <button
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          title="오른쪽에 열 추가"
          className="table-toolbar-btn"
        >
          열 →
        </button>
        <button
          onClick={() => editor.chain().focus().deleteColumn().run()}
          title="열 삭제"
          className="table-toolbar-btn delete"
        >
          열 삭제
        </button>
      </div>
      <div className="table-toolbar-divider"></div>
      <div className="table-toolbar-group">
        <button
          onClick={() => editor.chain().focus().addRowBefore().run()}
          title="위에 행 추가"
          className="table-toolbar-btn"
        >
          ↑ 행
        </button>
        <button
          onClick={() => editor.chain().focus().addRowAfter().run()}
          title="아래에 행 추가"
          className="table-toolbar-btn"
        >
          행 ↓
        </button>
        <button
          onClick={() => editor.chain().focus().deleteRow().run()}
          title="행 삭제"
          className="table-toolbar-btn delete"
        >
          행 삭제
        </button>
      </div>
      <div className="table-toolbar-divider"></div>
      <button
        onClick={() => editor.chain().focus().deleteTable().run()}
        title="표 삭제"
        className="table-toolbar-btn delete"
      >
        표 삭제
      </button>
      <div className="table-toolbar-divider"></div>
      <button onClick={onClose} title="닫기" className="table-toolbar-btn close">
        ✕
      </button>
    </div>
  )
}
