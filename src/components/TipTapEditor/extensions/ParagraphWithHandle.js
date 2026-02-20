import { Paragraph } from '@tiptap/extension-paragraph'
import { NodeSelection } from '@tiptap/pm/state'

/**
 * 드래그 핸들이 있는 Paragraph 확장
 * hover 시 좌측에 6점 핸들 표시, 드래그로 블록 이동 가능
 */
export const ParagraphWithHandle = Paragraph.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.classList.add('paragraph-block')

      // 드래그 핸들
      const dragHandle = document.createElement('div')
      dragHandle.classList.add('paragraph-drag-handle')
      dragHandle.contentEditable = 'false'
      dragHandle.draggable = true

      // 드래그 시작
      dragHandle.addEventListener('dragstart', (e) => {
        if (typeof getPos !== 'function') return

        const pos = getPos()
        const nodeAtPos = editor.state.doc.nodeAt(pos)
        if (!nodeAtPos) return

        const selection = NodeSelection.create(editor.state.doc, pos)
        editor.view.dispatch(editor.state.tr.setSelection(selection))

        const slice = editor.state.selection.content()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setDragImage(dom, 0, 0)

        editor.view.dragging = { slice, move: true }
      })

      // 클릭 시 블록 선택
      dragHandle.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (typeof getPos !== 'function') return

        const pos = getPos()
        const selection = NodeSelection.create(editor.state.doc, pos)
        editor.view.dispatch(editor.state.tr.setSelection(selection))
      })

      // contentDOM: 실제 p 태그
      const contentP = document.createElement('p')

      dom.appendChild(dragHandle)
      dom.appendChild(contentP)

      return {
        dom,
        contentDOM: contentP,
        update: (updatedNode) => {
          return updatedNode.type.name === 'paragraph'
        },
      }
    }
  },
})
