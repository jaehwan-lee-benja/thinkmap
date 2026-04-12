import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { NodeSelection, TextSelection, Selection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Fragment, Slice } from '@tiptap/pm/model'

export const multiSelectPluginKey = new PluginKey('multiSelect')
export const focusHighlightPluginKey = new PluginKey('toggleFocusHighlight')
const blockDragPluginKey = new PluginKey('blockDrag')

// --- 멀티셀렉트 삭제 헬퍼 ---
function deleteMultiSelected(state, dispatch) {
  const pluginState = multiSelectPluginKey.getState(state)
  if (!pluginState || pluginState.selectedPositions.length === 0) return false

  const entries = pluginState.selectedPositions
    .map(pos => ({ pos, node: state.doc.nodeAt(pos) }))
    .filter(e => e.node && e.node.type.name === 'toggle')
    .map(e => ({ pos: e.pos, end: e.pos + e.node.nodeSize }))
    .sort((a, b) => a.pos - b.pos)

  // 중첩된 토글 필터링 (부모가 선택되었으면 자식 제외)
  const filtered = []
  for (const entry of entries) {
    const isNested = filtered.some(f => entry.pos >= f.pos && entry.end <= f.end)
    if (!isNested) filtered.push(entry)
  }

  if (filtered.length === 0) return false

  // 고정 섹션(isFixedSection) 제외
  const deletable = filtered.filter(e => {
    const node = state.doc.nodeAt(e.pos)
    return !(node && node.attrs.isFixedSection)
  })
  if (deletable.length === 0) return false

  const { tr } = state
  for (let i = deletable.length - 1; i >= 0; i--) {
    const mappedPos = tr.mapping.map(deletable[i].pos)
    const node = tr.doc.nodeAt(mappedPos)
    if (node && node.type.name === 'toggle') {
      tr.delete(mappedPos, mappedPos + node.nodeSize)
    }
  }

  tr.setMeta(multiSelectPluginKey, { type: 'clear' })
  if (dispatch) dispatch(tr)
  return true
}

// --- CheckboxSelection: 체크박스가 '선택된' 상태를 나타내는 커스텀 Selection ---

class CheckboxBookmark {
  constructor(togglePos) { this.togglePos = togglePos }
  map(mapping) { return new CheckboxBookmark(mapping.map(this.togglePos)) }
  resolve(doc) {
    const node = doc.nodeAt(this.togglePos)
    if (node && node.type.name === 'toggle' && node.attrs.isTodo) {
      return new CheckboxSelection(doc.resolve(this.togglePos + 2), this.togglePos)
    }
    return TextSelection.near(doc.resolve(this.togglePos))
  }
}

class CheckboxSelection extends Selection {
  constructor($pos, togglePos) {
    super($pos, $pos)
    this.togglePos = togglePos
  }

  get node() { return this.$anchor.doc.nodeAt(this.togglePos) }

  map(doc, mapping) {
    const mappedPos = mapping.map(this.togglePos)
    const node = doc.nodeAt(mappedPos)
    if (node && node.type.name === 'toggle' && node.attrs.isTodo) {
      return new CheckboxSelection(doc.resolve(mappedPos + 2), mappedPos)
    }
    return TextSelection.near(doc.resolve(mapping.map(this.from)))
  }

  eq(other) {
    return other instanceof CheckboxSelection && other.togglePos === this.togglePos
  }

  toJSON() { return { type: 'checkbox', togglePos: this.togglePos } }
  static fromJSON(doc, json) {
    return new CheckboxSelection(doc.resolve(json.togglePos + 2), json.togglePos)
  }

  getBookmark() { return new CheckboxBookmark(this.togglePos) }
}

Selection.jsonID('checkbox', CheckboxSelection)

// --- 헬퍼 함수 ---

/** 노드에 하위 토글이 있는지 확인 (첫 번째 자식은 paragraph이므로 인덱스 1부터 검사) */
function hasChildToggles(node) {
  for (let i = 1; i < node.childCount; i++) {
    if (node.child(i).type.name === 'toggle') return true
  }
  return false
}

/** $from 위치에서 가장 가까운 토글의 depth 반환, 없으면 -1 */
function findToggleDepth($from) {
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'toggle') return d
  }
  return -1
}

/** 화면에 보이는 블록 위치를 순서대로 수집 (닫힌 토글의 하위는 제외) */
function collectVisiblePositions(doc) {
  const positions = []
  function visit(node, pos) {
    positions.push(pos)
    if (node.type.name === 'toggle' && node.attrs.isOpen && node.childCount > 1) {
      let childPos = pos + 1 + node.child(0).nodeSize
      for (let i = 1; i < node.childCount; i++) {
        visit(node.child(i), childPos)
        childPos += node.child(i).nodeSize
      }
    }
  }
  let pos = 0
  for (let i = 0; i < doc.childCount; i++) {
    visit(doc.child(i), pos)
    pos += doc.child(i).nodeSize
  }
  return positions
}

/** 멀티셀렉트에서 선택된 토글 노드들을 수집 (중첩 필터링 포함) */
function collectMultiSelectedNodes(state) {
  const pluginState = multiSelectPluginKey.getState(state)
  if (!pluginState || pluginState.selectedPositions.length === 0) return []

  const entries = pluginState.selectedPositions
    .map(pos => ({ pos, node: state.doc.nodeAt(pos) }))
    .filter(e => e.node && e.node.type.name === 'toggle')
    .sort((a, b) => a.pos - b.pos)

  // 중첩된 토글 필터링 (부모가 선택되었으면 자식 제외)
  const filtered = []
  for (const entry of entries) {
    const end = entry.pos + entry.node.nodeSize
    const isNested = filtered.some(f => entry.pos >= f.pos && end <= f.pos + f.node.nodeSize)
    if (!isNested) filtered.push(entry)
  }

  return filtered
}

/** 멀티셀렉트 복사/잘라내기 — serializeForClipboard 사용 */
function handleMultiSelectCopy(view, event, isCut) {
  const filtered = collectMultiSelectedNodes(view.state)
  if (filtered.length === 0) return false

  const nodes = filtered.map(e => e.node)
  const slice = new Slice(Fragment.from(nodes), 0, 0)
  const { dom, text } = view.serializeForClipboard(slice)

  event.clipboardData.clearData()
  event.clipboardData.setData('text/html', dom.innerHTML)
  event.clipboardData.setData('text/plain', text)
  event.preventDefault()

  if (isCut) {
    deleteMultiSelected(view.state, (tr) => view.dispatch(tr))
  }

  return true
}

/** 빈 토글 JSON 객체 반환 */
function emptyToggleJSON(isOpen = true, autoGenerated = false, extraAttrs = {}) {
  return {
    type: 'toggle',
    attrs: { isOpen, autoGenerated, ...extraAttrs },
    content: [{ type: 'paragraph', content: [] }]
  }
}

/** listItem JSON → toggle JSON 변환 (재귀: 중첩 리스트 → 중첩 토글) */
function convertListItemToToggleJSON(listItem) {
  const children = []
  ;(listItem.content || []).forEach(child => {
    if (child.type === 'paragraph') {
      children.push(child)
    } else if (child.type === 'orderedList' || child.type === 'bulletList') {
      ;(child.content || []).forEach(subItem => children.push(convertListItemToToggleJSON(subItem)))
    } else {
      children.push(child)
    }
  })
  if (children.length === 0 || children[0]?.type !== 'paragraph') {
    children.unshift({ type: 'paragraph', content: [] })
  }
  const hasChildToggleNodes = children.slice(1).some(c => c.type === 'toggle')
  return { type: 'toggle', attrs: { isOpen: hasChildToggleNodes }, content: children }
}

/** 문서 노드 JSON → toggle JSON 배열 변환 (재귀: toggle 내부도 처리) */
function convertNodeToTogglesJSON(node) {
  switch (node.type) {
    case 'paragraph':
      return [{ type: 'toggle', attrs: { isOpen: false }, content: [node] }]
    case 'orderedList':
    case 'bulletList':
      return (node.content || []).map(convertListItemToToggleJSON)
    case 'toggle': {
      const newChildren = []
      ;(node.content || []).forEach(child => newChildren.push(...convertNodeToTogglesJSON(child)))
      const hasChildToggleNodes = newChildren.slice(1).some(c => c.type === 'toggle')
      return [{ ...node, attrs: { ...node.attrs, isOpen: hasChildToggleNodes }, content: newChildren }]
    }
    default:
      return [node] // heading, codeBlock, table 등 → 그대로 유지
  }
}

/**
 * Toggle Extension for TipTap
 * Notion-style collapsible blocks with children
 */
