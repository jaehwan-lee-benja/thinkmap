import React, { useState, useEffect, useRef } from 'react'
import { TableToolbar } from './components/TableToolbar'
import { BlockContextMenu } from './components/BlockContextMenu'
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { OrderedList } from '@tiptap/extension-ordered-list'
import { BulletList } from '@tiptap/extension-bullet-list'
import { ListItem } from '@tiptap/extension-list-item'
import { Table } from '@tiptap/extension-table'

// Ctrl+Z/Cmd+Z로 InputRule 취소 가능하게 하는 extension
const UndoInputRuleOnCtrlZ = Extension.create({
  name: 'undoInputRuleOnCtrlZ',

  addKeyboardShortcuts() {
    return {
      'Mod-z': ({ editor }) => {
        // undoInputRule 먼저 시도
        if (editor.can().undoInputRule()) {
          return editor.commands.undoInputRule()
        }
        // 실패하면 일반 undo
        return editor.commands.undo()
      },
    }
  },
})
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Link } from '@tiptap/extension-link'
import { Image } from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { Toggle } from './extensions/ToggleExtension'
import { ParagraphWithHandle } from './extensions/ParagraphWithHandle'
import './TipTapEditor.css'

// lowlight 인스턴스 생성 (common 언어들: js, css, html, python 등)
const lowlight = createLowlight(common)

// 열린 토글 중 하위 토글 없는 것을 닫기 (기존 데이터 정규화)
function normalizeToggleStates(json) {
  if (!json?.content) return json
  const fixNode = (node) => {
    if (node.type === 'toggle') {
      const children = node.content || []
      const fixedChildren = children.map(fixNode)
      const hasChildToggles = fixedChildren.slice(1).some(c => c.type === 'toggle')
      if (node.attrs?.isOpen && !hasChildToggles) {
        return { ...node, attrs: { ...node.attrs, isOpen: false }, content: fixedChildren }
      }
      return { ...node, content: fixedChildren }
    }
    if (node.content) {
      return { ...node, content: node.content.map(fixNode) }
    }
    return node
  }
  return { ...json, content: json.content.map(fixNode) }
}

// isOpen 속성만 다른지 확인 (구조는 동일한 경우 → 커서 보존 가능)
function isOnlyIsOpenDiff(json1, json2) {
  const strip = (obj) => JSON.stringify(obj, (key, val) => key === 'isOpen' ? undefined : val)
  return strip(json1) === strip(json2)
}

