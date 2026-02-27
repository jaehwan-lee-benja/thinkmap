import React, { useState, useRef, useEffect } from 'react'

export function BlockContextMenu({ editor, position, nodePos, onClose }) {
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const menuRef = useRef(null)
  const imageInputRef = useRef(null)

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) &&
          !event.target.closest('.toggle-drag-handle')) {
        onClose()
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [onClose])

  const handleDeleteBlock = () => {
    if (nodePos === null) return
    try {
      const node = editor.state.doc.nodeAt(nodePos)
      if (node) {
        editor.chain().focus().deleteRange({ from: nodePos, to: nodePos + node.nodeSize }).run()
      }
    } catch (error) {
      console.error('블록 삭제 오류:', error)
    }
    onClose()
  }

  const handleDuplicateBlock = () => {
    if (nodePos === null) return
    try {
      const node = editor.state.doc.nodeAt(nodePos)
      if (node) {
        editor.chain().focus().insertContentAt(nodePos + node.nodeSize, node.toJSON()).run()
      }
    } catch (error) {
      console.error('블록 복제 오류:', error)
    }
    onClose()
  }

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result }).run()
      setShowImageInput(false)
      onClose()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleInsertImage = () => {
    if (!imageUrl) return
    editor.chain().focus().setImage({ src: imageUrl }).run()
    setImageUrl('')
    setShowImageInput(false)
    onClose()
  }

  const handleSetLink = () => {
    if (!linkUrl) return
    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run()
    setLinkUrl('')
    setShowLinkInput(false)
    onClose()
  }

  const handleUnsetLink = () => {
    editor.chain().focus().unsetLink().run()
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="block-context-menu"
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
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
      <button className="context-menu-item" onClick={handleDeleteBlock}>
        <span className="context-menu-icon">🗑️</span>
        <span>삭제</span>
        <span className="context-menu-shortcut">Delete</span>
      </button>
      <button className="context-menu-item" onClick={handleDuplicateBlock}>
        <span className="context-menu-icon">📋</span>
        <span>복제</span>
        <span className="context-menu-shortcut">⌘D</span>
      </button>

      <div className="context-menu-separator"></div>

      {/* 이미지 삽입 */}
      {!showImageInput ? (
        <>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <button className="context-menu-item" onClick={() => imageInputRef.current?.click()}>
            <span className="context-menu-icon">📁</span>
            <span>이미지 업로드</span>
          </button>
          <button className="context-menu-item" onClick={() => setShowImageInput(true)}>
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
              if (e.key === 'Escape') { setShowImageInput(false); setImageUrl('') }
            }}
            autoFocus
          />
          <button onClick={handleInsertImage}>삽입</button>
        </div>
      )}

      {/* 링크 삽입/제거 */}
      {!showLinkInput ? (
        <>
          <button className="context-menu-item" onClick={() => setShowLinkInput(true)}>
            <span className="context-menu-icon">🔗</span>
            <span>링크 삽입</span>
          </button>
          {editor.isActive('link') && (
            <button className="context-menu-item" onClick={handleUnsetLink}>
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
              if (e.key === 'Escape') { setShowLinkInput(false); setLinkUrl('') }
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
          onClose()
        }}
      >
        <span className="context-menu-icon">{'</>'}</span>
        <span>{editor.isActive('codeBlock') ? '코드 블록 해제' : '코드 블록'}</span>
      </button>
    </div>
  )
}
