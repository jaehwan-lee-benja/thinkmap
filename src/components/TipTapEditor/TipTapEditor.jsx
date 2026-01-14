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
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { Toggle } from './extensions/ToggleExtension'
import './TipTapEditor.css'

// lowlight 인스턴스 생성 (common 언어들: js, css, html, python 등)
const lowlight = createLowlight(common)

function TipTapEditor({ content, onUpdate, placeholder = '내용을 입력하세요...', editorRef }) {
  // 블록 컨텍스트 메뉴 상태
  const [contextMenuVisible, setContextMenuVisible] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ top: 0, left: 0 })
  const [contextMenuNodePos, setContextMenuNodePos] = useState(null)
  const contextMenuRef = useRef(null)

  // 이미지/링크 입력 상태
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // 테이블 툴바 상태
  const [tableToolbarVisible, setTableToolbarVisible] = useState(false)
  const [tableToolbarPosition, setTableToolbarPosition] = useState({ top: 0, left: 0 })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        blockquote: false, // "> " 입력 시 토글로 변환하기 위해 비활성화
        codeBlock: false, // CodeBlockLowlight 사용을 위해 비활성화
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'javascript',
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

  // 테이블 커서 위치 감지 및 툴바 표시
  useEffect(() => {
    if (!editor) return

    const updateTableToolbar = () => {
      const { selection } = editor.state
      const isInTable = editor.isActive('table')

      if (isInTable) {
        // 현재 선택된 셀의 DOM 요소 찾기
        const { $from } = selection
        const domAtPos = editor.view.domAtPos($from.pos)
        const cell = domAtPos.node?.closest?.('td, th') || domAtPos.node?.parentElement?.closest?.('td, th')

        if (cell) {
          const table = cell.closest('table')
          if (table) {
            const tableRect = table.getBoundingClientRect()
            setTableToolbarPosition({
              top: tableRect.top - 40,
              left: tableRect.left
            })
            setTableToolbarVisible(true)
            return
          }
        }
      }
      setTableToolbarVisible(false)
    }

    const handleClickOutside = (e) => {
      const isTable = e.target.closest('table')
      const isToolbar = e.target.closest('.table-toolbar')
      if (!isTable && !isToolbar) {
        setTableToolbarVisible(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setTableToolbarVisible(false)
      }
    }

    editor.on('selectionUpdate', updateTableToolbar)
    editor.on('focus', updateTableToolbar)
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      editor.off('selectionUpdate', updateTableToolbar)
      editor.off('focus', updateTableToolbar)
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor])

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

  // 파일 input ref
  const imageInputRef = useRef(null)

  // 이미지 파일 업로드 함수
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result
      editor.chain().focus().setImage({ src: base64 }).run()
      setShowImageInput(false)
      setContextMenuVisible(false)
    }
    reader.readAsDataURL(file)

    // input 초기화 (같은 파일 다시 선택 가능하도록)
    e.target.value = ''
  }

  // 이미지 URL 삽입 함수
  const handleInsertImage = () => {
    if (!imageUrl) return

    editor.chain().focus().setImage({ src: imageUrl }).run()
    setImageUrl('')
    setShowImageInput(false)
    setContextMenuVisible(false)
  }

  // 링크 삽입 함수
  const handleSetLink = () => {
    if (!linkUrl) return

    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: linkUrl })
      .run()

    setLinkUrl('')
    setShowLinkInput(false)
    setContextMenuVisible(false)
  }

  // 링크 제거 함수
  const handleUnsetLink = () => {
    editor.chain().focus().unsetLink().run()
    setContextMenuVisible(false)
  }

  if (!editor) {
    return <div>에디터 로딩 중...</div>
  }

  return (
    <div className="tiptap-wrapper">
      <EditorContent editor={editor} />

      {/* 테이블 툴바 */}
      {tableToolbarVisible && editor && (
        <div
          className="table-toolbar"
          style={{
            position: 'fixed',
            top: `${tableToolbarPosition.top}px`,
            left: `${tableToolbarPosition.left}px`,
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
          <button
            onClick={() => setTableToolbarVisible(false)}
            title="닫기"
            className="table-toolbar-btn close"
          >
            ✕
          </button>
        </div>
      )}

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

          <div className="context-menu-separator"></div>

          {/* 이미지 삽입 */}
          {!showImageInput ? (
            <>
              {/* 숨겨진 파일 input */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <button
                className="context-menu-item"
                onClick={() => imageInputRef.current?.click()}
              >
                <span className="context-menu-icon">📁</span>
                <span>이미지 업로드</span>
              </button>
              <button
                className="context-menu-item"
                onClick={() => setShowImageInput(true)}
              >
                <span className="context-menu-icon">🔗</span>
                <span>이미지 URL</span>
              </button>
            </>
          ) : (
            <div className="context-menu-input-group">
              <input
                type="text"
                placeholder="이미지 URL 입력..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInsertImage()
                  if (e.key === 'Escape') {
                    setShowImageInput(false)
                    setImageUrl('')
                  }
                }}
                autoFocus
              />
              <button onClick={handleInsertImage}>삽입</button>
            </div>
          )}

          {/* 링크 삽입/제거 */}
          {!showLinkInput ? (
            <>
              <button
                className="context-menu-item"
                onClick={() => setShowLinkInput(true)}
              >
                <span className="context-menu-icon">🔗</span>
                <span>링크 삽입</span>
              </button>
              {editor.isActive('link') && (
                <button
                  className="context-menu-item"
                  onClick={handleUnsetLink}
                >
                  <span className="context-menu-icon">🔗</span>
                  <span>링크 제거</span>
                </button>
              )}
            </>
          ) : (
            <div className="context-menu-input-group">
              <input
                type="text"
                placeholder="링크 URL 입력..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSetLink()
                  if (e.key === 'Escape') {
                    setShowLinkInput(false)
                    setLinkUrl('')
                  }
                }}
                autoFocus
              />
              <button onClick={handleSetLink}>삽입</button>
            </div>
          )}

          <div className="context-menu-separator"></div>

          {/* 코드 블록 삽입 */}
          <button
            className="context-menu-item"
            onClick={() => {
              editor.chain().focus().toggleCodeBlock().run()
              setContextMenuVisible(false)
            }}
          >
            <span className="context-menu-icon">{'</>'}</span>
            <span>{editor.isActive('codeBlock') ? '코드 블록 해제' : '코드 블록'}</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default TipTapEditor
