import React, { useState, useEffect, useRef } from 'react'
import { TableToolbar } from './components/TableToolbar'
import { BlockContextMenu } from './components/BlockContextMenu'
import { MultiSelectToolbar } from './components/MultiSelectToolbar'
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight'
import { usePageContext } from '../../contexts/PageContext'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { OrderedList } from '@tiptap/extension-ordered-list'
import { BulletList } from '@tiptap/extension-bullet-list'
import { ListItem } from '@tiptap/extension-list-item'
import { FoldableTable } from './extensions/FoldableTable'

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

// 테이블 셀 기본 콘텐츠를 토글 블록으로 변경
const CustomTableCell = TableCell.extend({
  content: '(toggle | block)+',
})
const CustomTableHeader = TableHeader.extend({
  content: '(toggle | block)+',
})
import { Placeholder } from '@tiptap/extension-placeholder'
import { Link } from '@tiptap/extension-link'
import { Image } from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Toggle, multiSelectPluginKey, focusHighlightPluginKey } from './extensions/ToggleExtension'
import { ParagraphWithHandle } from './extensions/ParagraphWithHandle'
import { ColorPicker, COLORS } from './components/ColorPicker'
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

// 뷰어 모드 플러그인: 토글 isOpen 변경만 허용, 나머지 편집 차단
function createViewerModePlugin(onEditAttempt) {
  return new Plugin({
    filterTransaction: (tr, state) => {
      // 문서 변경이 없으면 허용 (선택, 스크롤 등)
      if (!tr.docChanged) return true

      // toggleButtonClick 메타가 있으면 허용 (토글 열기/닫기)
      if (tr.getMeta('toggleButtonClick')) return true

      // 그 외 편집 시도 → 차단 + 토스트
      if (onEditAttempt) onEditAttempt()
      return false
    },
  })
}

const ViewerModeExtension = Extension.create({
  name: 'viewerMode',

  addOptions() {
    return { onEditAttempt: null }
  },

  addProseMirrorPlugins() {
    return [createViewerModePlugin(this.options.onEditAttempt)]
  },
})

