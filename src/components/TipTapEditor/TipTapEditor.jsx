import React, { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Link } from '@tiptap/extension-link'
import { Image } from '@tiptap/extension-image'
import { Toggle } from './extensions/ToggleExtension'
import './TipTapEditor.css'

function TipTapEditor({ content, onUpdate, placeholder = '내용을 입력하세요...', editorRef }) {
  // 블록 컨텍스트 메뉴 상태
  const [contextMenuVisible, setContextMenuVisible] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ top: 0, left: 0 })
  const [contextMenuNodePos, setContextMenuNodePos] = useState(null)
  const contextMenuRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        blockquote: false, // "> " 입력 시 토글로 변환하기 위해 비활성화
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Image,
      Toggle,
    ],
    content: content || {
      type: 'doc',
      content: []
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      if (onUpdate) {
        onUpdate(json)
      }
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
      handleDOMEvents: {
        // TipTap의 기본 드래그 이벤트 비활성화 (우리의 커스텀 드래그 사용)
        dragstart: (view, event) => {
          // drag-handle에서 시작한 드래그는 허용
          if (event.target.closest('.drag-handle')) {
            console.log('🟢 Allowing custom drag from drag-handle')
            return false // TipTap이 처리하지 않음
          }
          // 다른 곳에서의 드래그는 TipTap이 처리
          console.log('🔴 TipTap handling drag')
          return false
        },
      },
    },
  })

  // editor 인스턴스를 ref에 할당
  React.useEffect(() => {
    if (editorRef && editor) {
      editorRef.current = editor
    }
  }, [editor, editorRef])

  // content가 외부에서 변경되었을 때 에디터 업데이트
  React.useEffect(() => {
    if (editor && content && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  // 토글 내부 드래그 핸들 클릭 시 컨텍스트 메뉴
  useEffect(() => {
    if (!editor) return

    // 토글 드래그 핸들에서 발생하는 커스텀 이벤트 처리
    const handleToggleContextMenu = (event) => {
      const { pos, top, left } = event.detail
      setContextMenuNodePos(pos)
      setContextMenuPosition({ top, left })
      setContextMenuVisible(true)
    }

    // 외부 클릭 시 메뉴 닫기
    const handleClickOutside = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target) &&
          !event.target.closest('.toggle-drag-handle')) {
        setContextMenuVisible(false)
      }
    }

    // 이벤트 리스너 추가
    document.addEventListener('toggle-context-menu', handleToggleContextMenu)
    document.addEventListener('click', handleClickOutside)

    return () => {
      document.removeEventListener('toggle-context-menu', handleToggleContextMenu)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [editor])

  // 블록 삭제 함수
  const handleDeleteBlock = () => {
    if (!editor || contextMenuNodePos === null) return

    try {
      const { state } = editor
      const node = state.doc.nodeAt(contextMenuNodePos)

      if (node) {
        editor.chain()
          .focus()
          .deleteRange({
            from: contextMenuNodePos,
            to: contextMenuNodePos + node.nodeSize
          })
          .run()
      }
    } catch (error) {
      console.error('블록 삭제 오류:', error)
    }

    setContextMenuVisible(false)
  }

  // 블록 복제 함수
  const handleDuplicateBlock = () => {
    if (!editor || contextMenuNodePos === null) return

    try {
      const { state } = editor
      const node = state.doc.nodeAt(contextMenuNodePos)

      if (node) {
        const insertPos = contextMenuNodePos + node.nodeSize
        editor.chain()
          .focus()
          .insertContentAt(insertPos, node.toJSON())
          .run()
      }
    } catch (error) {
      console.error('블록 복제 오류:', error)
    }

    setContextMenuVisible(false)
  }


  if (!editor) {
    return <div>에디터 로딩 중...</div>
  }

  return (
    <div className="tiptap-wrapper">
      <EditorContent editor={editor} />

      {/* 블록 컨텍스트 메뉴 (텍스트 서식 + 블록 작업 통합) */}
      {contextMenuVisible && editor && (
        <div
          ref={contextMenuRef}
          className="block-context-menu"
          style={{
            position: 'fixed',
            top: `${contextMenuPosition.top}px`,
            left: `${contextMenuPosition.left}px`,
            zIndex: 1000,
          }}
        >
          {/* 텍스트 서식 버튼 */}
          <div className="context-menu-format-row">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive('bold') ? 'format-button is-active' : 'format-button'}
              title="Bold (Cmd+B)"
            >
              <strong>B</strong>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={editor.isActive('italic') ? 'format-button is-active' : 'format-button'}
              title="Italic (Cmd+I)"
            >
              <em>I</em>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={editor.isActive('strike') ? 'format-button is-active' : 'format-button'}
              title="Strikethrough"
            >
              <s>S</s>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleCode().run()}
              className={editor.isActive('code') ? 'format-button is-active' : 'format-button'}
              title="Code"
            >
              {'</>'}
            </button>
          </div>

          <div className="context-menu-separator"></div>

          {/* 블록 작업 버튼 */}
          <button
            className="context-menu-item"
            onClick={handleDeleteBlock}
          >
            <span className="context-menu-icon">🗑️</span>
            <span>삭제</span>
            <span className="context-menu-shortcut">Delete</span>
          </button>
          <button
            className="context-menu-item"
            onClick={handleDuplicateBlock}
          >
            <span className="context-menu-icon">📋</span>
            <span>복제</span>
            <span className="context-menu-shortcut">⌘D</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default TipTapEditor
