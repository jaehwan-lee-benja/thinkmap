import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'

/**
 * Toggle Extension for TipTap
 * Notion-style collapsible blocks with children
 */
export const Toggle = Node.create({
  name: 'toggle',

  group: 'block',

  content: 'block+',

  defining: true,

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
          },
          node.attrs.isOpen ? '▼' : '▶',
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
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.classList.add('toggle-block')
      dom.setAttribute('data-is-open', node.attrs.isOpen)

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

        // 노드 선택
        const selection = NodeSelection.create(editor.state.doc, pos)
        editor.view.dispatch(editor.state.tr.setSelection(selection))

        // 드래그 데이터 설정
        const slice = editor.state.selection.content()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setDragImage(dom, 0, 0)

        editor.view.dragging = { slice, move: true }
      })

      // 드래그 핸들 클릭 시 블록 선택 + 컨텍스트 메뉴
      dragHandle.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (typeof getPos !== 'function') return

        const pos = getPos()
        const selection = NodeSelection.create(editor.state.doc, pos)
        editor.view.dispatch(editor.state.tr.setSelection(selection))

        // 커스텀 이벤트로 컨텍스트 메뉴 표시 요청
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
      button.textContent = node.attrs.isOpen ? '▼' : '▶'

      // Content area (contentDOM) - 버튼 옆에 배치
      const contentWrapper = document.createElement('div')
      contentWrapper.classList.add('toggle-content')
      contentWrapper.classList.add(node.attrs.isOpen ? 'open' : 'closed')

      button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (typeof getPos === 'function') {
          const pos = getPos()
          const currentNode = editor.state.doc.nodeAt(pos)

          if (currentNode) {
            const newIsOpen = !currentNode.attrs.isOpen

            // Transaction으로 노드 속성 변경
            const { tr } = editor.state
            tr.setNodeMarkup(pos, null, {
              ...currentNode.attrs,
              isOpen: newIsOpen,
            })
            editor.view.dispatch(tr)

            // DOM 즉시 업데이트
            button.textContent = newIsOpen ? '▼' : '▶'
            contentWrapper.className = newIsOpen
              ? 'toggle-content open'
              : 'toggle-content closed'
            dom.setAttribute('data-is-open', newIsOpen)
          }
        }
      })

      dom.appendChild(dragHandle)
      dom.appendChild(button)
      dom.appendChild(contentWrapper)

      return {
        dom,
        contentDOM: contentWrapper,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'toggle') {
            return false
          }

          // Update button text
          button.textContent = updatedNode.attrs.isOpen ? '▼' : '▶'

          // Update content visibility
          contentWrapper.className = updatedNode.attrs.isOpen
            ? 'toggle-content open'
            : 'toggle-content closed'

          dom.setAttribute('data-is-open', updatedNode.attrs.isOpen)

          return true
        },
      }
    }
  },

  addCommands() {
    return {
      setToggle: () => ({ commands, editor, chain }) => {
        const { state } = editor
        const { selection } = state
        const { $from, empty } = selection

        // 에디터가 비어있는지 확인 (doc에 빈 paragraph만 있는 경우)
        const isEmptyDoc = state.doc.content.size <= 2 ||
          (state.doc.childCount === 1 &&
           state.doc.firstChild?.type.name === 'paragraph' &&
           state.doc.firstChild?.content.size === 0)

        if (isEmptyDoc) {
          // 빈 에디터: 전체를 토글로 대체
          return chain()
            .clearContent()
            .insertContent({
              type: 'toggle',
              attrs: { isOpen: true },
              content: [
                {
                  type: 'paragraph',
                  content: []
                }
              ]
            })
            .focus()
            .run()
        }

        // 현재 블록 끝으로 이동 후 새 줄에 토글 삽입
        return chain()
          .insertContentAt(selection.to, {
            type: 'toggle',
            attrs: { isOpen: true },
            content: [
              {
                type: 'paragraph',
                content: []
              }
            ]
          })
          .focus()
          .run()
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
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-t': () => this.editor.commands.setToggle(),

      // 엔터: 토글 밖으로 나가서 새 토글 생성
      'Enter': ({ editor }) => {
        const { state } = editor
        const { $from } = state.selection

        // 현재 토글 내부에 있는지 확인
        let toggleDepth = -1
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'toggle') {
            toggleDepth = d
            break
          }
        }

        if (toggleDepth === -1) {
          // 토글 내부가 아니면 기본 동작
          return false
        }

        // 토글 다음 위치에 새 토글 삽입
        const togglePos = $from.before(toggleDepth)
        const toggleNode = state.doc.nodeAt(togglePos)
        const afterTogglePos = togglePos + toggleNode.nodeSize

        editor.chain()
          .insertContentAt(afterTogglePos, {
            type: 'toggle',
            attrs: { isOpen: true },
            content: [{ type: 'paragraph', content: [] }]
          })
          .focus(afterTogglePos + 2)
          .run()

        return true
      },

      // Shift+엔터: 블록 내부에서 줄바꿈 (soft break)
      'Shift-Enter': ({ editor }) => {
        return editor.commands.setHardBreak()
      },

      // Tab: 위 토글의 하위로 들여쓰기
      'Tab': ({ editor }) => {
        const { state } = editor
        const { $from } = state.selection

        // 현재 토글 찾기
        let toggleDepth = -1
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'toggle') {
            toggleDepth = d
            break
          }
        }

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

        // 현재 토글을 삭제하고 이전 토글의 마지막에 삽입
        const tr = state.tr

        // 현재 토글 삭제
        tr.delete(togglePos, togglePos + toggleNode.nodeSize)

        // 이전 토글의 contentDOM 끝에 삽입
        // 이전 토글의 끝 위치 = prevSiblingPos + prevSibling.nodeSize - 1
        const insertPos = prevSiblingPos + prevSibling.nodeSize - 1
        tr.insert(insertPos, toggleNode)

        editor.view.dispatch(tr)

        // 새 위치로 포커스
        editor.commands.focus(insertPos + 2)

        return true
      },

      // Shift+Tab: 토글 밖으로 내어쓰기
      'Shift-Tab': ({ editor }) => {
        const { state } = editor
        const { $from } = state.selection

        // 현재 토글 찾기
        let toggleDepth = -1
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'toggle') {
            toggleDepth = d
            break
          }
        }

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
      // "> " 입력 시 토글 블록으로 변환
      new InputRule({
        find: /^>\s$/,
        handler: ({ state, range, chain }) => {
          const { tr, doc } = state
          const $from = doc.resolve(range.from)

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
