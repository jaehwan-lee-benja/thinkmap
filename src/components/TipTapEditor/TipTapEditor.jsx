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
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import './TipTapEditor.css'

function TipTapEditor({ content, onUpdate, placeholder = '내용을 입력하세요...', editorRef }) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [bubbleMenuVisible, setBubbleMenuVisible] = useState(false)
  const [bubbleMenuPosition, setBubbleMenuPosition] = useState({ top: 0, left: 0 })
  const bubbleMenuRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
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
      GlobalDragHandle,  // 설정 없이 기본값 사용
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


  // 텍스트 선택 감지 및 BubbleMenu 위치 업데이트
  useEffect(() => {
    if (!editor) return

    const updateBubbleMenu = () => {
      const { state } = editor
      const { selection } = state
      const { from, to } = selection

      // 텍스트가 선택되지 않았거나, 빈 선택인 경우
      if (from === to) {
        setBubbleMenuVisible(false)
        return
      }

      // 선택 영역의 DOM rect 가져오기
      const { view } = editor
      const start = view.coordsAtPos(from)
      const end = view.coordsAtPos(to)

      // BubbleMenu 위치 계산
      const left = (start.left + end.left) / 2
      const menuHeight = 50 // BubbleMenu 예상 높이

      // 위쪽에 공간이 충분하면 위에, 아니면 아래에 표시
      let top
      if (start.top < menuHeight + 10) {
        // 위쪽 공간 부족 → 아래에 표시
        top = end.bottom + 10
      } else {
        // 위쪽에 표시
        top = start.top - menuHeight - 10
      }

      setBubbleMenuPosition({ top, left })
      setBubbleMenuVisible(true)
    }

    editor.on('selectionUpdate', updateBubbleMenu)
    editor.on('transaction', updateBubbleMenu)

    return () => {
      editor.off('selectionUpdate', updateBubbleMenu)
      editor.off('transaction', updateBubbleMenu)
    }
  }, [editor])

  if (!editor) {
    return <div>에디터 로딩 중...</div>
  }

  const setLink = () => {
    if (!linkUrl) return

    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: linkUrl })
      .run()

    setLinkUrl('')
    setShowLinkInput(false)
  }

  return (
    <div className="tiptap-wrapper">
      {/* Custom BubbleMenu (positioned absolutely) */}
      {bubbleMenuVisible && editor && (
        <div
          ref={bubbleMenuRef}
          className="bubble-menu"
          style={{
            position: 'fixed',
            top: `${bubbleMenuPosition.top}px`,
            left: `${bubbleMenuPosition.left}px`,
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
        >
          {showLinkInput ? (
            <div className="bubble-menu-link-input">
              <input
                type="url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setLink()
                  } else if (e.key === 'Escape') {
                    setShowLinkInput(false)
                    setLinkUrl('')
                  }
                }}
                autoFocus
                className="link-input"
              />
              <button
                onClick={setLink}
                className="bubble-menu-button primary"
              >
                ✓
              </button>
              <button
                onClick={() => {
                  setShowLinkInput(false)
                  setLinkUrl('')
                }}
                className="bubble-menu-button"
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={editor.isActive('bold') ? 'bubble-menu-button is-active' : 'bubble-menu-button'}
                title="Bold (Cmd+B)"
              >
                <strong>B</strong>
              </button>
              <button
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={editor.isActive('italic') ? 'bubble-menu-button is-active' : 'bubble-menu-button'}
                title="Italic (Cmd+I)"
              >
                <em>I</em>
              </button>
              <button
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={editor.isActive('strike') ? 'bubble-menu-button is-active' : 'bubble-menu-button'}
                title="Strikethrough"
              >
                <s>S</s>
              </button>
              <button
                onClick={() => editor.chain().focus().toggleCode().run()}
                className={editor.isActive('code') ? 'bubble-menu-button is-active' : 'bubble-menu-button'}
                title="Code"
              >
                {'</>'}
              </button>
              <div className="bubble-menu-separator"></div>
              <button
                onClick={() => {
                  const previousUrl = editor.getAttributes('link').href
                  setLinkUrl(previousUrl || '')
                  setShowLinkInput(true)
                }}
                className={editor.isActive('link') ? 'bubble-menu-button is-active' : 'bubble-menu-button'}
                title="Link"
              >
                🔗
              </button>
              {editor.isActive('link') && (
                <button
                  onClick={() => editor.chain().focus().unsetLink().run()}
                  className="bubble-menu-button"
                  title="Remove link"
                >
                  🔗✕
                </button>
              )}
            </>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

export default TipTapEditor
