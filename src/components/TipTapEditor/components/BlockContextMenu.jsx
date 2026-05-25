import React, { useState, useRef, useLayoutEffect } from 'react'
import { useClickOutside } from '../../../hooks/useClickOutside'
import { usePageContext } from '../../../contexts/PageContext'
import { supabase } from '../../../supabaseClient'
import { COLORS, BG_COLORS } from './ColorPicker'
import { AttrStep } from '@tiptap/pm/transform'

export function BlockContextMenu({ editor, position, nodePos, onClose }) {
  const pageContext = usePageContext()
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showBgColorPicker, setShowBgColorPicker] = useState(false)
  const menuRef = useRef(null)
  const imageInputRef = useRef(null)

  // daily 페이지 h2 섹션 카드는 전용 "카드 색상" 버튼으로 색을 입힘 →
  // 여기 색면 채우기(블록 배경색)는 중복/혼선이라 숨김.
  const isDailySectionCard = (() => {
    try {
      if (nodePos === null) return false
      const node = editor.state.doc.nodeAt(nodePos)
      return node?.attrs?.blockType === 'h2' && !!editor.storage.toggle?.isDailyPage
    } catch { return false }
  })()

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

  // 뷰포트 밖으로 벗어나면 위치 보정
  const [adjustedPos, setAdjustedPos] = useState(position)
  useLayoutEffect(() => {
    if (!menuRef.current) return
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
  }, [position])

  return (
    <div
      ref={menuRef}
      className="block-context-menu"
      style={{
        position: 'fixed',
        top: `${adjustedPos.top}px`,
        left: `${adjustedPos.left}px`,
        zIndex: 1000,
      }}
    >
      {/* 텍스트 서식 */}
      {/* 텍스트 서식 버튼 */}
      <div className="context-menu-format-row">
        <button
          onClick={() => { setShowColorPicker(!showColorPicker); setShowBgColorPicker(false) }}
          className={`format-button ${showColorPicker ? 'is-active' : ''}`}
          title="글씨 색상"
        >
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14,
            color: editor.getAttributes('textStyle').color || '#e5e7eb',
            borderBottom: `2px solid ${editor.getAttributes('textStyle').color || '#e5e7eb'}`,
            lineHeight: 1,
          }}>A</span>
        </button>
        <button
          onClick={() => { setShowBgColorPicker(!showBgColorPicker); setShowColorPicker(false) }}
          className={`format-button ${showBgColorPicker ? 'is-active' : ''}`}
          title="블록 배경색"
          style={{ display: isDailySectionCard ? 'none' : undefined }}
        >
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13,
            lineHeight: 1,
            background: (nodePos !== null && editor.state.doc.nodeAt(nodePos)?.attrs.backgroundColor) || '#e5e7eb',
            borderRadius: 3,
            padding: '1px 4px',
          }}>A</span>
        </button>
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

      {/* 글씨 색상 선택기 */}
      {showColorPicker && (
        <div className="color-picker-section">
          <div className="color-picker-label">글씨 색상</div>
          <div className="color-picker-grid">
            {COLORS.map(c => (
              <button
                key={c.name}
                className={`color-picker-swatch ${editor.getAttributes('textStyle').color === c.value ? 'is-active' : ''}`}
                title={c.name}
                onClick={() => {
                  if (nodePos !== null) {
                    const node = editor.state.doc.nodeAt(nodePos)
                    if (node) {
                      editor.chain().focus()
                        .setTextSelection({ from: nodePos + 1, to: nodePos + node.nodeSize - 1 })
                        [c.value ? 'setColor' : 'unsetColor'](c.value || undefined)
                        .run()
                    }
                  } else {
                    if (c.value) editor.chain().focus().setColor(c.value).run()
                    else editor.chain().focus().unsetColor().run()
                  }
                  setShowColorPicker(false)
                }}
              >
                <span className="color-picker-dot" style={{ background: c.value || '#e5e7eb' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 블록 배경색 선택기 */}
      {showBgColorPicker && nodePos !== null && (
        <div className="color-picker-section">
          <div className="color-picker-label">배경 색상</div>
          <div className="color-picker-grid">
            {BG_COLORS.map(c => {
              const currentBg = editor.state.doc.nodeAt(nodePos)?.attrs.backgroundColor || null
              return (
                <button
                  key={c.name}
                  className={`color-picker-swatch ${currentBg === c.value ? 'is-active' : ''}`}
                  title={c.name}
                  onClick={() => {
                    const node = editor.state.doc.nodeAt(nodePos)
                    if (node) {
                      try {
                        const { tr } = editor.state
                        tr.step(new AttrStep(nodePos, 'backgroundColor', c.value))
                        editor.view.dispatch(tr)
                      } catch (e) {
                        try {
                          const json = node.toJSON()
                          json.attrs = { ...json.attrs, backgroundColor: c.value }
                          const newNode = editor.state.schema.nodeFromJSON(json)
                          const { tr: tr2 } = editor.state
                          tr2.replaceWith(nodePos, nodePos + node.nodeSize, newNode)
                          editor.view.dispatch(tr2)
                        } catch (e2) {
                          console.error('[BG] 배경색 설정 실패:', e2.message)
                        }
                      }
                    }
                    setShowBgColorPicker(false)
                  }}
                >
                  <span className="color-picker-dot" style={{
                    background: c.value || '#e5e7eb',
                    border: c.value ? 'none' : '1px dashed #9ca3af',
                  }} />
                </button>
              )
            })}
          </div>
        </div>
      )}

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

      {/* 페이지 전환 (토글 블록일 때만) */}
      {nodePos !== null && editor.state.doc.nodeAt(nodePos)?.type.name === 'toggle' && pageContext && (() => {
        const targetNode = editor.state.doc.nodeAt(nodePos)
        const isPageBlock = targetNode?.attrs.blockType === 'page' && targetNode?.attrs.pageId
        return (
          <>
            <div className="context-menu-separator"></div>
            {isPageBlock ? (
              <button className="context-menu-item" onClick={async () => {
                const node = editor.state.doc.nodeAt(nodePos)
                if (!node) { onClose(); return }

                const linkedPageId = node.attrs.pageId

                // 1) attrs를 먼저 동기적으로 텍스트로 전환 + 열기
                {
                  const { tr } = editor.state
                  tr.setNodeMarkup(nodePos, null, {
                    ...node.attrs,
                    blockType: 'paragraph',
                    pageId: null,
                    isOpen: true,
                  })
                  editor.view.dispatch(tr)
                }

                // 2) 연결된 페이지의 콘텐츠를 가져와서 하위 토글로 삽입
                if (linkedPageId) {
                  try {
                    const { data } = await supabase
                      .from('pages')
                      .select('content_tiptap')
                      .eq('id', linkedPageId)
                      .single()

                    const pageContent = data?.content_tiptap
                    if (pageContent?.content?.length > 0) {
                      // 현재 블록 위치를 다시 찾기 (async 후 state 변경 가능)
                      const currentNode = editor.state.doc.nodeAt(nodePos)
                      if (currentNode && currentNode.type.name === 'toggle') {
                        const { tr } = editor.state
                        const insertPos = nodePos + currentNode.nodeSize - 1
                        const toggles = pageContent.content
                          .filter(n => n.type === 'toggle')
                          .map(n => editor.state.schema.nodeFromJSON(n))
                        if (toggles.length > 0) {
                          for (let i = toggles.length - 1; i >= 0; i--) {
                            tr.insert(insertPos, toggles[i])
                          }
                          editor.view.dispatch(tr)
                        }
                      }
                    }
                  } catch (e) {
                    console.error('페이지 콘텐츠 불러오기 오류:', e)
                  }
                }

                onClose()
              }}>
                <span className="context-menu-icon">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="5" x2="14" y2="5" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="11" x2="10" y2="11" />
                  </svg>
                </span>
                <span>텍스트로 전환</span>
              </button>
            ) : (
              <button className="context-menu-item" onClick={async () => {
                const node = editor.state.doc.nodeAt(nodePos)
                if (!node) { onClose(); return }

                // 1) 동기적으로 블록 정보 수집
                const firstChild = node.content.firstChild
                const pageTitle = firstChild?.textContent?.trim() || '새 페이지'
                const childToggles = []
                for (let i = 1; i < node.content.childCount; i++) {
                  const child = node.content.child(i)
                  if (child.type.name === 'toggle') {
                    childToggles.push(child.toJSON())
                  }
                }

                // 2) 에디터 변경을 동기적으로 먼저 수행 (async 전에 nodePos가 유효한 시점)
                {
                  const { tr } = editor.state
                  if (childToggles.length > 0) {
                    const firstChildSize = node.content.firstChild.nodeSize
                    const contentStart = nodePos + 1
                    const keepEnd = contentStart + firstChildSize
                    const contentEnd = nodePos + node.nodeSize - 1
                    if (keepEnd < contentEnd) {
                      tr.delete(keepEnd, contentEnd)
                    }
                  }
                  const mappedPos = tr.mapping.map(nodePos)
                  tr.setNodeMarkup(mappedPos, null, {
                    ...node.attrs,
                    blockType: 'page',
                    pageId: '__pending__',
                    isOpen: false,
                    isTodo: false,
                    todoChecked: false,
                  })
                  editor.view.dispatch(tr)
                }

                // 3) 비동기: 페이지 생성
                const newPage = await pageContext.createPage(pageTitle, pageContext.currentPageId)

                // 4) 생성 후 __pending__ → 실제 pageId 업데이트
                if (newPage) {
                  let pendingPos = null
                  editor.state.doc.descendants((n, pos) => {
                    if (pendingPos !== null) return false
                    if (n.type.name === 'toggle' && n.attrs.pageId === '__pending__') {
                      pendingPos = pos
                      return false
                    }
                  })
                  if (pendingPos !== null) {
                    const pendingNode = editor.state.doc.nodeAt(pendingPos)
                    if (pendingNode) {
                      const { tr } = editor.state
                      tr.setNodeMarkup(pendingPos, null, { ...pendingNode.attrs, pageId: newPage.id })
                      editor.view.dispatch(tr)
                    }
                  }
                  if (childToggles.length > 0) {
                    supabase
                      .from('pages')
                      .update({ content_tiptap: { type: 'doc', content: childToggles } })
                      .eq('id', newPage.id)
                  }
                }

                onClose()
              }}>
                <span className="context-menu-icon">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 1.5H4a1.5 1.5 0 00-1.5 1.5v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V6L9 1.5z" />
                    <polyline points="9 1.5 9 6 13.5 6" />
                  </svg>
                </span>
                <span>페이지로 전환</span>
              </button>
            )}
          </>
        )
      })()}
    </div>
  )
}