function TipTapEditor({ content, onUpdate, placeholder = '내용을 입력하세요...', editorRef }) {
  // 키보드 높이 감지 (CSS 변수 --keyboard-height 자동 설정)
  useKeyboardHeight()

  // 블록 컨텍스트 메뉴 상태 (그룹)
  const [contextMenu, setContextMenu] = useState({ visible: false, position: { top: 0, left: 0 }, nodePos: null })

  // 테이블 툴바 상태 (그룹)
  const [tableToolbar, setTableToolbar] = useState({ visible: false, position: { top: 0, left: 0 } })

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        paragraph: false, // ParagraphWithHandle로 대체
        blockquote: false, // "> " 입력 시 토글로 변환하기 위해 비활성화
        codeBlock: false, // CodeBlockLowlight 사용을 위해 비활성화
        link: false, // 별도 Link.configure() 사용을 위해 비활성화
        // 리스트는 별도로 설정 (InputRule undo 지원)
        orderedList: false,
        bulletList: false,
        listItem: false,
        // History 설정 - InputRule 변환 후 즉시 undo 가능하도록
        history: {
          depth: 100,
          newGroupDelay: 500,
        },
      }),
      // 리스트 extensions (InputRule 적용 시 undo 가능)
      OrderedList,
      BulletList,
      ListItem,
      // Ctrl+Z로 InputRule 취소 가능하게
      UndoInputRuleOnCtrlZ,
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
        openOnClick: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Image,
      Toggle,
      ParagraphWithHandle,
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
      // 복사 시 paragraph 사이에 줄바꿈 1개만 (기본값은 2개)
      clipboardTextSerializer: (slice) => {
        let text = ''
        slice.content.forEach((node, index) => {
          if (index > 0) {
            text += '\n' // paragraph 사이에 줄바꿈 1개
          }
          text += node.textContent
        })
        return text
      },
      handleDOMEvents: {
        // TipTap의 기본 드래그 이벤트 비활성화 (우리의 커스텀 드래그 사용)
        dragstart: (view, event) => {
          // drag-handle에서 시작한 드래그는 허용
          if (event.target.closest('.drag-handle')) {
            return false // TipTap이 처리하지 않음
          }
          // 다른 곳에서의 드래그는 TipTap이 처리
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
    if (editor && content) {
      const normalized = normalizeToggleStates(content)
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(normalized)) {
        // isOpen 속성만 변경된 경우(사용자 편집 중 정규화) 커서 위치 보존
        const onlyIsOpenChanged = isOnlyIsOpenDiff(editor.getJSON(), normalized)
        const { from } = editor.state.selection
        editor.commands.setContent(normalized)
        if (onlyIsOpenChanged) {
          try {
            editor.commands.setTextSelection(Math.min(from, editor.state.doc.content.size - 1))
          } catch(e) {}
        }
      }
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
            setTableToolbar({ visible: true, position: { top: tableRect.top - 40, left: tableRect.left } })
            return
          }
        }
      }
      setTableToolbar(prev => ({ ...prev, visible: false }))
    }

    const handleClickOutside = (e) => {
      const isTable = e.target.closest('table')
      const isToolbar = e.target.closest('.table-toolbar')
      if (!isTable && !isToolbar) {
        setTableToolbar(prev => ({ ...prev, visible: false }))
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setTableToolbar(prev => ({ ...prev, visible: false }))
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

  // 토글 내부 드래그 핸들 클릭 시 컨텍스트 메뉴 열기
  useEffect(() => {
    if (!editor) return

    const handleToggleContextMenu = (event) => {
      const { pos, top, left } = event.detail
      setContextMenu({ visible: true, position: { top, left }, nodePos: pos })
    }

    document.addEventListener('toggle-context-menu', handleToggleContextMenu)
    return () => document.removeEventListener('toggle-context-menu', handleToggleContextMenu)
  }, [editor])

  // 롱프레스로 컨텍스트 메뉴 열기 (터치 디바이스)
  useEffect(() => {
    if (!editor) return
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    if (!isTouch) return

    let longPressTimer = null
    let touchStartPos = null

    const handleTouchStart = (e) => {
      const target = e.target
      // 에디터 내부에서만 작동
      if (!target.closest('.tiptap-editor')) return

      touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }

      longPressTimer = setTimeout(() => {
        // 노드 위치 찾기
        const pos = editor.view.posAtCoords({ left: touchStartPos.x, top: touchStartPos.y })
        if (pos) {
          // 가장 가까운 블록 노드 찾기
          const $pos = editor.state.doc.resolve(pos.pos)
          let nodePos = $pos.before($pos.depth)
          setContextMenu({
            visible: true,
            position: { top: touchStartPos.y, left: touchStartPos.x },
            nodePos
          })
          // 기본 컨텍스트 메뉴 방지
          e.preventDefault()
        }
      }, 600)
    }

    const handleTouchMove = (e) => {
      if (!touchStartPos || !longPressTimer) return
      const dx = Math.abs(e.touches[0].clientX - touchStartPos.x)
      const dy = Math.abs(e.touches[0].clientY - touchStartPos.y)
      // 10px 이상 이동하면 롱프레스 취소
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    const handleTouchEnd = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    const editorDom = editor.view.dom
    editorDom.addEventListener('touchstart', handleTouchStart, { passive: false })
    editorDom.addEventListener('touchmove', handleTouchMove, { passive: true })
    editorDom.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      editorDom.removeEventListener('touchstart', handleTouchStart)
      editorDom.removeEventListener('touchmove', handleTouchMove)
      editorDom.removeEventListener('touchend', handleTouchEnd)
      if (longPressTimer) clearTimeout(longPressTimer)
    }
  }, [editor])

  if (!editor) {
    return <div>에디터 로딩 중...</div>
  }

  return (
    <div className="tiptap-wrapper">
      <EditorContent editor={editor} />

      {/* 테이블 툴바 */}
      {tableToolbar.visible && editor && (
        <TableToolbar
          editor={editor}
          position={tableToolbar.position}
          onClose={() => setTableToolbar(prev => ({ ...prev, visible: false }))}
        />
      )}

      {/* 블록 컨텍스트 메뉴 */}
      {contextMenu.visible && editor && (
        <BlockContextMenu
          editor={editor}
          position={contextMenu.position}
          nodePos={contextMenu.nodePos}
          onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
        />
      )}
    </div>
  )
}

export default TipTapEditor