function TipTapEditor({ content, onUpdate, placeholder = '내용을 입력하세요...', editorRef, isViewerMode = false, onViewerEditAttempt }) {
  // 키보드 높이 감지 (CSS 변수 --keyboard-height 자동 설정)
  useKeyboardHeight()
  const pageContext = usePageContext()

  // 버블 메뉴 색상 선택기 열기/닫기
  const [bubbleColorOpen, setBubbleColorOpen] = useState(false)

  // 블록 컨텍스트 메뉴 상태 (그룹)
  const [contextMenu, setContextMenu] = useState({ visible: false, position: { top: 0, left: 0 }, nodePos: null })

  // 테이블 툴바 상태 (그룹)
  const [tableToolbar, setTableToolbar] = useState({ visible: false, position: { top: 0, left: 0 } })

  // 멀티셀렉트 상태
  const [multiSelectCount, setMultiSelectCount] = useState(0)

  // 래퍼 ref (이벤트 스코프 제한용)
  const wrapperRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        paragraph: false, // ParagraphWithHandle로 대체
        blockquote: false, // "> " 입력 시 토글로 변환하기 위해 비활성화
        codeBlock: false, // CodeBlockLowlight 사용을 위해 비활성화
        horizontalRule: false, // 토글 블록 내에서 --- 입력 시 토글 깨짐 방지
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
      FoldableTable.configure({
        resizable: true,
      }),
      TableRow,
      CustomTableCell,
      CustomTableHeader,
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
      TextStyle,
      Color,
      Toggle,
      ParagraphWithHandle,
      ...(isViewerMode ? [ViewerModeExtension.configure({ onEditAttempt: onViewerEditAttempt })] : []),
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
      // 붙여넣기: 토글 안에서 여러 줄 텍스트 → 각 줄을 토글 블록으로 생성
      // (토글 블록 복사/붙여넣기는 ToggleExtension의 transformCopied/transformPasted가 처리)
      handlePaste: (view, event) => {
        const { state } = view
        const { $from } = state.selection

        const text = event.clipboardData?.getData('text/plain')

        // 현재 커서가 토글 블록 안인지 확인
        let toggleDepth = -1
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'toggle') {
            toggleDepth = d
            break
          }
        }

        if (!text || !text.includes('\n')) return false
        if (toggleDepth === -1) return false

        const lines = text.split('\n')
        const toggleNode = $from.node(toggleDepth)
        const togglePos = $from.before(toggleDepth)
        const afterTogglePos = togglePos + toggleNode.nodeSize

        // 첫 줄은 현재 커서 위치에 삽입
        const { tr } = state
        if (lines[0]) {
          tr.insertText(lines[0], $from.pos)
        }

        // 나머지 줄은 현재 토글 뒤에 새 토글 블록으로 삽입
        const newAttrs = { isOpen: true }
        if (toggleNode.attrs.isTodo) {
          newAttrs.isTodo = true
          newAttrs.todoChecked = false
        }

        let insertPos = afterTogglePos + (lines[0] ? lines[0].length : 0)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]
          const newToggle = state.schema.nodeFromJSON({
            type: 'toggle',
            attrs: newAttrs,
            content: [{
              type: 'paragraph',
              content: line ? [{ type: 'text', text: line }] : []
            }]
          })
          tr.insert(insertPos, newToggle)
          insertPos += newToggle.nodeSize
        }

        view.dispatch(tr)
        event.preventDefault()
        return true
      },
      // 크로스 패널 드롭 처리
      handleDrop: (view, event, slice, moved) => {
        const blockData = event.dataTransfer.getData('application/x-thinkmap-block')
        const crossDrag = window.__crossPaneDrag
        if (!blockData || !crossDrag) return false

        // 같은 에디터 내의 드래그는 TipTap 기본 처리
        if (crossDrag.sourceEditor.view === view) return false

        event.preventDefault()

        try {
          // 드롭 위치 계산
          const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!dropPos) return true

          const nodeJSON = JSON.parse(blockData)
          const node = view.state.schema.nodeFromJSON(nodeJSON)

          // 드롭 위치의 블록 경계 찾기
          const $pos = view.state.doc.resolve(dropPos.pos)
          let insertPos = dropPos.pos
          // 최상위 블록 경계로 조정
          if ($pos.depth > 0) {
            insertPos = $pos.after($pos.depth)
          }
          insertPos = Math.min(insertPos, view.state.doc.content.size)

          // 대상 에디터에 삽입
          const tr = view.state.tr.insert(insertPos, node)
          view.dispatch(tr)

          // 소스 에디터에서 삭제
          const { sourceEditor, sourcePos, nodeSize } = crossDrag
          try {
            const srcNode = sourceEditor.state.doc.nodeAt(sourcePos)
            if (srcNode && srcNode.nodeSize === nodeSize) {
              sourceEditor.view.dispatch(
                sourceEditor.state.tr.delete(sourcePos, sourcePos + nodeSize)
              )
            }
          } catch (e) {
            console.error('소스 블록 삭제 오류:', e)
          }
        } catch (e) {
          console.error('크로스 패널 드롭 오류:', e)
        } finally {
          window.__crossPaneDrag = null
        }

        return true
      },
      handleDOMEvents: {
        // TipTap의 기본 드래그 이벤트 비활성화 (우리의 커스텀 드래그 사용)
        dragstart: (view, event) => {
          // drag-handle에서 시작한 드래그는 허용
          if (event.target.closest && event.target.closest('.drag-handle')) {
            return false // TipTap이 처리하지 않음
          }
          // 다른 곳에서의 드래그는 TipTap이 처리
          return false
        },
        // 크로스 패널 드래그 오버 시 드롭 허용
        dragover: (view, event) => {
          if (event.dataTransfer.types.includes('application/x-thinkmap-block')) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }
          return false
        },
        // 드래그 종료 시 글로벌 상태 정리
        dragend: () => {
          window.__crossPaneDrag = null
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
        let domAtPos
        try { domAtPos = editor.view.domAtPos($from.pos) } catch { return }
        const cell = domAtPos.node?.closest?.('td, th') || domAtPos.node?.parentElement?.closest?.('td, th')

        if (cell) {
          const table = cell.closest('table')
          if (table) {
            const tableRect = table.getBoundingClientRect()

            // CellSelection 정보 추출 (DOM 기반 — selectedCell 클래스)
            let cellSelInfo = null
            const selectedCells = table.querySelectorAll('.selectedCell')
            if (selectedCells.length > 1) {
              const selRows = new Set()
              const selCols = new Set()
              selectedCells.forEach(c => {
                const row = c.parentElement
                const rowIdx = Array.from(row.parentElement.children).indexOf(row)
                const colIdx = Array.from(row.children).indexOf(c)
                selRows.add(rowIdx)
                selCols.add(colIdx)
              })
              const rowArr = [...selRows].sort((a, b) => a - b)
              const colArr = [...selCols].sort((a, b) => a - b)
              cellSelInfo = {
                rowCount: rowArr.length,
                colCount: colArr.length,
                minRow: rowArr[0], maxRow: rowArr[rowArr.length - 1],
                minCol: colArr[0], maxCol: colArr[colArr.length - 1],
              }
            }

            // 위치 계산: 선택 영역 또는 현재 셀 기준
            let anchorRect
            if (selectedCells.length > 1) {
              // 선택된 셀들의 바운딩 박스
              let minTop = Infinity, maxBottom = -Infinity, minLeft = Infinity, maxRight = -Infinity
              selectedCells.forEach(c => {
                const r = c.getBoundingClientRect()
                if (r.top < minTop) minTop = r.top
                if (r.bottom > maxBottom) maxBottom = r.bottom
                if (r.left < minLeft) minLeft = r.left
                if (r.right > maxRight) maxRight = r.right
              })
              anchorRect = { top: minTop, bottom: maxBottom, left: minLeft, right: maxRight }
            } else {
              anchorRect = cell.getBoundingClientRect()
            }

            const TOOLBAR_H = 36
            const GAP = 6
            const viewH = window.innerHeight
            const viewW = window.innerWidth

            // 기본: 선택 영역 위에 표시
            let top = anchorRect.top - TOOLBAR_H - GAP
            // 위에 공간이 부족하면 아래에 표시
            if (top < 4) {
              top = anchorRect.bottom + GAP
            }
            // 아래에도 잘리면 영역 안 상단에 표시
            if (top + TOOLBAR_H > viewH - 4) {
              top = anchorRect.top + GAP
            }

            let left = anchorRect.left
            // 오른쪽으로 넘치면 보정
            if (left + 300 > viewW) left = viewW - 310
            if (left < 4) left = 4

            setTableToolbar({ visible: true, position: { top, left }, cellSelInfo })
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

  // 토글 내부 드래그 핸들 클릭 시 컨텍스트 메뉴 열기 (래퍼 스코프 — 분할 모드에서 다른 패널 이벤트 무시)
  useEffect(() => {
    if (!editor || !wrapperRef.current) return

    const wrapper = wrapperRef.current
    const handleToggleContextMenu = (event) => {
      const { pos, top, left } = event.detail
      setContextMenu({ visible: true, position: { top, left }, nodePos: pos })
    }

    const handlePageNavigate = (event) => {
      const { pageId } = event.detail
      if (pageId && pageContext?.setCurrentPageId) {
        pageContext.setCurrentPageId(pageId)
      }
    }

    wrapper.addEventListener('toggle-context-menu', handleToggleContextMenu)
    wrapper.addEventListener('toggle-page-navigate', handlePageNavigate)
    return () => {
      wrapper.removeEventListener('toggle-context-menu', handleToggleContextMenu)
      wrapper.removeEventListener('toggle-page-navigate', handlePageNavigate)
    }
  }, [editor, pageContext])

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

    // editor.view가 아직 마운트 전일 수 있으므로 다음 프레임에서 접근
    let editorDom = null
    const rafId = requestAnimationFrame(() => {
      try {
        editorDom = editor.view.dom
      } catch {
        return // editor view not ready
      }
      editorDom.addEventListener('touchstart', handleTouchStart, { passive: false })
      editorDom.addEventListener('touchmove', handleTouchMove, { passive: true })
      editorDom.addEventListener('touchend', handleTouchEnd, { passive: true })
    })

    return () => {
      cancelAnimationFrame(rafId)
      if (editorDom) {
        editorDom.removeEventListener('touchstart', handleTouchStart)
        editorDom.removeEventListener('touchmove', handleTouchMove)
        editorDom.removeEventListener('touchend', handleTouchEnd)
      }
      if (longPressTimer) clearTimeout(longPressTimer)
    }
  }, [editor])

  // 멀티셀렉트 상태 추적
  useEffect(() => {
    if (!editor) return

    const updateMultiSelect = () => {
      const pluginState = multiSelectPluginKey.getState(editor.state)
      setMultiSelectCount(pluginState?.selectedPositions?.length || 0)
    }

    editor.on('transaction', updateMultiSelect)
    return () => editor.off('transaction', updateMultiSelect)
  }, [editor])

  // 페이지 블록 제목 동기화: pages 목록의 name이 변경되면 블록 텍스트 업데이트
  useEffect(() => {
    if (!editor || !pageContext?.pages?.length) return

    const { doc } = editor.state
    const updates = []

    doc.descendants((node, pos) => {
      if (node.type.name === 'toggle' && node.attrs.blockType === 'page' && node.attrs.pageId) {
        const page = pageContext.pages.find(p => p.id === node.attrs.pageId)
        if (!page) return
        const firstChild = node.content.firstChild
        const currentText = firstChild?.textContent || ''
        if (currentText !== page.name) {
          updates.push({ pos, node, newName: page.name })
        }
      }
    })

    if (updates.length === 0) return

    const { tr } = editor.state
    // 뒤에서부터 처리 (pos 매핑 충돌 방지)
    for (let i = updates.length - 1; i >= 0; i--) {
      const { pos, node, newName } = updates[i]
      const paragraphPos = pos + 1 // 첫 번째 paragraph 시작
      const paragraph = node.content.firstChild
      if (paragraph) {
        const from = paragraphPos
        const to = paragraphPos + paragraph.nodeSize
        const newParagraph = editor.state.schema.nodes.paragraph.create(
          null,
          newName ? [editor.state.schema.text(newName)] : []
        )
        tr.replaceWith(from, to, newParagraph)
      }
    }

    if (tr.docChanged) {
      editor.view.dispatch(tr)
    }
  }, [editor, pageContext?.pages])

  if (!editor) {
    return <div>에디터 로딩 중...</div>
  }

  // 뷰어 모드 스토리지 설정
  useEffect(() => {
    if (editor && editor.storage.toggle) {
      editor.storage.toggle.viewerMode = isViewerMode
    }
  }, [editor, isViewerMode])

  // 여백 더블클릭 시 토글 블록이 없으면 첫 줄에 토글 생성
  const handleWrapperDoubleClick = (e) => {
    if (!editor || isViewerMode) return
    // 토글 블록 내부 클릭이면 무시
    if (e.target.closest('.toggle-block')) return
    // 이미 토글이 있으면 무시
    const hasToggle = editor.state.doc.content.content.some(n => n.type.name === 'toggle')
    if (hasToggle) return

    const toggleNode = editor.state.schema.nodes.toggle.create(
      { isOpen: true },
      editor.state.schema.nodes.paragraph.create()
    )
    editor.chain().focus().insertContentAt(0, toggleNode.toJSON()).run()
  }


  return (
    <div className="tiptap-wrapper" ref={wrapperRef} onDoubleClick={handleWrapperDoubleClick}>
      <EditorContent editor={editor} />

      {/* 텍스트 선택 시 서식 도구창 (뷰어 모드에서 숨김) */}
      {!isViewerMode && <BubbleMenu
        editor={editor}
        updateDelay={150}
        shouldShow={({ editor, state }) => {
          const { from, to, empty } = state.selection
          if (empty) return false
          // NodeSelection(블록 전체 선택)일 때는 표시하지 않음
          if (state.selection.node) return false
          return true
        }}
      >
        <div className="bubble-menu">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`bubble-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`bubble-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`bubble-btn ${editor.isActive('strike') ? 'is-active' : ''}`}
            title="Strikethrough"
          >
            <s>S</s>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`bubble-btn ${editor.isActive('code') ? 'is-active' : ''}`}
            title="Code"
          >
            {'</>'}
          </button>
          <div className="bubble-separator" />
          <button
            onClick={() => setBubbleColorOpen(!bubbleColorOpen)}
            className={`bubble-btn ${bubbleColorOpen ? 'is-active' : ''}`}
            title="글씨 색상"
          >
            <span style={{
              fontWeight: 700, fontSize: 13,
              color: editor.getAttributes('textStyle').color || '#e5e7eb',
              borderBottom: `2px solid ${editor.getAttributes('textStyle').color || '#e5e7eb'}`,
              lineHeight: 1,
            }}>A</span>
          </button>
          {bubbleColorOpen && (
            <div className="bubble-color-dropdown">
              {COLORS.map(c => (
                <button
                  key={c.name}
                  className={`color-picker-swatch ${editor.getAttributes('textStyle').color === c.value ? 'is-active' : ''}`}
                  title={c.name}
                  onClick={() => {
                    if (c.value) editor.chain().focus().setColor(c.value).run()
                    else editor.chain().focus().unsetColor().run()
                    setBubbleColorOpen(false)
                  }}
                >
                  <span className="color-picker-dot" style={{ background: c.value || '#e5e7eb' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </BubbleMenu>}

      {/* 테이블 툴바 (뷰어 모드에서 숨김) */}
      {!isViewerMode && tableToolbar.visible && editor && (
        <TableToolbar
          editor={editor}
          position={tableToolbar.position}
          cellSelInfo={tableToolbar.cellSelInfo}
          onClose={() => setTableToolbar(prev => ({ ...prev, visible: false }))}
        />
      )}

      {/* 블록 컨텍스트 메뉴 (뷰어 모드에서 숨김) */}
      {!isViewerMode && contextMenu.visible && editor && (
        <BlockContextMenu
          editor={editor}
          position={contextMenu.position}
          nodePos={contextMenu.nodePos}
          onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
        />
      )}

      {/* 멀티셀렉트 툴바 */}
      {multiSelectCount > 0 && editor && (
        <MultiSelectToolbar
          count={multiSelectCount}
          onConvertToTodo={() => editor.commands.multiSelectConvertToTodo()}
          onDelete={() => editor.commands.multiSelectDelete()}
          onClear={() => editor.commands.multiSelectClear()}
        />
      )}
    </div>
  )
}

export default TipTapEditor
