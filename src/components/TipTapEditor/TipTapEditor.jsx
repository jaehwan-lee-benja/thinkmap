import React, { useState } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
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
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

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
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="bubble-menu"
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
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

export default TipTapEditor
