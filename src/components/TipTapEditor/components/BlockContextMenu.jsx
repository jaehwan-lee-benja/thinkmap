import React, { useState, useRef, useLayoutEffect } from 'react'
import { useClickOutside } from '../../../hooks/useClickOutside'

export function BlockContextMenu({ editor, position, nodePos, onClose }) {
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const menuRef = useRef(null)
  const imageInputRef = useRef(null)

  // 들여쓰기/내어쓰기 가능 여부 계산
  const indentInfo = (() => {
    try {
      if (nodePos === null || nodePos >= editor.state.doc.content.size) return { canIndent: false, canOutdent: false }
      const node = editor.state.doc.nodeAt(nodePos)
      if (!node || node.type.name !== 'toggle') return { canIndent: false, canOutdent: false }

      const $pos = editor.state.doc.resolve(nodePos)
      const depth = $pos.depth
      const indexInParent = $pos.index(depth)

      // 들여쓰기: 이전 형제가 토글이어야 함
      let canIndent = false
      if (indexInParent > 0) {
        const prevPos = $pos.posAtIndex(indexInParent - 1, depth)
        const prev = editor.state.doc.nodeAt(prevPos)
        canIndent = prev?.type.name === 'toggle'
      }

      // 내어쓰기: 부모가 토글이어야 함 (최상위가 아님)
      let canOutdent = false
      for (let d = depth - 1; d > 0; d--) {
        if ($pos.node(d).type.name === 'toggle') { canOutdent = true; break }
      }

      return { canIndent, canOutdent }
    } catch {
      return { canIndent: false, canOutdent: false }
    }
  })()

  const handleIndent = () => {
    try {
      if (nodePos === null) return
      const { state } = editor
      const node = state.doc.nodeAt(nodePos)
      if (!node) return

      const $pos = state.doc.resolve(nodePos)
      const depth = $pos.depth
      const indexInParent = $pos.index(depth)
      const prevPos = $pos.posAtIndex(indexInParent - 1, depth)
      const prevSibling = state.doc.nodeAt(prevPos)
      if (!prevSibling || prevSibling.type.name !== 'toggle') return

      const tr = state.tr
      if (!prevSibling.attrs.isOpen) {
        tr.setNodeMarkup(prevPos, null, { ...prevSibling.attrs, isOpen: true })
      }
      const insertPos = prevPos + prevSibling.nodeSize - 1
      tr.insert(insertPos, node)
      const mappedPos = tr.mapping.map(nodePos)
      tr.delete(mappedPos, mappedPos + node.nodeSize)
      editor.view.dispatch(tr)
    } catch (e) {
      console.error('들여쓰기 오류:', e)
    }
    onClose()
  }

  const handleOutdent = () => {
    try {
      if (nodePos === null) return
      const { state } = editor
      const node = state.doc.nodeAt(nodePos)
      if (!node) return

      const $pos = state.doc.resolve(nodePos)
      let parentToggleDepth = -1
      for (let d = $pos.depth - 1; d > 0; d--) {
        if ($pos.node(d).type.name === 'toggle') { parentToggleDepth = d; break }
      }
      if (parentToggleDepth === -1) return

      const parentPos = $pos.before(parentToggleDepth)
      const parentNode = state.doc.nodeAt(parentPos)
      const afterParentPos = parentPos + parentNode.nodeSize

      const tr = state.tr
      tr.delete(nodePos, nodePos + node.nodeSize)
      const adjustedInsertPos = afterParentPos - node.nodeSize
      tr.insert(adjustedInsertPos, node)
      editor.view.dispatch(tr)
    } catch (e) {
      console.error('내어쓰기 오류:', e)
    }
    onClose()
  }

  // 외부 클릭 시 메뉴 닫기
  useClickOutside(menuRef, onClose, true, {
    event: 'mousedown',
    ignoreSelector: '.toggle-drag-handle',
  })

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

  // 터치 디바이스 감지
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches

  // 뷰포트 밖으로 벗어나면 위치 보정
  const [adjustedPos, setAdjustedPos] = useState(position)
  useLayoutEffect(() => {
    if (isTouch || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const margin = 8
    let { top, left } = position
    if (top + rect.height > window.innerHeight - margin) {
      top = window.innerHeight - rect.height - margin
    }
    if (left + rect.width > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin
    }
    if (top < margin) top = margin
    if (left < margin) left = margin
    setAdjustedPos({ top, left })
  }, [position, isTouch])

  return (
    <div
      ref={menuRef}
      className={`block-context-menu ${isTouch ? 'block-context-menu--touch' : ''}`}
      style={isTouch ? { zIndex: 1000 } : {
        position: 'fixed',
        top: `${adjustedPos.top}px`,
        left: `${adjustedPos.left}px`,
        zIndex: 1000,
      }}
    >
      {/* 모바일 바텀시트 핸들 */}
      {isTouch && <div className="context-menu-handle"><div className="context-menu-handle-bar" /></div>}
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

      {/* 들여쓰기/내어쓰기 */}
      {(indentInfo.canIndent || indentInfo.canOutdent) && (
        <div className="context-menu-format-row">
          <button
            className={`format-button ${!indentInfo.canOutdent ? 'disabled' : ''}`}
            onClick={indentInfo.canOutdent ? handleOutdent : undefined}
            title="내어쓰기 (Shift+Tab)"
            disabled={!indentInfo.canOutdent}
          >
            ←
          </button>
          <button
            className={`format-button ${!indentInfo.canIndent ? 'disabled' : ''}`}
            onClick={indentInfo.canIndent ? handleIndent : undefined}
            title="들여쓰기 (Tab)"
            disabled={!indentInfo.canIndent}
          >
            →
          </button>
        </div>
      )}

      {/* 투두 전환 (토글 블록일 때만) */}
      {nodePos !== null && editor.state.doc.nodeAt(nodePos)?.type.name === 'toggle' && (
        <button className="context-menu-item" onClick={() => {
          const node = editor.state.doc.nodeAt(nodePos)
          if (node) {
            const newIsTodo = !node.attrs.isTodo
            const { tr } = editor.state
            tr.setNodeMarkup(nodePos, null, {
              ...node.attrs,
              isTodo: newIsTodo,
              todoChecked: newIsTodo ? node.attrs.todoChecked : false,
            })
            editor.view.dispatch(tr)
          }
          onClose()
        }}>
          <span className="context-menu-icon">
            {editor.state.doc.nodeAt(nodePos)?.attrs.isTodo ? '☑' : '☐'}
          </span>
          <span>{editor.state.doc.nodeAt(nodePos)?.attrs.isTodo ? '투두 해제' : '투두 전환'}</span>
        </button>
      )}

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
