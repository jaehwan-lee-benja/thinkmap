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

  // 드래그 핸들 구현 (React에서 직접 관리)
  React.useEffect(() => {
    if (!editor) return

    const dragHandleElement = document.createElement('div')
    dragHandleElement.className = 'drag-handle'
    dragHandleElement.contentEditable = 'false'
    dragHandleElement.draggable = true
    dragHandleElement.innerHTML = `
      <svg class="drag-handle-icon" viewBox="0 0 10 16" width="10" height="16">
        <circle cx="2" cy="2" r="1.5" fill="currentColor" />
        <circle cx="2" cy="8" r="1.5" fill="currentColor" />
        <circle cx="2" cy="14" r="1.5" fill="currentColor" />
        <circle cx="8" cy="2" r="1.5" fill="currentColor" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" />
        <circle cx="8" cy="14" r="1.5" fill="currentColor" />
      </svg>
    `

    // .tiptap-wrapper 찾기 (React가 이미 렌더링한 상태)
    const wrapper = document.querySelector('.tiptap-wrapper')
    if (!wrapper) {
      console.error('❌ .tiptap-wrapper not found in DOM')
      return
    }

    wrapper.style.position = 'relative'
    wrapper.appendChild(dragHandleElement)
    console.log('✅ DragHandle added to wrapper')

    let currentNode = null
    let currentPos = null
    let draggedNodePos = null
    let draggedNode = null
    let isDragging = false

    // 마우스 이동 시 핸들 위치 업데이트
    const updateHandlePosition = (event) => {
      // 드래그 중에는 핸들 위치 업데이트 중지
      if (isDragging) {
        return
      }

      // 마우스가 핸들 위에 있으면 현재 상태 유지
      if (event.target === dragHandleElement || dragHandleElement.contains(event.target)) {
        return
      }

      const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!pos) {
        // 위치를 찾지 못해도 숨기지 않음 (mouseleave에서만 숨김)
        return
      }

      const $pos = editor.state.doc.resolve(pos.pos)
      let node = $pos.parent
      let nodePos = $pos.start($pos.depth) - 1

      if (node.type.name === 'doc' || !node.isBlock) {
        let depth = $pos.depth - 1
        while (depth > 0) {
          const currentNode = $pos.node(depth)
          if (currentNode.isBlock && currentNode.type.name !== 'doc') {
            node = currentNode
            nodePos = $pos.start(depth) - 1
            break
          }
          depth--
        }
      }

      if (!node || node.type.name === 'doc') {
        // 블록을 찾지 못해도 숨기지 않음
        return
      }

      try {
        const domAtPos = editor.view.domAtPos(nodePos + 1)
        let domNode = domAtPos.node

        if (domNode.nodeType === Node.TEXT_NODE) {
          domNode = domNode.parentElement
        }

        while (domNode && domNode !== editor.view.dom) {
          if (domNode instanceof HTMLElement &&
              (domNode.nodeName === 'P' ||
               domNode.nodeName.startsWith('H') ||
               domNode.classList.contains('toggle-block') ||
               domNode.classList.contains('tableWrapper'))) {
            break
          }
          domNode = domNode.parentElement
        }

        if (domNode && domNode instanceof HTMLElement && domNode !== editor.view.dom) {
          const rect = domNode.getBoundingClientRect()
          const wrapperRect = wrapper.getBoundingClientRect()

          dragHandleElement.style.display = 'flex'
          dragHandleElement.style.top = `${rect.top - wrapperRect.top + rect.height / 2 - 16}px`
          dragHandleElement.style.left = '4px'

          currentNode = node
          currentPos = nodePos
        }
      } catch (error) {
        console.error('DragHandle position error:', error)
      }
    }

    // 이벤트 리스너
    wrapper.addEventListener('mousemove', updateHandlePosition)

    let hideTimeout = null
    wrapper.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(() => {
        if (!isDragging) {
          dragHandleElement.style.display = 'none'
        }
      }, 500)
    })

    dragHandleElement.addEventListener('mouseenter', () => {
      if (hideTimeout) clearTimeout(hideTimeout)
      dragHandleElement.style.display = 'flex'
    })

    dragHandleElement.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(() => {
        if (!isDragging) {
          dragHandleElement.style.display = 'none'
        }
      }, 500)
    })

    // 드래그 시작
    dragHandleElement.addEventListener('dragstart', (event) => {
      console.log('🎬 dragstart', { currentPos, currentNode: currentNode?.type.name })
      if (currentPos !== null && currentNode !== null) {
        isDragging = true
        draggedNodePos = currentPos
        draggedNode = currentNode
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/html', currentNode.textContent || 'block')

        // 드래그 중 보이는 이미지 설정 (투명 이미지로 설정)
        const dragImage = document.createElement('div')
        dragImage.style.position = 'absolute'
        dragImage.style.top = '-1000px'
        dragImage.textContent = '📦 Moving block...'
        dragImage.style.padding = '8px 12px'
        dragImage.style.background = '#1f2937'
        dragImage.style.color = 'white'
        dragImage.style.borderRadius = '4px'
        document.body.appendChild(dragImage)
        event.dataTransfer.setDragImage(dragImage, 0, 0)
        setTimeout(() => document.body.removeChild(dragImage), 0)

        dragHandleElement.classList.add('dragging')
        console.log('✅ Drag started:', { draggedNodePos, draggedNode: draggedNode.type.name })
      } else {
        console.error('❌ No currentNode/currentPos')
      }
    })

    dragHandleElement.addEventListener('dragend', () => {
      console.log('🏁 dragend')
      isDragging = false
      dragHandleElement.classList.remove('dragging')
      // 드래그 종료 후 핸들 숨기기
      dragHandleElement.style.display = 'none'
      draggedNodePos = null
      draggedNode = null
    })

    const handleDragOver = (event) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      console.log('📍 dragover at', event.clientX, event.clientY)
    }

    const handleDrop = (event) => {
      event.preventDefault()
      console.log('📦 drop event')

      if (draggedNodePos === null || draggedNode === null) {
        console.error('❌ No draggedNode')
        return
      }

      const dropPos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      console.log('📍 dropPos:', dropPos)
      if (!dropPos) {
        console.error('❌ Cannot find drop position')
        return
      }

      if (Math.abs(dropPos.pos - draggedNodePos) < 5) {
        console.log('⏭️ Same position, skipping')
        return
      }

      try {
        const { tr, doc } = editor.state
        const draggedNodeSize = draggedNode.nodeSize

        console.log('🔄 Moving:', {
          from: draggedNodePos,
          to: dropPos.pos,
          size: draggedNodeSize,
          docSize: doc.content.size
        })

        // 먼저 삭제
        const deleteFrom = draggedNodePos
        const deleteTo = draggedNodePos + draggedNodeSize
        tr.delete(deleteFrom, deleteTo)

        // 삭제 후 위치 재계산
        let insertPos = dropPos.pos
        if (dropPos.pos > draggedNodePos) {
          insertPos = dropPos.pos - draggedNodeSize
        }

        console.log('📌 Insert position:', insertPos)

        // 삽입
        tr.insert(insertPos, draggedNode)

        // transaction 적용
        editor.view.dispatch(tr)
        console.log('✅ Block moved successfully')
      } catch (error) {
        console.error('❌ Drag and drop error:', error)
      }

      draggedNodePos = null
      draggedNode = null
    }

    // editor.view.dom과 wrapper 둘 다에 이벤트 추가 (더 넓은 drop 영역)
    editor.view.dom.addEventListener('dragover', handleDragOver)
    editor.view.dom.addEventListener('drop', handleDrop)
    wrapper.addEventListener('dragover', handleDragOver)
    wrapper.addEventListener('drop', handleDrop)

    // cleanup
    return () => {
      wrapper.removeEventListener('mousemove', updateHandlePosition)
      editor.view.dom.removeEventListener('dragover', handleDragOver)
      editor.view.dom.removeEventListener('drop', handleDrop)
      wrapper.removeEventListener('dragover', handleDragOver)
      wrapper.removeEventListener('drop', handleDrop)
      if (dragHandleElement.parentElement) {
        dragHandleElement.parentElement.removeChild(dragHandleElement)
      }
    }
  }, [editor])

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
