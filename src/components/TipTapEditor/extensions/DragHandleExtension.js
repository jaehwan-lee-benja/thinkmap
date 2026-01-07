import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * DragHandle Extension for TipTap
 * Adds a drag handle (⋮⋮) on the left side of each block
 */
export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('dragHandle'),
        props: {
          handleDOMEvents: {
            // 나중에 드래그 이벤트 처리 추가
          },
        },
        view(editorView) {
          // DragHandle UI 생성
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

          // tiptap-wrapper 찾기 (editorView.dom의 상위 요소)
          let wrapperElement = editorView.dom.parentElement
          while (wrapperElement && !wrapperElement.classList.contains('tiptap-wrapper')) {
            wrapperElement = wrapperElement.parentElement
          }

          if (wrapperElement) {
            wrapperElement.appendChild(dragHandleElement)
          } else {
            // wrapper를 못 찾으면 직접 부모에 추가
            editorView.dom.parentElement.appendChild(dragHandleElement)
          }

          // 마우스 이동 시 핸들 위치 업데이트
          let currentNode = null
          let currentPos = null

          const updateHandlePosition = (event) => {
            const pos = editorView.posAtCoords({ left: event.clientX, top: event.clientY })
            if (!pos) {
              dragHandleElement.style.display = 'none'
              return
            }

            // 현재 위치에서 블록 노드 찾기
            const $pos = editorView.state.doc.resolve(pos.pos)

            // 먼저 $pos.parent가 블록 노드인지 확인 (현재 커서가 있는 블록)
            let node = $pos.parent
            let nodePos = $pos.start($pos.depth) - 1

            // parent가 doc이거나 블록이 아니면, 상위로 올라가며 찾기
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
              dragHandleElement.style.display = 'none'
              return
            }

            // DOM 노드 찾기
            try {
              const domAtPos = editorView.domAtPos(nodePos + 1) // +1로 노드 내부를 참조
              let domNode = domAtPos.node

              // 텍스트 노드인 경우 부모 요소 찾기
              if (domNode.nodeType === Node.TEXT_NODE) {
                domNode = domNode.parentElement
              }

              // 블록 요소 찾기 (p, h1, h2, toggle-block 등)
              while (domNode && domNode !== editorView.dom) {
                if (domNode instanceof HTMLElement &&
                    (domNode.nodeName === 'P' ||
                     domNode.nodeName.startsWith('H') ||
                     domNode.classList.contains('toggle-block') ||
                     domNode.classList.contains('tableWrapper'))) {
                  break
                }
                domNode = domNode.parentElement
              }

              if (domNode && domNode instanceof HTMLElement && domNode !== editorView.dom) {
                const rect = domNode.getBoundingClientRect()

                // tiptap-wrapper 기준으로 위치 계산
                let wrapperElement = editorView.dom.parentElement
                while (wrapperElement && !wrapperElement.classList.contains('tiptap-wrapper')) {
                  wrapperElement = wrapperElement.parentElement
                }

                const wrapperRect = wrapperElement ? wrapperElement.getBoundingClientRect() : editorView.dom.getBoundingClientRect()

                dragHandleElement.style.display = 'flex'
                dragHandleElement.style.top = `${rect.top - wrapperRect.top + rect.height / 2 - 12}px`
                dragHandleElement.style.left = '8px' // padding-left 영역 안에 표시

                currentNode = node
                currentPos = nodePos
              } else {
                dragHandleElement.style.display = 'none'
              }
            } catch (error) {
              console.error('DragHandle position error:', error)
              dragHandleElement.style.display = 'none'
            }
          }

          // 에디터 위에서 마우스 이동 감지
          editorView.dom.addEventListener('mousemove', updateHandlePosition)

          // 에디터 밖으로 나가면 핸들 숨김
          editorView.dom.addEventListener('mouseleave', () => {
            dragHandleElement.style.display = 'none'
          })

          // 드래그 시작
          dragHandleElement.addEventListener('dragstart', (event) => {
            if (currentPos !== null) {
              // 드래그 중인 노드 정보 저장
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', currentPos.toString())

              // 드래그 중 시각적 피드백
              dragHandleElement.classList.add('dragging')
            }
          })

          // 드래그 종료
          dragHandleElement.addEventListener('dragend', () => {
            dragHandleElement.classList.remove('dragging')
          })

          return {
            destroy() {
              editorView.dom.removeEventListener('mousemove', updateHandlePosition)
              if (dragHandleElement.parentElement) {
                dragHandleElement.parentElement.removeChild(dragHandleElement)
              }
            },
          }
        },
      }),
    ]
  },
})