export const Toggle = Node.create({
  name: 'toggle',

  priority: 200, // 키보드 핸들러가 다른 익스텐션보다 먼저 실행되도록 (줄바꿈 방지)

  group: 'block',

  content: '(paragraph | toggle)+',

  // defining: false — 의도적으로 제거.
  // defining: true이면 ProseMirror fitting 알고리즘이 붙여넣기 시
  // 콘텐츠를 토글 내부로 밀어넣어 토글 중첩을 유발함.
  // Enter/Backspace 등은 모두 커스텀 핸들러로 제어하므로 defining 불필요.
  defining: false,

  addStorage() {
    return { viewerMode: false }
  },

  addAttributes() {
    return {
      isOpen: {
        default: true,
        parseHTML: element => element.getAttribute('data-is-open') === 'true',
        renderHTML: attributes => {
          return {
            'data-is-open': attributes.isOpen,
          }
        },
      },
      autoGenerated: {
        default: false,
        parseHTML: element => element.getAttribute('data-auto-generated') === 'true',
        renderHTML: attributes => {
          return attributes.autoGenerated ? {
            'data-auto-generated': 'true',
          } : {}
        },
      },
      isTodo: {
        default: false,
        parseHTML: element => element.getAttribute('data-is-todo') === 'true',
        renderHTML: attributes => attributes.isTodo ? { 'data-is-todo': 'true' } : {},
      },
      todoChecked: {
        default: false,
        parseHTML: element => element.getAttribute('data-todo-checked') === 'true',
        renderHTML: attributes => attributes.todoChecked ? { 'data-todo-checked': 'true' } : {},
      },
      todoStatus: {
        default: null,
        parseHTML: element => element.getAttribute('data-todo-status') || null,
        renderHTML: attributes => attributes.todoStatus ? { 'data-todo-status': attributes.todoStatus } : {},
      },
      backgroundColor: {
        default: null,
        parseHTML: element => element.getAttribute('data-bg-color') || null,
        renderHTML: attributes => attributes.backgroundColor ? { 'data-bg-color': attributes.backgroundColor } : {},
      },
      blockType: {
        default: 'paragraph',
        parseHTML: element => element.getAttribute('data-block-type') || 'paragraph',
        renderHTML: attributes => attributes.blockType && attributes.blockType !== 'paragraph' ? { 'data-block-type': attributes.blockType } : {},
      },
      pageId: {
        default: null,
        parseHTML: element => element.getAttribute('data-page-id') || null,
        renderHTML: attributes => attributes.pageId ? { 'data-page-id': attributes.pageId } : {},
      },
      isFixedSection: {
        default: false,
        parseHTML: element => element.getAttribute('data-fixed-section') === 'true',
        renderHTML: attributes => attributes.isFixedSection ? { 'data-fixed-section': 'true' } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="toggle"]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle',
        'data-is-open': node.attrs.isOpen,
        class: 'toggle-block',
      }),
      [
        'div',
        { class: 'toggle-header' },
        [
          'button',
          {
            class: 'toggle-button',
            contenteditable: 'false',
            'data-toggle-button': 'true',
            'data-arrow': node.attrs.isOpen ? '▼' : '▶',
          },
        ],
        ['div', { class: 'toggle-content-wrapper' }, 0],
      ],
      [
        'div',
        {
          class: node.attrs.isOpen ? 'toggle-children open' : 'toggle-children closed',
        },
        // children will be rendered here by TipTap
      ],
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos, decorations }) => {
      const dom = document.createElement('div')
      dom.classList.add('toggle-block')
      dom.setAttribute('data-type', 'toggle')
      dom.setAttribute('data-is-open', node.attrs.isOpen)

      // 배경색 적용
      if (node.attrs.backgroundColor) {
        dom.setAttribute('data-bg-color', node.attrs.backgroundColor)
        dom.style.setProperty('background-color', node.attrs.backgroundColor, 'important')
      }

      // 초기 decoration 적용
      const hasFocusClass = (decos) =>
        decos?.some(d => d.type?.attrs?.class?.includes('toggle-block-focused'))
      const hasCheckboxFocusClass = (decos) =>
        decos?.some(d => d.type?.attrs?.class?.includes('toggle-checkbox-focused'))
      const hasMultiSelectClass = (decos) =>
        decos?.some(d => d.type?.attrs?.class?.includes('toggle-block-multiselected'))
      if (hasFocusClass(decorations)) dom.classList.add('toggle-block-focused')
      if (hasCheckboxFocusClass(decorations)) dom.classList.add('toggle-checkbox-focused')
      if (hasMultiSelectClass(decorations)) dom.classList.add('toggle-block-multiselected')

      // 드래그 핸들 (블록 내부에 배치)
      const dragHandle = document.createElement('div')
      dragHandle.classList.add('toggle-drag-handle')
      dragHandle.contentEditable = 'false'
      dragHandle.draggable = true

      // 드래그 시작 이벤트
      dragHandle.addEventListener('dragstart', (e) => {
        if (typeof getPos !== 'function') return

        const pos = getPos()
        const nodeAtPos = editor.state.doc.nodeAt(pos)
        if (!nodeAtPos) return

        // 블록 드래그 상태 활성화 (ProseMirror Plugin + CSS)
        const { tr } = editor.state
        tr.setSelection(NodeSelection.create(editor.state.doc, pos))
        tr.setMeta(blockDragPluginKey, true)
        editor.view.dispatch(tr)
        editor.view.dom.classList.add('block-dragging')

        // 이 드래그 핸들이 source임을 표시 (CSS pointer-events 예외용 — 현재 미사용)
        dragHandle.classList.add('drag-source')

        // 드래그 데이터 설정
        const slice = editor.state.selection.content()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setDragImage(dom, 0, 0)

        const nodeJSON = nodeAtPos.toJSON()
        e.dataTransfer.setData('application/x-thinkmap-block', JSON.stringify(nodeJSON))
        window.__crossPaneDrag = { sourceEditor: editor, sourcePos: pos, nodeSize: nodeAtPos.nodeSize }

        editor.view.dragging = { slice, move: true }
      })

      // 드래그 종료
      dragHandle.addEventListener('dragend', () => {
        editor.view.dom.classList.remove('block-dragging')
        dragHandle.classList.remove('drag-source')
        // stale state 정리 — 다음 드래그가 오인되지 않도록
        window.__crossPaneDrag = null
        editor.view.dragging = null
        const pluginState = blockDragPluginKey.getState(editor.state)
        if (pluginState?.dragging) {
          editor.view.dispatch(editor.state.tr.setMeta(blockDragPluginKey, false))
        }
      })

      // 드래그 핸들 클릭 시 블록 선택 + 컨텍스트 메뉴 (멀티셀렉트 지원)
      dragHandle.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (typeof getPos !== 'function') return

        const pos = getPos()

        // Cmd/Ctrl+click → 멀티셀렉트 토글
        if (e.metaKey || e.ctrlKey) {
          editor.view.dispatch(
            editor.state.tr.setMeta(multiSelectPluginKey, { type: 'toggle', pos })
          )
          editor.view.focus()
          return
        }

        // Shift+click → 범위 선택
        if (e.shiftKey) {
          const pluginState = multiSelectPluginKey.getState(editor.state)
          const lastPos = pluginState?.lastClickedPos
          if (lastPos !== null && lastPos !== undefined) {
            const positions = collectVisiblePositions(editor.state.doc)
            const togglePositions = positions.filter(p => {
              const n = editor.state.doc.nodeAt(p)
              return n && n.type.name === 'toggle'
            })
            const idx1 = togglePositions.indexOf(lastPos)
            const idx2 = togglePositions.indexOf(pos)
            if (idx1 !== -1 && idx2 !== -1) {
              const [start, end] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1]
              editor.view.dispatch(
                editor.state.tr.setMeta(multiSelectPluginKey, {
                  type: 'set',
                  positions: togglePositions.slice(start, end + 1),
                  lastClickedPos: pos
                })
              )
              editor.view.focus()
              return
            }
          }
          // lastPos가 없으면 단일 토글 선택
          editor.view.dispatch(
            editor.state.tr.setMeta(multiSelectPluginKey, { type: 'toggle', pos })
          )
          editor.view.focus()
          return
        }

        // 멀티셀렉트 활성 시 일반 클릭 → 해제
        const pluginState = multiSelectPluginKey.getState(editor.state)
        if (pluginState?.selectedPositions.length > 0) {
          editor.view.dispatch(
            editor.state.tr.setMeta(multiSelectPluginKey, { type: 'clear' })
          )
        }

        // 일반 클릭: NodeSelection + 컨텍스트 메뉴
        const selection = NodeSelection.create(editor.state.doc, pos)
        editor.view.dispatch(editor.state.tr.setSelection(selection))

        const rect = dragHandle.getBoundingClientRect()
        dom.dispatchEvent(new CustomEvent('toggle-context-menu', {
          bubbles: true,
          detail: { pos, top: rect.bottom + 5, left: rect.left }
        }))
      })

      // Toggle button
      const button = document.createElement('button')
      button.classList.add('toggle-button')
      button.contentEditable = 'false'
      button.dataset.arrow = hasChildToggles(node)
        ? (node.attrs.isOpen ? '▼' : '▶')
        : (node.attrs.isOpen ? '▽' : '▷')

      // Content area (contentDOM) - 버튼 옆에 배치
      const contentWrapper = document.createElement('div')
      contentWrapper.classList.add('toggle-content')
      contentWrapper.classList.add(node.attrs.isOpen ? 'open' : 'closed')

      button.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (typeof getPos !== 'function') return

        // Cmd/Ctrl+click → 멀티셀렉트
        if (e.metaKey || e.ctrlKey) {
          editor.view.dispatch(
            editor.state.tr.setMeta(multiSelectPluginKey, { type: 'toggle', pos: getPos() })
          )
          editor.view.focus()
          return
        }

        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        if (!currentNode) return

        const newIsOpen = !currentNode.attrs.isOpen
        const { tr } = editor.state
        tr.setNodeMarkup(pos, null, { ...currentNode.attrs, isOpen: newIsOpen })
        // 버튼 클릭임을 표시 → 플러그인이 자동 열기를 건너뜀
        tr.setMeta('toggleButtonClick', true)

        const isViewer = editor.storage.toggle?.viewerMode

        if (!isViewer) {
          if (newIsOpen) {
            // 열 때, 하위 토글이 없으면 빈 하위 토글 자동 생성
            if (!hasChildToggles(currentNode)) {
              const insertPos = pos + currentNode.nodeSize - 1
              tr.insert(insertPos, editor.state.schema.nodeFromJSON(emptyToggleJSON(true, true)))
            }
          } else {
            // 닫을 때, 자동 생성된 빈 토글들을 삭제
            if (hasChildToggles(currentNode)) {
              const updatedNode = tr.doc.nodeAt(pos)
              if (updatedNode) {
                let deleteOffset = 0
                // 첫 번째 자식은 paragraph이므로 인덱스 1부터 검사
                for (let i = 1; i < updatedNode.childCount; i++) {
                  const child = updatedNode.child(i)
                  if (child.type.name === 'toggle' &&
                      child.attrs.autoGenerated &&
                      child.childCount === 1 &&
                      child.firstChild?.type.name === 'paragraph' &&
                      child.firstChild?.content.size === 0) {
                    // 자동 생성된 빈 토글 삭제
                    const childPos = pos + 1 + updatedNode.child(0).nodeSize + deleteOffset
                    tr.delete(childPos, childPos + child.nodeSize)
                    deleteOffset -= child.nodeSize
                  } else {
                    deleteOffset += child.nodeSize
                  }
                }
              }
            }
          }
        }

        editor.view.dispatch(tr)
      })

      // Todo checkbox
      const checkbox = document.createElement('div')
      checkbox.classList.add('toggle-todo-checkbox')
      checkbox.contentEditable = 'false'

      // SVG checkmark
      const svgNS = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(svgNS, 'svg')
      svg.setAttribute('viewBox', '0 0 12 12')
      svg.classList.add('checkbox-icon')
      const path = document.createElementNS(svgNS, 'path')
      path.setAttribute('d', 'M2.5 6.5L5 9L9.5 3.5')
      svg.appendChild(path)
      checkbox.appendChild(svg)

      // Particle elements
      const particles = document.createElement('div')
      particles.classList.add('checkbox-particles')
      for (let i = 0; i < 6; i++) {
        particles.appendChild(document.createElement('span'))
      }
      checkbox.appendChild(particles)

      // 상태 아이콘 (보류/진행중)
      const statusIcon = document.createElement('div')
      statusIcon.classList.add('checkbox-status-icon')
      statusIcon.innerHTML = ''
      checkbox.appendChild(statusIcon)

      const updateStatusIcon = (status) => {
        checkbox.classList.remove('status-hold', 'status-progress')
        if (status === 'hold') {
          checkbox.classList.add('status-hold')
          statusIcon.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10"><rect x="2.5" y="2" width="2.5" height="8" rx="0.8" fill="currentColor"/><rect x="7" y="2" width="2.5" height="8" rx="0.8" fill="currentColor"/></svg>'
        } else if (status === 'progress') {
          checkbox.classList.add('status-progress')
          statusIcon.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10"><path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor"/></svg>'
        } else {
          statusIcon.innerHTML = ''
        }
      }

      if (!node.attrs.isTodo) checkbox.style.display = 'none'
      if (node.attrs.todoChecked) {
        checkbox.classList.add('checked')
        dom.classList.add('toggle-todo-checked')
      }
      updateStatusIcon(node.attrs.todoStatus)

      // 상태 팝업 메뉴
      const statusPopup = document.createElement('div')
      statusPopup.classList.add('checkbox-status-popup')
      statusPopup.contentEditable = 'false'
      statusPopup.style.display = 'none'
      statusPopup.innerHTML = `
        <button data-status="hold" class="status-popup-item status-popup-hold">
          <svg viewBox="0 0 12 12" width="12" height="12"><rect x="2.5" y="2" width="2.5" height="8" rx="0.8" fill="currentColor"/><rect x="7" y="2" width="2.5" height="8" rx="0.8" fill="currentColor"/></svg>
          <span>보류</span>
        </button>
        <button data-status="progress" class="status-popup-item status-popup-progress">
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor"/></svg>
          <span>진행중</span>
        </button>
      `
      // 팝업은 처음부터 body에 배치 (overflow 클리핑 방지, NodeView DOM 무결성 유지)
      document.body.appendChild(statusPopup)

      let popupNodePos = null // 팝업 열 때 저장

      const showStatusPopup = (mouseX, mouseY) => {
        popupNodePos = typeof getPos === 'function' ? getPos() : null
        statusPopup.style.left = mouseX + 8 + 'px'
        statusPopup.style.top = mouseY + 8 + 'px'
        statusPopup.style.display = ''
        statusPopup.animate([
          { opacity: 0, transform: 'scale(0.8) translateY(-4px)' },
          { opacity: 1, transform: 'scale(1) translateY(0)' },
        ], { duration: 150, easing: 'ease-out' })
      }

      const hideStatusPopup = () => {
        statusPopup.style.display = 'none'
        popupNodePos = null
      }

      statusPopup.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const btn = e.target.closest('.status-popup-item')
        if (!btn || popupNodePos == null) return

        const currentNode = editor.state.doc.nodeAt(popupNodePos)
        if (!currentNode || currentNode.type.name !== 'toggle') { hideStatusPopup(); return }

        const newStatus = btn.dataset.status
        const finalStatus = currentNode.attrs.todoStatus === newStatus ? null : newStatus

        const { tr } = editor.state
        tr.setNodeMarkup(popupNodePos, null, {
          ...currentNode.attrs,
          todoStatus: finalStatus,
          todoChecked: finalStatus ? false : currentNode.attrs.todoChecked,
        })
        editor.view.dispatch(tr)

        const color = finalStatus === 'hold' ? '#f59e0b' : finalStatus === 'progress' ? '#3b82f6' : '#6b7280'
        checkbox.animate([
          { transform: 'scale(1)', boxShadow: '0 0 0 0 transparent' },
          { transform: 'scale(1.3)', boxShadow: `0 0 0 4px ${color}40`, offset: 0.3 },
          { transform: 'scale(0.9)', boxShadow: `0 0 0 2px ${color}20`, offset: 0.6 },
          { transform: 'scale(1)', boxShadow: '0 0 0 0 transparent' },
        ], { duration: 400, easing: 'ease-out' })

        hideStatusPopup()
      })

      // 팝업 외부 클릭 시 닫기
      const handleDocClickForPopup = (e) => {
        if (statusPopup.style.display !== 'none' && !statusPopup.contains(e.target)) {
          hideStatusPopup()
        }
      }
      document.addEventListener('mousedown', handleDocClickForPopup)

      let longPressTimer = null
      let longPressTriggered = false
      const LONG_PRESS_MS = 400

      checkbox.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (typeof getPos !== 'function') return

        // Cmd/Ctrl+click → 멀티셀렉트
        if (e.metaKey || e.ctrlKey) {
          editor.view.dispatch(
            editor.state.tr.setMeta(multiSelectPluginKey, { type: 'toggle', pos: getPos() })
          )
          editor.view.focus()
          return
        }

        // 팝업이 열려있으면 닫기
        if (statusPopup.style.display !== 'none') {
          hideStatusPopup()
          longPressTriggered = true
          return
        }

        longPressTriggered = false
        const mx = e.clientX, my = e.clientY
        longPressTimer = setTimeout(() => {
          longPressTriggered = true
          longPressTimer = null
          showStatusPopup(mx, my)
        }, LONG_PRESS_MS)
      })

      checkbox.addEventListener('mouseup', (e) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
        if (longPressTriggered) { longPressTriggered = false; return }

        // 일반 클릭
        if (typeof getPos !== 'function') return
        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        if (!currentNode) return

        // 상태가 있으면 일반 클릭으로 해제
        if (currentNode.attrs.todoStatus) {
          const { tr } = editor.state
          tr.setNodeMarkup(pos, null, { ...currentNode.attrs, todoStatus: null })
          editor.view.dispatch(tr)
          checkbox.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(0.8)', offset: 0.3 },
            { transform: 'scale(1)' },
          ], { duration: 300, easing: 'ease-out' })
          return
        }

        const willCheck = !currentNode.attrs.todoChecked
        if (willCheck) {
          checkbox.classList.remove('checked')
          void checkbox.offsetWidth
        }
        const { tr } = editor.state
        tr.setNodeMarkup(pos, null, { ...currentNode.attrs, todoChecked: willCheck })
        editor.view.dispatch(tr)

        if (!willCheck) {
          checkbox.animate([
            { transform: 'scale(1)', borderColor: '#10b981', boxShadow: '0 0 0 0 rgba(239,68,68,0)' },
            { transform: 'scale(0.75)', borderColor: '#ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.3)', offset: 0.15 },
            { transform: 'scale(1.1) rotate(-6deg)', borderColor: '#ef4444', boxShadow: '0 0 0 5px rgba(239,68,68,0.15)', offset: 0.35 },
            { transform: 'scale(1.05) rotate(4deg)', borderColor: '#f87171', boxShadow: '0 0 0 3px rgba(239,68,68,0.1)', offset: 0.55 },
            { transform: 'scale(0.95) rotate(-2deg)', borderColor: '#dc2626', boxShadow: '0 0 0 2px rgba(239,68,68,0.05)', offset: 0.75 },
            { transform: 'scale(1) rotate(0deg)', borderColor: '#6b7280', boxShadow: '0 0 0 0 rgba(239,68,68,0)' },
          ], { duration: 650, easing: 'ease-out' })
        }
      })

      checkbox.addEventListener('mouseleave', () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      })

      // 페이지 블록 아이콘 버튼
      const pageLink = document.createElement('button')
      pageLink.classList.add('toggle-page-link')
      pageLink.contentEditable = 'false'
      pageLink.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1.5H4a1.5 1.5 0 00-1.5 1.5v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V6L9 1.5z"/><polyline points="9 1.5 9 6 13.5 6"/></svg>'
      pageLink.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (typeof getPos !== 'function') return
        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        const pid = currentNode?.attrs.pageId
        if (pid && pid !== '__pending__') {
          // PageContext 접근: 커스텀 이벤트로 페이지 이동 요청
          dom.dispatchEvent(new CustomEvent('toggle-page-navigate', {
            bubbles: true,
            detail: { pageId: pid }
          }))
        }
      })

      // 페이지 블록 제목 클릭 → 페이지 이동 (contentWrapper 위에 투명 오버레이)
      const pageOverlay = document.createElement('div')
      pageOverlay.classList.add('toggle-page-overlay')
      pageOverlay.contentEditable = 'false'
      pageOverlay.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (typeof getPos !== 'function') return
        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        const pid = currentNode?.attrs.pageId
        if (pid && pid !== '__pending__') {
          dom.dispatchEvent(new CustomEvent('toggle-page-navigate', {
            bubbles: true,
            detail: { pageId: pid }
          }))
        }
      })

      // 초기 페이지 블록 여부에 따라 요소 표시/숨김
      const isPageBlock = node.attrs.blockType === 'page' && node.attrs.pageId
      if (isPageBlock) {
        dom.classList.add('toggle-page-block')
        button.style.display = 'none'
        checkbox.style.display = 'none'
        pageLink.style.display = ''
        pageOverlay.style.display = ''
        contentWrapper.className = 'toggle-content toggle-page-content closed'
      } else {
        pageLink.style.display = 'none'
        pageOverlay.style.display = 'none'
      }

      // 드래그 오버: 토글 위에 호버 시 "내부 삽입" 피드백 + 자동 열기
      // debounce 방식 — dragover가 100ms 동안 안 오면 떠난 것으로 판단 (자식 진입 시 깜박임 자연 해결)
      let autoOpenTimer = null
      let dragoverDebounceTimer = null
      const AUTO_OPEN_DELAY = 600
      const DRAGOVER_DEBOUNCE = 100

      const clearDropTimers = () => {
        if (autoOpenTimer) { clearTimeout(autoOpenTimer); autoOpenTimer = null }
        if (dragoverDebounceTimer) { clearTimeout(dragoverDebounceTimer); dragoverDebounceTimer = null }
        dom.classList.remove('toggle-drop-target')
      }

      dom.addEventListener('dragover', (e) => {
        // 자기 자신 드래그 중이면 무시
        if (typeof getPos === 'function') {
          const myPos = getPos()
          const sel = editor.state.selection
          if (sel instanceof NodeSelection && sel.from === myPos) return
        }

        // 블록 드래그만 처리
        const types = Array.from(e.dataTransfer.types || [])
        const isBlockDrag = types.includes('application/x-thinkmap-block')
          || (editor.view.dragging && editor.state.selection instanceof NodeSelection)
          || window.__crossPaneDrag
        if (!isBlockDrag) return

        // 토글 블록의 header 영역 위에 호버 중인지 확인
        const rect = dom.getBoundingClientRect()
        const yInBlock = e.clientY - rect.top
        const headerHeight = 36
        if (yInBlock < 0 || yInBlock > headerHeight) {
          if (dom.classList.contains('toggle-drop-target')) clearDropTimers()
          return
        }

        // 하위 토글 내부에서 발생한 이벤트는 무시 (가장 가까운 토글이 자신인 경우만)
        const closestToggle = e.target.closest?.('.toggle-block')
        if (closestToggle !== dom) return

        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'

        // debounce: dragover가 계속 오면 timer 리셋, 끊기면 100ms 후 클래스 제거
        if (dragoverDebounceTimer) clearTimeout(dragoverDebounceTimer)
        dragoverDebounceTimer = setTimeout(() => {
          clearDropTimers()
        }, DRAGOVER_DEBOUNCE)

        if (!dom.classList.contains('toggle-drop-target')) {
          dom.classList.add('toggle-drop-target')

          autoOpenTimer = setTimeout(() => {
            if (typeof getPos !== 'function') return
            const pos = getPos()
            const node = editor.state.doc.nodeAt(pos)
            if (node && !node.attrs.isOpen) {
              const { tr } = editor.state
              tr.setNodeMarkup(pos, null, { ...node.attrs, isOpen: true })
              tr.setMeta('toggleButtonClick', true)
              editor.view.dispatch(tr)
            }
          }, AUTO_OPEN_DELAY)
        }
      })

      dom.addEventListener('drop', (e) => {
        clearDropTimers()

        // CSS 클래스 대신 직접 조건 확인 (dragleave 타이밍 이슈 회피)
        const isBlockDrag = e.dataTransfer.types.includes('application/x-thinkmap-block')
          || (editor.view.dragging && editor.state.selection instanceof NodeSelection)
          || window.__crossPaneDrag
        if (!isBlockDrag) return

        e.preventDefault()
        e.stopPropagation()

        // crossDrag는 try 블록 밖의 cleanup에서도 사용되므로 여기서 선언
        const crossDrag = window.__crossPaneDrag

        try {
          if (typeof getPos !== 'function') return
          const rawPos = getPos()
          // getPos가 stale 위치를 반환하는 경우 대비: 정수 + 범위 + nodeAt 검증
          if (!Number.isInteger(rawPos) || rawPos < 0 || rawPos >= editor.state.doc.content.size) return
          // resolve 검증 — 매핑이 깨진 위치는 catch로 빠짐
          let targetNode
          try {
            targetNode = editor.state.doc.nodeAt(rawPos)
          } catch {
            return
          }
          if (!targetNode || targetNode.type.name !== 'toggle') return
          const targetPos = rawPos

          // 자기 자신에게 드롭하는 경우 무시
          const sel = editor.state.selection
          if (sel instanceof NodeSelection && sel.from === targetPos) return

          // 드래그 소스 노드 가져오기
          let sourceJSON = null
          let sourcePos = null
          let sourceSize = null

          const blockData = e.dataTransfer.getData('application/x-thinkmap-block')
          if (blockData) {
            try { sourceJSON = JSON.parse(blockData) } catch { /* ignore */ }
          }

          const dragging = editor.view.dragging
          if (dragging?.slice) {
            const draggedNode = dragging.slice.content.firstChild
            if (draggedNode) {
              sourceJSON = draggedNode.toJSON()
              if (sel instanceof NodeSelection) {
                sourcePos = sel.from
                sourceSize = sel.node.nodeSize
              }
            }
          }

          if (crossDrag) {
            sourcePos = crossDrag.sourcePos
            sourceSize = crossDrag.nodeSize
          }

          if (!sourceJSON) return

          const { tr } = editor.state
          const nodeToInsert = editor.state.schema.nodeFromJSON(sourceJSON)

          // 소스를 먼저 삭제 (위치 안정성을 위해)
          if (sourcePos !== null && sourceSize !== null && (!crossDrag || crossDrag.sourceEditor === editor)) {
            // 소스 위치 재검증 (드래그 도중 doc 변경 가능성)
            if (Number.isInteger(sourcePos) && sourcePos >= 0 && sourcePos < tr.doc.content.size) {
              const srcNode = tr.doc.nodeAt(sourcePos)
              if (srcNode && srcNode.type.name === sourceJSON.type) {
                tr.delete(sourcePos, sourcePos + srcNode.nodeSize)
              }
            }
          }

          // 매핑된 대상 위치에 삽입
          const mappedTargetPos = tr.mapping.map(targetPos)
          if (mappedTargetPos < 0 || mappedTargetPos >= tr.doc.content.size) return
          const mappedTarget = tr.doc.nodeAt(mappedTargetPos)
          if (!mappedTarget || mappedTarget.type.name !== 'toggle') return

          if (!mappedTarget.attrs.isOpen) {
            tr.setNodeMarkup(mappedTargetPos, null, { ...mappedTarget.attrs, isOpen: true })
          }
          const insertPos = mappedTargetPos + mappedTarget.nodeSize - 1
          tr.insert(insertPos, nodeToInsert)

          tr.setMeta('toggleButtonClick', true)
          editor.view.dispatch(tr)
        } catch (err) {
          console.error('블록 드롭 오류:', err)
        } finally {
          editor.view.dragging = null
        }

        // 크로스 패널: 소스 에디터에서 삭제
        if (crossDrag && crossDrag.sourceEditor !== editor) {
          try {
            const { sourceEditor, sourcePos: sp, nodeSize: ns } = crossDrag
            const srcNode = sourceEditor.state.doc.nodeAt(sp)
            if (srcNode && srcNode.nodeSize === ns) {
              sourceEditor.view.dispatch(sourceEditor.state.tr.delete(sp, sp + ns))
            }
          } catch (err) { console.error('크로스 패널 소스 삭제 오류:', err) }
        }

        window.__crossPaneDrag = null
      })

      dom.appendChild(dragHandle)
      dom.appendChild(pageLink)
      dom.appendChild(button)
      dom.appendChild(checkbox)
      dom.appendChild(contentWrapper)
      dom.appendChild(pageOverlay)

      return {
        dom,
        contentDOM: contentWrapper,
        update: (updatedNode, outerDecorations) => {
          if (updatedNode.type.name !== 'toggle') return false

          // 페이지 블록 전환 처리
          const isPage = updatedNode.attrs.blockType === 'page' && updatedNode.attrs.pageId
          dom.classList.toggle('toggle-page-block', isPage)
          if (isPage) {
            button.style.display = 'none'
            checkbox.style.display = 'none'
            pageLink.style.display = ''
            pageOverlay.style.display = ''
            contentWrapper.className = 'toggle-content toggle-page-content closed'
            dom.setAttribute('data-is-open', 'false')
            dom.setAttribute('data-block-type', 'page')
            dom.setAttribute('data-page-id', updatedNode.attrs.pageId)
          } else {
            pageLink.style.display = 'none'
            pageOverlay.style.display = 'none'
            button.style.display = ''
            dom.removeAttribute('data-page-id')
            dom.setAttribute('data-block-type', updatedNode.attrs.blockType || 'paragraph')

            button.dataset.arrow = hasChildToggles(updatedNode)
              ? (updatedNode.attrs.isOpen ? '▼' : '▶')
              : (updatedNode.attrs.isOpen ? '▽' : '▷')
            contentWrapper.className = updatedNode.attrs.isOpen
              ? 'toggle-content open'
              : 'toggle-content closed'
            dom.setAttribute('data-is-open', updatedNode.attrs.isOpen)

            // Todo checkbox update
            if (updatedNode.attrs.isTodo) {
              checkbox.style.display = ''
              checkbox.classList.toggle('checked', updatedNode.attrs.todoChecked && !updatedNode.attrs.todoStatus)
              dom.classList.toggle('toggle-todo-checked', updatedNode.attrs.todoChecked && !updatedNode.attrs.todoStatus)
              updateStatusIcon(updatedNode.attrs.todoStatus)
            } else {
              checkbox.style.display = 'none'
              checkbox.classList.remove('checked')
              dom.classList.remove('toggle-todo-checked')
              updateStatusIcon(null)
            }
          }

          // 배경색 업데이트
          if (updatedNode.attrs.backgroundColor) {
            dom.setAttribute('data-bg-color', updatedNode.attrs.backgroundColor)
            dom.style.setProperty('background-color', updatedNode.attrs.backgroundColor, 'important')
          } else {
            dom.removeAttribute('data-bg-color')
            dom.style.removeProperty('background-color')
          }

          // Decoration 반영 (Plugin이 전달한 포커스 상태)
          dom.classList.toggle('toggle-block-focused', hasFocusClass(outerDecorations))
          dom.classList.toggle('toggle-checkbox-focused', hasCheckboxFocusClass(outerDecorations))
          dom.classList.toggle('toggle-block-multiselected', hasMultiSelectClass(outerDecorations))

          return true
        },
        destroy: () => {
          clearDropTimers()
          if (statusPopup.parentElement) statusPopup.remove()
          document.removeEventListener('mousedown', handleDocClickForPopup)
        },
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      // 블록 드래그 중 텍스트 선택 방지 (createSelectionBetween — ProseMirror 정식 API)
      new Plugin({
        key: blockDragPluginKey,
        state: {
          init() { return { dragging: false } },
          apply(tr, value) {
            const meta = tr.getMeta(blockDragPluginKey)
            if (meta !== undefined) return { dragging: meta }
            return value
          },
        },
        props: {
          createSelectionBetween(view) {
            const pluginState = blockDragPluginKey.getState(view.state)
            if (pluginState?.dragging) return view.state.selection
            return null
          },
        },
      }),
      // 토글 클립보드 처리
      new Plugin({
        props: {
          // 복사 시 블록 단위 보장 (인라인 병합 방지)
          transformCopied(slice) {
            if (slice.content.firstChild?.type.name === 'toggle') {
              return new Slice(slice.content, 0, 0)
            }
            return slice
          },
          // 붙여넣기 시 블록 단위 보장
          transformPasted(slice) {
            if (slice.content.firstChild?.type.name === 'toggle') {
              // 단일 토글 체인(toggle > toggle > ... > paragraph) = 텍스트 복사 → 래퍼 벗기기
              if (slice.content.childCount === 1) {
                let node = slice.content.firstChild
                while (node.type.name === 'toggle' && node.childCount === 1) {
                  node = node.firstChild
                }
                if (node.type.name === 'paragraph') {
                  return new Slice(Fragment.from(node), 0, 0)
                }
              }
              return new Slice(slice.content, 0, 0)
            }
            return slice
          },
          // 토글 안에서 붙여넣기 → 형제 레벨로 삽입
          handlePaste(view, event, slice) {
            const { state } = view
            const { $from } = state.selection
            const toggleDepth = findToggleDepth($from)
            if (toggleDepth === -1) return false

            const togglePos = $from.before(toggleDepth)
            const toggleNode = state.doc.nodeAt(togglePos)
            const afterTogglePos = togglePos + toggleNode.nodeSize

            // 토글 블록 붙여넣기 → 현재 토글의 형제로 삽입
            if (slice.content.firstChild?.type.name === 'toggle') {
              const { tr } = state
              tr.insert(afterTogglePos, slice.content)
              view.dispatch(tr)
              return true
            }

            // 단일 블록 → 인라인 삽입
            if (slice.content.childCount <= 1) {
              const first = slice.content.firstChild
              if (first?.content && first.content.size > 0) {
                const { tr } = state
                tr.insert($from.pos, first.content)
                view.dispatch(tr)
                return true
              }
              return false
            }

            // 여러 블록 → 첫 블록 인라인은 커서에, 나머지는 형제 토글로
            const { tr } = state
            const children = []
            slice.content.forEach(node => children.push(node))

            const first = children[0]
            if (first.isTextblock && first.content.size > 0) {
              tr.insert($from.pos, first.content)
            }

            const schema = state.schema
            const todoAttrs = toggleNode.attrs.isTodo
              ? { isTodo: true, todoChecked: false }
              : {}

            const wrapInToggle = (node) => {
              if (node.type.name === 'toggle') return node
              const para = node.type.name === 'paragraph'
                ? node
                : schema.nodes.paragraph.create(null,
                    node.isTextblock ? node.content
                      : (node.textContent ? [schema.text(node.textContent)] : []))
              return schema.nodes.toggle.create({ isOpen: true, ...todoAttrs }, para)
            }

            const newToggles = children.slice(1).map(wrapInToggle)
            if (newToggles.length > 0) {
              tr.insert(tr.mapping.map(afterTogglePos), Fragment.from(newToggles))
            }

            view.dispatch(tr)
            return true
          },
          // 텍스트 드래그 → 토글에 드롭 시 중첩 방지 (handlePaste와 동일한 원리)
          handleDrop(view, event, slice, moved) {
            // 토글 블록 드롭 폴백: NodeView drop이 잡지 못한 케이스(빈 영역 드롭,
            // 토글 외부 드롭 등)를 여기서 처리하여 PM 기본 드롭 핸들러가
            // 토글을 bare paragraph로 분해하지 못하도록 차단
            if (slice.content.firstChild?.type.name === 'toggle') {
              const isBlockDrag = event.dataTransfer.types.includes('application/x-thinkmap-block')
                || (view.dragging && view.state.selection instanceof NodeSelection)
                || window.__crossPaneDrag
              if (!isBlockDrag) return false // 외부 HTML 드롭 등은 PM에 위임

              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
              if (!coords) {
                view.dragging = null
                window.__crossPaneDrag = null
                return true // 위치 못 찾음 — 드롭 무시 (PM 기본 차단)
              }

              const { state } = view
              const $coordPos = state.doc.resolve(coords.pos)

              // 드롭 위치가 토글 안이면 그 (가장 깊은) 토글의 형제로 삽입
              // 토글 밖이면 해당 위치에 직접 삽입
              let insertPos = coords.pos
              for (let d = $coordPos.depth; d > 0; d--) {
                if ($coordPos.node(d).type.name === 'toggle') {
                  insertPos = $coordPos.after(d)
                  break
                }
              }

              // 소스 위치 파악
              let sourcePos = null
              let sourceSize = null
              const sel = state.selection
              if (sel instanceof NodeSelection && sel.node?.type.name === 'toggle') {
                sourcePos = sel.from
                sourceSize = sel.node.nodeSize
              }
              const crossDrag = window.__crossPaneDrag
              if (crossDrag && crossDrag.sourceEditor === view) {
                sourcePos = crossDrag.sourcePos
                sourceSize = crossDrag.nodeSize
              }

              // 자기 자신 위/안에 드롭이면 무시
              if (sourcePos != null && sourceSize != null
                  && insertPos >= sourcePos && insertPos <= sourcePos + sourceSize) {
                view.dragging = null
                window.__crossPaneDrag = null
                return true
              }

              try {
                const { tr } = state
                if (sourcePos != null && sourceSize != null
                    && (!crossDrag || crossDrag.sourceEditor === view)) {
                  tr.delete(sourcePos, sourcePos + sourceSize)
                }
                const mappedInsert = tr.mapping.map(insertPos)
                tr.insert(mappedInsert, slice.content)
                tr.setMeta('toggleButtonClick', true)
                view.dispatch(tr)
              } catch (err) {
                console.error('블록 드롭 폴백 오류:', err)
              }

              // 크로스 패널: 소스 에디터에서 삭제
              if (crossDrag && crossDrag.sourceEditor !== view) {
                try {
                  const { sourceEditor, sourcePos: sp, nodeSize: ns } = crossDrag
                  const srcNode = sourceEditor.state.doc.nodeAt(sp)
                  if (srcNode && srcNode.nodeSize === ns) {
                    sourceEditor.view.dispatch(sourceEditor.state.tr.delete(sp, sp + ns))
                  }
                } catch (err) { console.error('크로스 패널 소스 삭제 오류:', err) }
              }

              view.dragging = null
              window.__crossPaneDrag = null
              return true
            }

            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (!pos) return false

            const { state } = view
            const $pos = state.doc.resolve(pos.pos)
            const toggleDepth = findToggleDepth($pos)
            if (toggleDepth === -1) return false

            // 텍스트 콘텐츠를 인라인으로 삽입 (ProseMirror fitting 우회)
            const { tr } = state
            if (moved) tr.deleteSelection()

            const mapped = tr.mapping.map(pos.pos)
            const contents = []
            slice.content.forEach(node => {
              if (node.content && node.content.size > 0) contents.push(node.content)
            })
            if (contents.length === 0) return false

            let insertAt = mapped
            for (const c of contents) {
              tr.insert(insertAt, c)
              insertAt = tr.mapping.map(insertAt)
            }

            view.dispatch(tr)
            return true
          },
        },
      }),
      // CheckboxSelection: decoration + 스페이스바 토글
      new Plugin({
        props: {
          decorations(state) {
            if (!(state.selection instanceof CheckboxSelection)) return DecorationSet.empty
            const { togglePos } = state.selection
            const node = state.doc.nodeAt(togglePos)
            if (!node) return DecorationSet.empty
            return DecorationSet.create(state.doc, [
              Decoration.node(togglePos, togglePos + node.nodeSize, {
                class: 'toggle-checkbox-focused',
              }),
            ])
          },
          handleKeyDown(view, event) {
            if (!(view.state.selection instanceof CheckboxSelection)) return false
            if (event.key !== ' ') return false

            event.preventDefault()
            const { togglePos } = view.state.selection
            const node = view.state.doc.nodeAt(togglePos)
            if (!node) return false

            const { tr } = view.state
            tr.setNodeMarkup(togglePos, null, { ...node.attrs, todoChecked: !node.attrs.todoChecked })
            tr.setSelection(new CheckboxSelection(tr.doc.resolve(togglePos + 2), togglePos))
            view.dispatch(tr)
            return true
          }
        }
      }),
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          // 선택 변경이 있는 트랜잭션에서만 실행
          if (!transactions.some(tr => tr.selectionSet || tr.docChanged)) return null

          // 버튼 클릭으로 직접 토글한 경우 자동 열기 건너뜀
          if (transactions.some(tr => tr.getMeta('toggleButtonClick'))) return null

          const { $from } = newState.selection

          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node.type.name === 'toggle' && !node.attrs.isOpen) {
              // 커서가 첫 번째 자식(paragraph) 안에 있으면 자동 열기 안함
              // paragraph는 닫힌 상태에서도 CSS로 보이므로 커서 이동은 정상
              const toggleStart = $from.before(d)
              const paragraphEnd = toggleStart + 1 + node.child(0).nodeSize
              if ($from.pos < paragraphEnd) break

              if (hasChildToggles(node)) {
                const tr = newState.tr
                tr.setNodeMarkup(toggleStart, null, { ...node.attrs, isOpen: true })
                return tr
              }
              break
            }
          }

          return null
        },
      }),
      // 토글 정규화 안전망: 토글 내부의 bare paragraph(첫 자식 외)를 자동으로 토글로 감싸기
      // 어떤 경로(드롭 실패, 외부 붙여넣기, 버그성 트랜잭션 등)로든 토글이 분해되어
      // bare paragraph가 비정상 위치에 생성되면 즉시 복구하여 데이터 무결성 유지
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null

          const violations = []
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'toggle') return true
            // 첫 자식(헤더 paragraph)을 건너뛰고 나머지 자식 검사
            let childPos = pos + 1
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i)
              if (i > 0 && child.type.name === 'paragraph') {
                violations.push({ pos: childPos, paragraph: child })
              }
              childPos += child.nodeSize
            }
            return true
          })

          if (violations.length === 0) return null

          const tr = newState.tr
          // 뒤에서부터 처리 — 앞쪽 위치를 안정적으로 유지
          for (let i = violations.length - 1; i >= 0; i--) {
            const { pos, paragraph } = violations[i]
            const wrapped = newState.schema.nodes.toggle.create(
              { isOpen: true },
              paragraph
            )
            tr.replaceWith(pos, pos + paragraph.nodeSize, wrapped)
          }
          tr.setMeta('toggleNormalize', true)
          return tr
        },
      }),
      // 스페이스바: 토글 화살표(NodeSelection) → 열기/닫기
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            if (event.key !== ' ') return false
            const { state } = view
            const { selection } = state

            if (!(selection instanceof NodeSelection)) return false
            if (selection.node.type.name !== 'toggle') return false

            const pos = selection.from
            const node = selection.node
            const willOpen = !node.attrs.isOpen
            const { tr } = state
            tr.setNodeMarkup(pos, null, { ...node.attrs, isOpen: willOpen })

            // 열 때 하위 토글이 없으면 빈 하위 토글 자동 생성
            if (willOpen && !hasChildToggles(node)) {
              const insertPos = pos + node.nodeSize - 1
              tr.insert(insertPos, state.schema.nodeFromJSON(emptyToggleJSON(true, true)))
            }

            tr.setMeta('toggleButtonClick', true)
            view.dispatch(tr)

            // DOM 업데이트 후 선택 복원
            requestAnimationFrame(() => {
              const tr2 = view.state.tr
              tr2.setSelection(NodeSelection.create(view.state.doc, pos))
              tr2.setMeta('toggleButtonClick', true)
              view.dispatch(tr2)
            })
            return true
          },
        },
      }),
      // 커서가 위치한 가장 가까운(가장 안쪽) 토글 블록에 포커스 decoration
      new Plugin({
        key: focusHighlightPluginKey,
        state: {
          init() { return { active: true } },
          apply(tr, value) {
            const meta = tr.getMeta(focusHighlightPluginKey)
            if (meta?.type === 'deactivate') return { active: false }
            if (meta?.type === 'activate') return { active: true }
            return value
          },
        },
        props: {
          handleClick(view, pos, event) {
            // 클릭한 곳이 토글 내부인지 확인
            const $pos = view.state.doc.resolve(pos)
            const insideToggle = findToggleDepth($pos) !== -1
            if (insideToggle) {
              // 토글 내부 클릭 → 활성화
              const pluginState = focusHighlightPluginKey.getState(view.state)
              if (!pluginState?.active) {
                view.dispatch(view.state.tr.setMeta(focusHighlightPluginKey, { type: 'activate' }))
              }
            } else {
              // 토글 바깥 클릭 → 비활성화
              view.dispatch(view.state.tr.setMeta(focusHighlightPluginKey, { type: 'deactivate' }))
            }
            return false // 이벤트는 계속 전파
          },
          decorations(state) {
            const pluginState = focusHighlightPluginKey.getState(state)
            if (!pluginState?.active) return DecorationSet.empty

            const { selection } = state
            let pos = -1

            // NodeSelection: 선택된 토글 자체
            if (selection instanceof NodeSelection && selection.node.type.name === 'toggle') {
              pos = selection.from
            }
            // CheckboxSelection: 해당 토글
            else if (selection instanceof CheckboxSelection) {
              pos = selection.togglePos
            }
            // TextSelection: 커서가 위치한 가장 안쪽 토글
            else {
              const { $from } = selection
              const depth = findToggleDepth($from)
              if (depth !== -1) pos = $from.before(depth)
            }

            if (pos === -1) return DecorationSet.empty
            const node = state.doc.nodeAt(pos)
            if (!node) return DecorationSet.empty

            return DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'toggle-block-focused',
              }),
            ])
          },
        },
      }),
      // 멀티셀렉트 플러그인: 여러 블록 동시 선택
      new Plugin({
        key: multiSelectPluginKey,
        // document 레벨 copy/cut 리스너 (포커스 위치 무관하게 동작)
        view(editorView) {
          const handleCopy = (event) => {
            const filtered = collectMultiSelectedNodes(editorView.state)
            if (filtered.length === 0) return
            handleMultiSelectCopy(editorView, event, false)
          }
          const handleCut = (event) => {
            const filtered = collectMultiSelectedNodes(editorView.state)
            if (filtered.length === 0) return
            handleMultiSelectCopy(editorView, event, true)
          }
          document.addEventListener('copy', handleCopy)
          document.addEventListener('cut', handleCut)
          return {
            destroy() {
              document.removeEventListener('copy', handleCopy)
              document.removeEventListener('cut', handleCut)
            }
          }
        },
        state: {
          init() {
            return { selectedPositions: [], lastClickedPos: null }
          },
          apply(tr, prevState) {
            const meta = tr.getMeta(multiSelectPluginKey)
            if (meta) {
              switch (meta.type) {
                case 'toggle': {
                  const pos = meta.pos
                  const existing = prevState.selectedPositions.includes(pos)
                  return {
                    selectedPositions: existing
                      ? prevState.selectedPositions.filter(p => p !== pos)
                      : [...prevState.selectedPositions, pos],
                    lastClickedPos: pos
                  }
                }
                case 'set':
                  return {
                    selectedPositions: meta.positions,
                    lastClickedPos: meta.lastClickedPos ?? prevState.lastClickedPos
                  }
                case 'clear':
                  return { selectedPositions: [], lastClickedPos: null }
                default:
                  return prevState
              }
            }
            // 문서 변경 시 위치 매핑
            if (tr.docChanged && prevState.selectedPositions.length > 0) {
              const mapped = prevState.selectedPositions
                .map(pos => tr.mapping.map(pos))
                .filter(pos => {
                  const node = tr.doc.nodeAt(pos)
                  return node && node.type.name === 'toggle'
                })
              if (mapped.length === 0) return { selectedPositions: [], lastClickedPos: null }
              return { ...prevState, selectedPositions: mapped }
            }
            return prevState
          }
        },
        props: {
          decorations(state) {
            const pluginState = multiSelectPluginKey.getState(state)
            if (!pluginState || pluginState.selectedPositions.length === 0) return DecorationSet.empty
            const decos = []
            pluginState.selectedPositions.forEach(pos => {
              const node = state.doc.nodeAt(pos)
              if (node && node.type.name === 'toggle') {
                decos.push(Decoration.node(pos, pos + node.nodeSize, {
                  class: 'toggle-block-multiselected'
                }))
              }
            })
            return DecorationSet.create(state.doc, decos)
          },
          handleClick(view, pos, event) {
            // 일반 클릭 → 멀티셀렉트 해제
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
              const pluginState = multiSelectPluginKey.getState(view.state)
              if (pluginState && pluginState.selectedPositions.length > 0) {
                view.dispatch(view.state.tr.setMeta(multiSelectPluginKey, { type: 'clear' }))
              }
            }
            return false
          },
          handleKeyDown(view, event) {
            const pluginState = multiSelectPluginKey.getState(view.state)
            if (!pluginState || pluginState.selectedPositions.length === 0) return false

            if (event.key === 'Escape') {
              view.dispatch(view.state.tr.setMeta(multiSelectPluginKey, { type: 'clear' }))
              return true
            }
            if (event.key === 'Delete' || event.key === 'Backspace') {
              return deleteMultiSelected(view.state, (tr) => view.dispatch(tr))
            }

            return false
          }
        }
      }),
    ]
  },

  addCommands() {
    return {
      setToggle: () => ({ editor, chain }) => {
        const { state } = editor
        const { selection } = state

        // 에디터가 비어있는지 확인 (doc에 빈 paragraph만 있는 경우)
        const isEmptyDoc = state.doc.content.size <= 2 ||
          (state.doc.childCount === 1 &&
           state.doc.firstChild?.type.name === 'paragraph' &&
           state.doc.firstChild?.content.size === 0)

        if (isEmptyDoc) {
          // 빈 에디터: 전체를 토글로 대체
          return chain()
            .clearContent()
            .insertContent(emptyToggleJSON())
            .focus()
            .run()
        }

        // 현재 블록 끝으로 이동 후 새 줄에 토글 삽입
        return chain()
          .insertContentAt(selection.to, emptyToggleJSON())
          .focus()
          .run()
      },
      toggleTodo: () => ({ editor }) => {
        const { state } = editor
        const { selection } = state
        let togglePos, toggleNode

        if (selection instanceof NodeSelection && selection.node.type.name === 'toggle') {
          togglePos = selection.from
          toggleNode = selection.node
        } else {
          const toggleDepth = findToggleDepth(state.selection.$from)
          if (toggleDepth === -1) return false
          togglePos = state.selection.$from.before(toggleDepth)
          toggleNode = state.doc.nodeAt(togglePos)
        }

        if (!toggleNode) return false

        const { tr } = state
        const newIsTodo = !toggleNode.attrs.isTodo
        tr.setNodeMarkup(togglePos, null, {
          ...toggleNode.attrs,
          isTodo: newIsTodo,
          todoChecked: newIsTodo ? toggleNode.attrs.todoChecked : false,
        })
        editor.view.dispatch(tr)
        return true
      },
      toggleToggle: () => ({ commands, editor }) => {
        const { state } = editor
        const { $from } = state.selection
        const node = $from.parent

        if (node.type.name === 'toggle') {
          return commands.updateAttributes('toggle', {
            isOpen: !node.attrs.isOpen,
          })
        }

        return false
      },

      // 멀티셀렉트: 체크박스(투두) 전환
      multiSelectConvertToTodo: () => ({ tr, state, dispatch }) => {
        const pluginState = multiSelectPluginKey.getState(state)
        if (!pluginState || pluginState.selectedPositions.length === 0) return false

        const allAreTodo = pluginState.selectedPositions.every(pos => {
          const node = state.doc.nodeAt(pos)
          return node && node.attrs.isTodo
        })

        pluginState.selectedPositions.forEach(pos => {
          const node = tr.doc.nodeAt(pos)
          if (node && node.type.name === 'toggle') {
            tr.setNodeMarkup(pos, null, {
              ...node.attrs,
              isTodo: !allAreTodo,
              todoChecked: !allAreTodo ? node.attrs.todoChecked : false
            })
          }
        })

        tr.setMeta(multiSelectPluginKey, { type: 'clear' })
        if (dispatch) dispatch(tr)
        return true
      },

      // 멀티셀렉트: 선택된 블록 삭제
      multiSelectDelete: () => ({ state, dispatch }) => {
        return deleteMultiSelected(state, dispatch)
      },

      // 멀티셀렉트: 선택 해제
      multiSelectClear: () => ({ editor }) => {
        editor.view.dispatch(
          editor.state.tr.setMeta(multiSelectPluginKey, { type: 'clear' })
        )
        return true
      },

      // paragraph, orderedList, bulletList → toggle 변환 (heading/codeBlock 등은 유지)
      convertAllToToggle: () => ({ editor }) => {
        const json = editor.getJSON()
        if (!json?.content) return false

        const newContent = []
        json.content.forEach(node => newContent.push(...convertNodeToTogglesJSON(node)))

        editor.commands.setContent({ ...json, content: newContent })
        return true
      },
    }
  },

  addKeyboardShortcuts() {
    // 커서가 paragraph 끝에 있을 때: 열린 토글이면 하위 첫 위치에, 아니면 형제 위치에 새 토글 삽입
    function handleEnterAtEnd(editor, $from, toggleDepth, toggleNode, togglePos, afterTogglePos) {
      const newAttrs = toggleNode.attrs.isTodo ? { isTodo: true, todoChecked: false } : {}
      if (toggleNode.attrs.isOpen && hasChildToggles(toggleNode)) {
        const paragraphNode = $from.node(toggleDepth + 1)
        const firstChildPos = togglePos + 1 + paragraphNode.nodeSize
        editor.chain()
          .insertContentAt(firstChildPos, emptyToggleJSON(true, false, newAttrs))
          .focus(firstChildPos + 2)
          .run()
        return true
      }
      editor.chain()
        .insertContentAt(afterTogglePos, emptyToggleJSON(true, false, newAttrs))
        .focus(afterTogglePos + 2)
        .run()
      return true
    }

    // 커서가 paragraph 중간에 있을 때: 이후 내용을 잘라서 새 토글로 분리
    function handleEnterAtMiddle(editor, $from, toggleDepth, afterTogglePos, paragraphEnd, toggleNode) {
      const { state } = editor
      const paragraphNode = $from.node(toggleDepth + 1)
      const offsetInParagraph = $from.pos - $from.start(toggleDepth + 1)
      const afterContent = paragraphNode.cut(offsetInParagraph).content.toJSON()

      const newAttrs = { isOpen: true }
      if (toggleNode.attrs.isTodo) {
        newAttrs.isTodo = true
        newAttrs.todoChecked = false
      }

      const { tr } = state
      tr.delete($from.pos, paragraphEnd)
      const newInsertPos = afterTogglePos - (paragraphEnd - $from.pos)
      tr.insert(
        newInsertPos,
        state.schema.nodeFromJSON({
          type: 'toggle',
          attrs: newAttrs,
          content: [{ type: 'paragraph', content: afterContent || [] }]
        })
      )
      tr.setSelection(TextSelection.near(tr.doc.resolve(newInsertPos + 2)))
      editor.view.dispatch(tr)
      return true
    }

    return {
      'Mod-Shift-t': () => this.editor.commands.setToggle(),

      // Cmd/Ctrl+A: 현재 토글 블록 내 텍스트만 선택
      'Mod-a': ({ editor }) => {
        const { state } = editor
        const { $from, $to } = state.selection
        const toggleDepth = findToggleDepth($from)
        if (toggleDepth === -1) return false

        const togglePos = $from.before(toggleDepth)
        const toggleNode = state.doc.nodeAt(togglePos)
        if (!toggleNode) return false

        // 첫 번째 paragraph(헤더)의 범위
        const paragraphStart = $from.start(toggleDepth + 1)
        const paragraphEnd = $from.end(toggleDepth + 1)

        // 이미 현재 paragraph 전체가 선택되어 있으면 → 토글 전체(하위 포함) 선택
        const isFullParagraphSelected =
          $from.pos === paragraphStart && $to.pos === paragraphEnd

        if (isFullParagraphSelected) {
          // 토글 블록 전체 범위 선택 (첫 paragraph 시작 ~ 마지막 자식 끝)
          const toggleEnd = togglePos + toggleNode.nodeSize - 1
          const { tr } = state
          tr.setSelection(TextSelection.create(state.doc, paragraphStart, toggleEnd))
          editor.view.dispatch(tr)
          return true
        }

        // 현재 paragraph 전체 선택
        const { tr } = state
        tr.setSelection(TextSelection.create(state.doc, paragraphStart, paragraphEnd))
        editor.view.dispatch(tr)
        return true
      },

      // 엔터: 커서 위치에서 토글 분리
      'Enter': ({ editor }) => {
        const { state } = editor
        const { selection } = state

        // 토글 화살표/체크박스 선택 상태에서는 아무 동작 안 함
        if (selection instanceof NodeSelection || selection instanceof CheckboxSelection) return true

        const { $from } = selection
        const toggleDepth = findToggleDepth($from)
        if (toggleDepth === -1) return false

        const togglePos = $from.before(toggleDepth)
        const toggleNode = state.doc.nodeAt(togglePos)
        const afterTogglePos = togglePos + toggleNode.nodeSize
        const paragraphStart = $from.start(toggleDepth + 1)
        const paragraphEnd = $from.end(toggleDepth + 1)

        // paragraph 맨 앞에서 Enter → 현재 토글 앞에 빈 토글 삽입, 커서는 원래 텍스트에 유지
        if ($from.pos === paragraphStart) {
          const newAttrs = toggleNode.attrs.isTodo ? { isTodo: true, todoChecked: false } : {}
          const emptyNode = state.schema.nodeFromJSON(emptyToggleJSON(true, false, newAttrs))
          const { tr } = state
          tr.insert(togglePos, emptyNode)
          tr.setSelection(TextSelection.near(tr.doc.resolve(togglePos + emptyNode.nodeSize + 2)))
          editor.view.dispatch(tr)
          return true
        }

        if ($from.pos >= paragraphEnd)
          return handleEnterAtEnd(editor, $from, toggleDepth, toggleNode, togglePos, afterTogglePos)
        return handleEnterAtMiddle(editor, $from, toggleDepth, afterTogglePos, paragraphEnd, toggleNode)
      },

      // Shift+엔터: 블록 내부에서 줄바꿈 (soft break)
      'Shift-Enter': ({ editor }) => {
        return editor.commands.setHardBreak()
      },

      // 왼쪽 화살표: paragraph 시작 → CheckboxSelection → NodeSelection
      'ArrowLeft': ({ editor }) => {
        const { state } = editor
        const { selection } = state

        // CheckboxSelection → 토글 화살표 선택 (NodeSelection)
        if (selection instanceof CheckboxSelection) {
          const { tr } = state
          tr.setSelection(NodeSelection.create(state.doc, selection.togglePos))
          editor.view.dispatch(tr)
          return true
        }

        const { $from, empty } = selection
        if (!empty) return false

        const toggleDepth = findToggleDepth($from)
        if (toggleDepth === -1) return false

        const togglePos = $from.before(toggleDepth)
        const toggleNode = state.doc.nodeAt(togglePos)
        const paragraphStart = $from.start(toggleDepth + 1)

        if ($from.pos === paragraphStart) {
          // 투두 토글이면 CheckboxSelection
          if (toggleNode && toggleNode.attrs.isTodo) {
            const { tr } = state
            tr.setSelection(new CheckboxSelection(state.doc.resolve(togglePos + 2), togglePos))
            editor.view.dispatch(tr)
            return true
          }
          // 일반 토글이면 NodeSelection
          const { tr } = state
          tr.setSelection(NodeSelection.create(state.doc, togglePos))
          editor.view.dispatch(tr)
          return true
        }

        return false
      },

      // 오른쪽 화살표: CheckboxSelection/NodeSelection → paragraph 시작
      'ArrowRight': ({ editor }) => {
        const { state } = editor
        const { selection } = state

        // CheckboxSelection → paragraph 시작으로 복귀
        if (selection instanceof CheckboxSelection) {
          const { tr } = state
          tr.setSelection(TextSelection.create(state.doc, selection.togglePos + 2))
          editor.view.dispatch(tr)
          return true
        }

        // NodeSelection → 내부 paragraph 시작
        if (!(selection instanceof NodeSelection)) return false
        if (selection.node.type.name !== 'toggle') return false

        const insidePos = selection.from + 2
        const { tr } = state
        tr.setSelection(TextSelection.create(state.doc, insidePos))
        editor.view.dispatch(tr)
        return true
      },

      // 위 화살표: CheckboxSelection → 이전 todo 체크박스, NodeSelection → 토글 닫기
      'ArrowUp': ({ editor }) => {
        const { state } = editor
        const { selection } = state

        // CheckboxSelection → 이전 보이는 블록으로 이동
        if (selection instanceof CheckboxSelection) {
          const positions = collectVisiblePositions(state.doc)
          const currentIdx = positions.indexOf(selection.togglePos)
          if (currentIdx > 0) {
            const prevPos = positions[currentIdx - 1]
            const prevNode = state.doc.nodeAt(prevPos)
            if (prevNode && prevNode.type.name === 'toggle' && prevNode.attrs.isTodo) {
              const { tr } = state
              tr.setSelection(new CheckboxSelection(state.doc.resolve(prevPos + 2), prevPos))
              editor.view.dispatch(tr)
              return true
            }
            const { tr } = state
            const targetPos = prevPos + (prevNode.type.name === 'toggle' ? 2 : 1)
            tr.setSelection(TextSelection.near(state.doc.resolve(targetPos), 1))
            editor.view.dispatch(tr)
            return true
          }
          return false
        }

        if (!(selection instanceof NodeSelection)) return false
        if (selection.node.type.name !== 'toggle') return false

        // 이전 보이는 블록의 토글 화살표로 이동
        const positions = collectVisiblePositions(state.doc)
        const currentIdx = positions.indexOf(selection.from)
        if (currentIdx > 0) {
          const prevPos = positions[currentIdx - 1]
          const prevNode = state.doc.nodeAt(prevPos)
          if (prevNode && prevNode.type.name === 'toggle') {
            const { tr } = state
            tr.setSelection(NodeSelection.create(state.doc, prevPos))
            editor.view.dispatch(tr)
            return true
          }
          // 토글이 아닌 블록이면 텍스트 커서
          const { tr } = state
          tr.setSelection(TextSelection.near(state.doc.resolve(prevPos + 1), 1))
          editor.view.dispatch(tr)
          return true
        }
        return false
      },

      // 아래 화살표: CheckboxSelection/NodeSelection → 다음 보이는 블록
      'ArrowDown': ({ editor }) => {
        const { state } = editor
        const { selection } = state

        // CheckboxSelection → 다음 보이는 블록으로 이동
        if (selection instanceof CheckboxSelection) {
          const positions = collectVisiblePositions(state.doc)
          const currentIdx = positions.indexOf(selection.togglePos)
          if (currentIdx !== -1 && currentIdx < positions.length - 1) {
            const nextPos = positions[currentIdx + 1]
            const nextNode = state.doc.nodeAt(nextPos)
            if (nextNode && nextNode.type.name === 'toggle' && nextNode.attrs.isTodo) {
              const { tr } = state
              tr.setSelection(new CheckboxSelection(state.doc.resolve(nextPos + 2), nextPos))
              editor.view.dispatch(tr)
              return true
            }
            const { tr } = state
            const targetPos = nextPos + (nextNode.type.name === 'toggle' ? 2 : 1)
            tr.setSelection(TextSelection.near(state.doc.resolve(targetPos), 1))
            editor.view.dispatch(tr)
            return true
          }
          return false
        }

        if (!(selection instanceof NodeSelection)) return false
        if (selection.node.type.name !== 'toggle') return false

        // 다음 보이는 블록의 토글 화살표로 이동
        const positions = collectVisiblePositions(state.doc)
        const currentIdx = positions.indexOf(selection.from)
        if (currentIdx !== -1 && currentIdx < positions.length - 1) {
          const nextPos = positions[currentIdx + 1]
          const nextNode = state.doc.nodeAt(nextPos)
          if (nextNode && nextNode.type.name === 'toggle') {
            const { tr } = state
            tr.setSelection(NodeSelection.create(state.doc, nextPos))
            editor.view.dispatch(tr)
            return true
          }
          // 토글이 아닌 블록이면 텍스트 커서
          const { tr } = state
          tr.setSelection(TextSelection.near(state.doc.resolve(nextPos + 1), 1))
          editor.view.dispatch(tr)
          return true
        }
        return false
      },

      // Tab: 위 토글의 하위로 들여쓰기
      'Tab': ({ editor }) => {
        const { state } = editor
        const { $from } = state.selection

        const toggleDepth = findToggleDepth($from)
        if (toggleDepth === -1) return false

        const togglePos = $from.before(toggleDepth)
        const toggleNode = state.doc.nodeAt(togglePos)

        // 이전 형제 노드 찾기
        const $togglePos = state.doc.resolve(togglePos)
        const indexInParent = $togglePos.index($togglePos.depth)

        if (indexInParent === 0) {
          // 첫번째 자식이면 들여쓰기 불가
          return true
        }

        // 이전 형제 위치 계산
        const prevSiblingPos = $togglePos.posAtIndex(indexInParent - 1, $togglePos.depth)
        const prevSibling = state.doc.nodeAt(prevSiblingPos)

        if (!prevSibling || prevSibling.type.name !== 'toggle') {
          // 이전 형제가 토글이 아니면 들여쓰기 불가
          return true
        }

        // 이전 토글을 열고, 현재 토글을 이전 토글 끝에 삽입 후 원래 위치에서 삭제
        const tr = state.tr

        // 이전 토글이 닫혀있으면 열기
        if (!prevSibling.attrs.isOpen) {
          tr.setNodeMarkup(prevSiblingPos, null, { ...prevSibling.attrs, isOpen: true })
        }

        // 먼저 이전 토글의 끝에 삽입
        const insertPos = prevSiblingPos + prevSibling.nodeSize - 1
        tr.insert(insertPos, toggleNode)

        // 삽입 후 매핑된 위치에서 원래 토글 삭제
        const mappedTogglePos = tr.mapping.map(togglePos)
        tr.delete(mappedTogglePos, mappedTogglePos + toggleNode.nodeSize)

        // tr.doc에서 이동된 토글의 paragraph 위치를 직접 계산
        const newPrevPos = tr.mapping.map(prevSiblingPos)
        const newPrev = tr.doc.nodeAt(newPrevPos)
        if (newPrev) {
          let lastChildStart = newPrevPos + 1
          for (let i = 0; i < newPrev.childCount - 1; i++) {
            lastChildStart += newPrev.child(i).nodeSize
          }
          tr.setSelection(TextSelection.near(tr.doc.resolve(lastChildStart + 2)))
        }

        editor.view.dispatch(tr)
        return true
      },

      // Backspace: 멀티셀렉트 삭제 우선, 그 외 토글 첫 위치 방지
      'Backspace': ({ editor }) => {
        const { state } = editor

        // 멀티셀렉트 상태면 선택된 블록 삭제
        const multiState = multiSelectPluginKey.getState(state)
        if (multiState && multiState.selectedPositions.length > 0) {
          return deleteMultiSelected(state, (tr) => editor.view.dispatch(tr))
        }

        const { $from, empty } = state.selection

        if (!empty) return false

        const toggleDepth = findToggleDepth($from)
        if (toggleDepth === -1) return false

        const togglePos = $from.before(toggleDepth)
        const toggleNode = state.doc.nodeAt(togglePos)
        if (!toggleNode) return false

        // 커서가 블록 시작 위치에 있는지 확인
        const blockStart = $from.start(toggleDepth + 1)
        if ($from.pos !== blockStart) return false

        // 토글의 첫 번째 자식(index 0)인 경우에만 토글 해제 방지
        const indexInToggle = $from.index(toggleDepth)
        if (indexInToggle > 0) return false // 두 번째 이후 자식은 기본 동작 허용

        if ($from.pos === blockStart) {
          // 투두 토글이면 먼저 투두 해제
          if (toggleNode.attrs.isTodo) {
            const { tr } = state
            tr.setNodeMarkup(togglePos, null, { ...toggleNode.attrs, isTodo: false, todoChecked: false })
            editor.view.dispatch(tr)
            return true
          }

          // 첫 번째 paragraph이 비어있고 하위 토글이 없으면 → 토글 블록 삭제
          const firstChild = toggleNode.firstChild
          const isEmpty = firstChild && firstChild.content.size === 0 && !hasChildToggles(toggleNode)

          if (isEmpty) {
            // 이전 블록이 없으면 삭제 방지 (문서 첫 블록)
            if (togglePos === 0) return true
            // 고정 섹션 삭제 방지
            if (toggleNode.attrs.isFixedSection) return true

            const { tr } = state
            tr.delete(togglePos, togglePos + toggleNode.nodeSize)
            // 커서를 이전 블록 끝으로 이동
            if (togglePos > 0) {
              tr.setSelection(TextSelection.near(tr.doc.resolve(togglePos), -1))
            }
            editor.view.dispatch(tr)
            return true
          }

          // 내용이 있으면 → 토글 해제하고 이전 블록에 병합
          if (togglePos === 0) {
            // 문서 첫 블록이면 토글만 해제 (일반 paragraph로 변환)
            const { tr } = state
            const content = toggleNode.content
            const insertNodes = []
            toggleNode.forEach((child) => {
              insertNodes.push(child)
            })
            tr.delete(togglePos, togglePos + toggleNode.nodeSize)
            for (let i = insertNodes.length - 1; i >= 0; i--) {
              tr.insert(togglePos, insertNodes[i])
            }
            tr.setSelection(TextSelection.near(tr.doc.resolve(togglePos + 1)))
            editor.view.dispatch(tr)
            return true
          }

          // 이전 블록이 있으면 → 첫 paragraph 내용을 이전 블록 끝에 병합
          const { tr } = state
          const firstChildContent = firstChild.content

          // 삭제 전에 이전 블록 정보를 먼저 찾기
          const $toggle = state.doc.resolve(togglePos)
          if ($toggle.depth === 0 && $toggle.index(0) === 0) {
            // 문서 첫 블록 — 위에서 이미 처리했으므로 여기 오면 안 됨
            return true
          }

          // 이전 형제 블록 찾기
          let prevNodeEnd = togglePos  // 이전 블록의 끝 위치 = 현재 토글의 시작
          const $before = state.doc.resolve(togglePos - 1)
          // 이전 블록의 시작 위치
          const prevNodeStart = $before.before($before.depth)
          const prevNode = state.doc.nodeAt(prevNodeStart)

          if (!prevNode) {
            return true
          }

          // 병합 대상 찾기: 이전 블록이 토글이면 재귀적으로 가장 깊은 마지막 자식 찾기
          let mergePos
          const togglesToOpen = [] // 접혀있는 토글들을 열어야 함

          if (prevNode.type.name === 'toggle') {
            // 재귀적으로 가장 깊은 마지막 자식 블록 찾기
            let currentNode = prevNode
            let currentStart = prevNodeStart

            while (currentNode.type.name === 'toggle') {
              // 접혀있으면 열어야 함
              if (!currentNode.attrs.isOpen) {
                togglesToOpen.push(currentStart)
              }

              if (hasChildToggles(currentNode)) {
                // 마지막 자식 토글 찾기
                let lastToggleIndex = -1
                for (let i = currentNode.childCount - 1; i >= 1; i--) {
                  if (currentNode.child(i).type.name === 'toggle') {
                    lastToggleIndex = i
                    break
                  }
                }
                // 마지막 토글의 위치 계산
                let offset = currentStart + 1 // toggle 노드 시작 + 1 (안으로)
                for (let i = 0; i < lastToggleIndex; i++) {
                  offset += currentNode.child(i).nodeSize
                }
                currentStart = offset
                currentNode = currentNode.child(lastToggleIndex)
              } else {
                // 하위 토글 없음 → 이 토글의 첫 paragraph 끝에 병합
                break
              }
            }

            // 최종 병합 대상의 첫 paragraph 끝
            if (currentNode.type.name === 'toggle') {
              mergePos = currentStart + 1 + currentNode.firstChild.nodeSize - 1
            } else {
              mergePos = currentStart + currentNode.nodeSize - 1
            }
          } else {
            // 일반 paragraph 등이면 그 내용 끝에 병합
            mergePos = prevNodeStart + prevNode.nodeSize - 1
          }

          // 접혀있는 토글들 열기 (위치가 변하지 않도록 먼저 처리)
          for (const openPos of togglesToOpen) {
            const node = tr.doc.nodeAt(openPos)
            if (node) {
              tr.setNodeMarkup(openPos, null, { ...node.attrs, isOpen: true })
            }
          }

          // 토글 전체 삭제
          const toggleEnd = togglePos + toggleNode.nodeSize
          tr.delete(togglePos, toggleEnd)

          // 첫 paragraph 내용 삽입
          if (firstChildContent.size > 0) {
            tr.insert(mergePos, firstChildContent)
          }

          // 하위 토글이 있으면 삭제된 위치에 삽입
          if (hasChildToggles(toggleNode)) {
            let insertPos = tr.mapping.map(togglePos)
            for (let i = 1; i < toggleNode.childCount; i++) {
              const child = toggleNode.child(i)
              tr.insert(insertPos, child)
              insertPos += child.nodeSize
            }
          }

          // 커서를 병합 경계(이전 블록 원래 끝)에 위치 — 삽입된 내용 앞
          const cursorPos = tr.mapping.map(mergePos, -1)
          tr.setSelection(TextSelection.create(tr.doc, cursorPos))

          editor.view.dispatch(tr)
          return true
        }

        return false
      },

      // Shift+Tab: 토글 밖으로 내어쓰기
      'Shift-Tab': ({ editor }) => {
        const { state } = editor
        const { $from } = state.selection

        const toggleDepth = findToggleDepth($from)
        if (toggleDepth === -1) return false

        const togglePos = $from.before(toggleDepth)
        const toggleNode = state.doc.nodeAt(togglePos)

        // 부모 토글 찾기
        let parentToggleDepth = -1
        for (let d = toggleDepth - 1; d > 0; d--) {
          const node = $from.node(d)
          if (node.type.name === 'toggle') {
            parentToggleDepth = d
            break
          }
        }

        if (parentToggleDepth === -1) {
          // 부모 토글이 없으면 내어쓰기 불가 (이미 최상위)
          return true
        }

        // 부모 토글 다음 위치에 현재 토글 이동
        const parentTogglePos = $from.before(parentToggleDepth)
        const parentToggleNode = state.doc.nodeAt(parentTogglePos)
        const afterParentPos = parentTogglePos + parentToggleNode.nodeSize

        const tr = state.tr

        // 현재 토글 삭제
        tr.delete(togglePos, togglePos + toggleNode.nodeSize)

        // 부모 토글 다음에 삽입 (삭제로 인한 위치 조정)
        const adjustedInsertPos = afterParentPos - toggleNode.nodeSize
        tr.insert(adjustedInsertPos, toggleNode)

        editor.view.dispatch(tr)

        // 새 위치로 포커스
        editor.commands.focus(adjustedInsertPos + 2)

        return true
      },
    }
  },

  addInputRules() {
    return [
      // "[] " 입력 시 투두 토글로 변환
      new InputRule({
        find: /^\[\]\s$/,
        handler: ({ state, range }) => {
          const { tr, doc } = state
          const $from = doc.resolve(range.from)

          let toggleDepth = -1
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'toggle') {
              toggleDepth = d
              break
            }
          }
          if (toggleDepth === -1) return null

          const togglePos = $from.before(toggleDepth)
          const toggleNode = doc.nodeAt(togglePos)
          if (!toggleNode || toggleNode.attrs.isTodo) return null

          // "[] " 텍스트 삭제
          tr.delete(range.from, range.to)
          // 토글을 투두로 변환
          tr.setNodeMarkup(togglePos, null, { ...toggleNode.attrs, isTodo: true, todoChecked: false })
        },
      }),
      // "> " 입력 시 토글 블록으로 변환 (토글 안에서는 차단)
      new InputRule({
        find: /^>\s$/,
        handler: ({ state, range, chain }) => {
          const { tr, doc } = state
          const $from = doc.resolve(range.from)

          // 부모가 토글이면 중첩 토글 생성 차단
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'toggle') return null
          }

          // 현재 블록(paragraph)의 시작과 끝 위치
          const blockStart = $from.start()
          const blockEnd = $from.end()

          // "> " 이후의 기존 내용을 보존
          const remainingContent = doc.slice(range.to, blockEnd).content

          // 기존 내용이 있으면 포함하여 paragraph 생성, 없으면 빈 paragraph
          const innerParagraph = remainingContent.size > 0
            ? state.schema.nodes.paragraph.create(null, remainingContent)
            : state.schema.nodes.paragraph.create()

          // 토글 노드 생성 (기존 내용 포함)
          const toggleNode = state.schema.nodes.toggle.create(
            { isOpen: true },
            innerParagraph
          )

          // 현재 블록을 토글로 대체
          tr.replaceRangeWith(blockStart - 1, blockEnd + 1, toggleNode)

          // 토글 내부 paragraph로 커서 이동
          tr.setSelection(state.selection.constructor.near(tr.doc.resolve(blockStart + 1)))

          return tr
        },
      }),
    ]
  },
})
