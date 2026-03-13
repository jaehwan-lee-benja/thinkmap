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

      // 토글 내부가 아닌 paragraph는 비활성화
      const pos = getPos()
      let inactive = false
      if (typeof pos === 'number') {
        const $pos = editor.state.doc.resolve(pos)
        let insideToggle = false
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type.name === 'toggle') {
            insideToggle = true
            break
          }
        }
        if (!insideToggle) {
          inactive = true
          dom.contentEditable = 'false'
          dom.title = '이 블럭은 비활성화된 블럭입니다'
        }
      }

      // contentDOM: 실제 p 태그
      const contentP = document.createElement('p')

      if (!inactive) {
        // 드래그 핸들 (활성 블록에만)
        const dragHandle = document.createElement('div')
        dragHandle.classList.add('paragraph-drag-handle')
        dragHandle.contentEditable = 'false'
        dragHandle.draggable = true

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

          // 크로스 패널 드래그를 위해 JSON 직렬화 + 글로벌 상태 저장
          const nodeJSON = nodeAtPos.toJSON()
          e.dataTransfer.setData('application/x-thinkmap-block', JSON.stringify(nodeJSON))
          window.__crossPaneDrag = { sourceEditor: editor, sourcePos: pos, nodeSize: nodeAtPos.nodeSize }

          editor.view.dragging = { slice, move: true }
        })

        dragHandle.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()

          if (typeof getPos !== 'function') return

          const pos = getPos()
          const selection = NodeSelection.create(editor.state.doc, pos)
          editor.view.dispatch(editor.state.tr.setSelection(selection))
        })

        dom.appendChild(dragHandle)
      }

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
