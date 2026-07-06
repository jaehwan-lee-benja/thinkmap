import React, { useState, useRef, useLayoutEffect } from 'react'
import { NodeSelection } from '@tiptap/pm/state'
import { useClickOutside, supabase } from '@thinkmap/core'
import { usePageContext } from '../../../contexts/PageContext'
import { COLORS, BG_COLORS } from './ColorPicker'
import { AttrStep } from '@tiptap/pm/transform'

export function BlockContextMenu({ editor, position, nodePos, anchorRect, onClose }) {
  const pageContext = usePageContext()
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showBgColorPicker, setShowBgColorPicker] = useState(false)
  // 자주 안 쓰는 항목(기울임/취소선/인라인코드/이미지/링크/코드블록/페이지전환)은 '더보기'로 접는다.
  const [showMore, setShowMore] = useState(false)
  // 들여쓰기/내어쓰기를 메뉴를 닫지 않고 연속으로 누를 수 있도록, 이동 후 새 위치를 추적한다.
  const [posOverride, setPosOverride] = useState(null)
  // posOverride 가 더 이상 토글을 가리키지 않으면(외부 문서 변경/Realtime 동기화 등) nodePos 로 안전 폴백.
  const pos = (() => {
    if (posOverride === null) return nodePos
    try {
      const n = editor.state.doc.nodeAt(posOverride)
      if (n && n.type.name === 'toggle') return posOverride
    } catch (e) {}
    return nodePos
  })()
  const menuRef = useRef(null)
  const imageInputRef = useRef(null)

  // daily 페이지 h2 섹션 카드는 전용 "카드 색상" 버튼으로 색을 입힘 →
  // 여기 색면 채우기(블록 배경색)는 중복/혼선이라 숨김.
  const isDailySectionCard = (() => {
    try {
      if (pos === null) return false
      const node = editor.state.doc.nodeAt(pos)
      return node?.attrs?.blockType === 'h2' && !!editor.storage.toggle?.isDailyPage
    } catch { return false }
  })()

  // 들여쓰기/내어쓰기 가능 여부 계산
  const indentInfo = (() => {
    try {
      if (pos === null || pos >= editor.state.doc.content.size) return { canIndent: false, canOutdent: false }
      const node = editor.state.doc.nodeAt(pos)
      if (!node || node.type.name !== 'toggle') return { canIndent: false, canOutdent: false }

      const $pos = editor.state.doc.resolve(pos)
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

  // 들여쓰기/내어쓰기 후, 메뉴를 닫지 않고 이동한 블록을 계속 선택 상태로 두어 연속 조작을 가능하게 한다.
  // newPos 가 토글을 가리키지 않으면 override 를 버려(null) nodePos 로 폴백 — 잘못된 위치를 들고가지 않는다.
  const reselect = (newPos) => {
    try {
      if (newPos < 0 || newPos >= editor.state.doc.content.size) throw new Error('out of range')
      const node = editor.state.doc.nodeAt(newPos)
      if (!node || node.type.name !== 'toggle') throw new Error('not a toggle')
      const sel = NodeSelection.create(editor.state.doc, newPos)
      editor.view.dispatch(editor.state.tr.setSelection(sel))
      setPosOverride(newPos)
    } catch (e) {
      setPosOverride(null)
    }
  }

  const handleIndent = () => {
    try {
      if (pos === null) return
      const { state } = editor
      const node = state.doc.nodeAt(pos)
      if (!node) return

      const $pos = state.doc.resolve(pos)
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
      const mappedPos = tr.mapping.map(pos)
      tr.delete(mappedPos, mappedPos + node.nodeSize)
      editor.view.dispatch(tr)
      // 이동한 블록의 새 위치(= 삽입 지점) 를 추적해 메뉴 유지 + 연속 들여쓰기 허용
      reselect(insertPos)
    } catch (e) {
      console.error('들여쓰기 오류:', e)
    }
  }

  const handleOutdent = () => {
    try {
      if (pos === null) return
      const { state } = editor
      const node = state.doc.nodeAt(pos)
      if (!node) return

      const $pos = state.doc.resolve(pos)
      let parentToggleDepth = -1
      for (let d = $pos.depth - 1; d > 0; d--) {
        if ($pos.node(d).type.name === 'toggle') { parentToggleDepth = d; break }
      }
      if (parentToggleDepth === -1) return

      const parentPos = $pos.before(parentToggleDepth)
      const parentNode = state.doc.nodeAt(parentPos)
      const afterParentPos = parentPos + parentNode.nodeSize

      const tr = state.tr
      tr.delete(pos, pos + node.nodeSize)
      const adjustedInsertPos = afterParentPos - node.nodeSize
      tr.insert(adjustedInsertPos, node)
      editor.view.dispatch(tr)
      // 이동한 블록의 새 위치를 추적해 메뉴 유지 + 연속 내어쓰기 허용
      reselect(adjustedInsertPos)
    } catch (e) {
      console.error('내어쓰기 오류:', e)
    }
  }

  // 외부 클릭 시 메뉴 닫기
  useClickOutside(menuRef, onClose, true, {
    event: 'mousedown',
    ignoreSelector: '.toggle-drag-handle',
  })

  const handleDeleteBlock = () => {
    if (pos === null) return
    try {
      const node = editor.state.doc.nodeAt(pos)
      if (node) {
        editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
      }
    } catch (error) {
      console.error('블록 삭제 오류:', error)
    }
    onClose()
  }

  const handleDuplicateBlock = () => {
    if (pos === null) return
    try {
      const node = editor.state.doc.nodeAt(pos)
      if (node) {
        editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run()
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

  // 블록 전체에 인라인 마크(굵게/기울임/취소선/코드)를 적용 — 텍스트를 긁지 않아도 핸들 메뉴에서 바로.
  const applyMarkToBlock = (markName) => {
    if (pos === null) return
    try {
      const node = editor.state.doc.nodeAt(pos)
      if (!node) return
      editor.chain().focus()
        .setTextSelection({ from: pos + 1, to: pos + node.nodeSize - 1 })
        .toggleMark(markName)
        .run()
    } catch (e) {
      console.error('서식 적용 오류:', e)
    }
  }

  // 뷰포트 밖으로 벗어나면 위치 보정.
  // [가림 방지] anchorRect(대상 블록의 화면 사각형) 가 있으면 메뉴를 블록 "아래"에 두되,
  // 아래 공간이 부족하면 블록 "위"로 flip 한다 → 메뉴가 대상 블록을 덮지 않는다.
  const [adjustedPos, setAdjustedPos] = useState(position)
  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const margin = 8
    const gap = 6
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top, left
    if (anchorRect) {
      // 기본: 블록 아래, 좌측 정렬
      left = anchorRect.left
      top = anchorRect.bottom + gap
      // 아래로 넘치면 블록 위로 flip
      if (top + rect.height > vh - margin) {
        const above = anchorRect.top - rect.height - gap
        if (above >= margin) {
          top = above
        } else {
          // 위·아래 모두 부족(블록이 화면보다 큼) → 화면 안에서 최대한 아래
          top = Math.max(margin, vh - rect.height - margin)
        }
      }
    } else {
      // anchorRect 없으면 기존 좌표 기반
      top = position.top
      left = position.left
      if (top + rect.height > vh - margin) top = vh - rect.height - margin
    }

    // 좌우 클램프
    if (left + rect.width > vw - margin) left = vw - rect.width - margin
    if (left < margin) left = margin
    if (top < margin) top = margin
    setAdjustedPos({ top, left })
    // showMore/showColorPicker 등으로 메뉴 높이가 바뀌면 재계산
  }, [position, anchorRect, showMore, showColorPicker, showBgColorPicker, showImageInput, showLinkInput])

  const targetNode = pos !== null ? editor.state.doc.nodeAt(pos) : null
  const isToggle = targetNode?.type.name === 'toggle'

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
      {/* ===== 1차: 자주 쓰는 항목 ===== */}

      {/* 서식: 색 위주(글씨색·배경색) + 굵게. 나머지 인라인(I/S/코드)은 더보기로. */}
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
            background: (pos !== null && editor.state.doc.nodeAt(pos)?.attrs.backgroundColor) || '#e5e7eb',
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
                  if (pos !== null) {
                    const node = editor.state.doc.nodeAt(pos)
                    if (node) {
                      editor.chain().focus()
                        .setTextSelection({ from: pos + 1, to: pos + node.nodeSize - 1 })
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
      {showBgColorPicker && pos !== null && (
        <div className="color-picker-section">
          <div className="color-picker-label">배경 색상</div>
          <div className="color-picker-grid">
            {BG_COLORS.map(c => {
              const currentBg = editor.state.doc.nodeAt(pos)?.attrs.backgroundColor || null
              return (
                <button
                  key={c.name}
                  className={`color-picker-swatch ${currentBg === c.value ? 'is-active' : ''}`}
                  title={c.name}
                  onClick={() => {
                    const node = editor.state.doc.nodeAt(pos)
                    if (node) {
                      try {
                        const { tr } = editor.state
                        tr.step(new AttrStep(pos, 'backgroundColor', c.value))
                        editor.view.dispatch(tr)
                      } catch (e) {
                        try {
                          const json = node.toJSON()
                          json.attrs = { ...json.attrs, backgroundColor: c.value }
                          const newNode = editor.state.schema.nodeFromJSON(json)
                          const { tr: tr2 } = editor.state
                          tr2.replaceWith(pos, pos + node.nodeSize, newNode)
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

      {/* 들여쓰기/내어쓰기 — 크게(라벨) + 메뉴 닫지 않고 연속 조작. 둘 다 노출하고 불가한 쪽은 비활성. */}
      {(indentInfo.canIndent || indentInfo.canOutdent) && (
        <div className="context-menu-indent-row">
          <button
            className="context-menu-indent-button"
            onClick={handleOutdent}
            title="내어쓰기 (Shift+Tab)"
            disabled={!indentInfo.canOutdent}
          >
            <span className="context-menu-icon">←</span>
            <span>내어쓰기</span>
          </button>
          <button
            className="context-menu-indent-button"
            onClick={handleIndent}
            title="들여쓰기 (Tab)"
            disabled={!indentInfo.canIndent}
          >
            <span className="context-menu-icon">→</span>
            <span>들여쓰기</span>
          </button>
        </div>
      )}

      {/* 투두 전환 (토글 블록일 때만) */}
      {isToggle && (
        <button className="context-menu-item" onClick={() => {
          const node = editor.state.doc.nodeAt(pos)
          if (node) {
            const newIsTodo = !node.attrs.isTodo
            const { tr } = editor.state
            tr.setNodeMarkup(pos, null, {
              ...node.attrs,
              isTodo: newIsTodo,
              todoChecked: newIsTodo ? node.attrs.todoChecked : false,
            })
            editor.view.dispatch(tr)
          }
          onClose()
        }}>
          <span className="context-menu-icon">
            {targetNode?.attrs.isTodo ? '☑' : '☐'}
          </span>
          <span>{targetNode?.attrs.isTodo ? '투두 해제' : '투두 전환'}</span>
        </button>
      )}

      {/* 삭제 / 복제 */}
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

      {/* ===== 더보기 토글 ===== */}
      <div className="context-menu-separator"></div>
      <button
        className="context-menu-item context-menu-more-toggle"
        onClick={() => setShowMore(v => !v)}
      >
        <span className="context-menu-icon">{showMore ? '▾' : '▸'}</span>
        <span>{showMore ? '간단히' : '더보기'}</span>
      </button>

      {showMore && (
        <>
          {/* 인라인 서식 나머지: 기울임 / 취소선 / 인라인 코드 (블록 전체에 적용) */}
          <div className="context-menu-format-row">
            <button
              onClick={() => applyMarkToBlock('italic')}
              className={editor.isActive('italic') ? 'format-button is-active' : 'format-button'}
              title="Italic"
            >
              <em>I</em>
            </button>
            <button
              onClick={() => applyMarkToBlock('strike')}
              className={editor.isActive('strike') ? 'format-button is-active' : 'format-button'}
              title="Strikethrough"
            >
              <s>S</s>
            </button>
            <button
              onClick={() => applyMarkToBlock('code')}
              className={editor.isActive('code') ? 'format-button is-active' : 'format-button'}
              title="Code"
            >
              {'</>'}
            </button>
          </div>

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
          {isToggle && pageContext && (() => {
            const isPageBlock = targetNode?.attrs.blockType === 'page' && targetNode?.attrs.pageId
            return (
              <>
                <div className="context-menu-separator"></div>
                {isPageBlock ? (
                  <button className="context-menu-item" onClick={async () => {
                    const node = editor.state.doc.nodeAt(pos)
                    if (!node) { onClose(); return }

                    const linkedPageId = node.attrs.pageId

                    // 1) attrs를 먼저 동기적으로 텍스트로 전환 + 열기
                    {
                      const { tr } = editor.state
                      tr.setNodeMarkup(pos, null, {
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
                          const currentNode = editor.state.doc.nodeAt(pos)
                          if (currentNode && currentNode.type.name === 'toggle') {
                            const { tr } = editor.state
                            const insertPos = pos + currentNode.nodeSize - 1
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
                    const node = editor.state.doc.nodeAt(pos)
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

                    // 2) 에디터 변경을 동기적으로 먼저 수행 (async 전에 pos가 유효한 시점)
                    {
                      const { tr } = editor.state
                      if (childToggles.length > 0) {
                        const firstChildSize = node.content.firstChild.nodeSize
                        const contentStart = pos + 1
                        const keepEnd = contentStart + firstChildSize
                        const contentEnd = pos + node.nodeSize - 1
                        if (keepEnd < contentEnd) {
                          tr.delete(keepEnd, contentEnd)
                        }
                      }
                      const mappedPos = tr.mapping.map(pos)
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
                      editor.state.doc.descendants((n, p) => {
                        if (pendingPos !== null) return false
                        if (n.type.name === 'toggle' && n.attrs.pageId === '__pending__') {
                          pendingPos = p
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
        </>
      )}
    </div>
  )
}
