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

          const editorDom = editorView.dom
          let wrapperElement = null
          let currentNode = null
          let currentPos = null
          let draggedNodePos = null
          let draggedNode = null
          let hideTimeout = null

          // 마우스 이동 시 핸들 위치 업데이트
          const updateHandlePosition = (event) => {
            console.log('🖱️ Mouse move detected', event.clientX, event.clientY)
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
                const wrapperRect = wrapperElement.getBoundingClientRect()

                dragHandleElement.style.display = 'flex'
                dragHandleElement.style.top = `${rect.top - wrapperRect.top + rect.height / 2 - 12}px`
                dragHandleElement.style.left = '8px'

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

          const scheduleHide = () => {
            hideTimeout = setTimeout(() => {
              dragHandleElement.style.display = 'none'
            }, 100)
          }

          const cancelHide = () => {
            if (hideTimeout) {
              clearTimeout(hideTimeout)
              hideTimeout = null
            }
          }

          // React 렌더링 완료 후 초기화
          setTimeout(() => {
            console.log('🔍 Initializing DragHandle...')
            let element = editorDom.parentElement

            console.log('🔍 Level 0 (editorDom.parentElement):', element, 'className:', element?.className)
            console.log('🔍 Level 1 (parentElement.parentElement):', element?.parentElement, 'className:', element?.parentElement?.className)

            // .tiptap-wrapper 클래스를 가진 요소 찾기
            while (element && !element.classList.contains('tiptap-wrapper')) {
              element = element.parentElement
              if (element) {
                console.log('🔍 Checking parent:', element, 'className:', element.className)
              }
            }

            if (!element) {
              console.error('❌ .tiptap-wrapper not found!')
              return
            }

            wrapperElement = element
            console.log('✅ Found .tiptap-wrapper:', wrapperElement)

            // wrapperElement에 핸들 추가
            wrapperElement.style.position = 'relative'
            wrapperElement.appendChild(dragHandleElement)
            console.log('✅ DragHandle appended to .tiptap-wrapper')

            // 이벤트 리스너 등록
            wrapperElement.addEventListener('mousemove', updateHandlePosition)
            wrapperElement.addEventListener('mouseleave', scheduleHide)
            console.log('✅ mousemove event listener registered')

            // 핸들 위에서도 핸들 유지
            dragHandleElement.addEventListener('mouseenter', () => {
              dragHandleElement.style.display = 'flex'
            })
            dragHandleElement.addEventListener('mouseenter', cancelHide)
            dragHandleElement.addEventListener('mouseleave', scheduleHide)

            // 드래그 시작
            dragHandleElement.addEventListener('dragstart', (event) => {
              if (currentPos !== null && currentNode !== null) {
                draggedNodePos = currentPos
                draggedNode = currentNode

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
              draggedNodePos = null
              draggedNode = null
            })

            // 에디터 위에 드래그오버 이벤트 (드롭 가능 표시)
            editorView.dom.addEventListener('dragover', (event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            })

            // 드롭 이벤트 (실제 블록 이동)
            editorView.dom.addEventListener('drop', (event) => {
              event.preventDefault()

              if (draggedNodePos === null || draggedNode === null) return

              // 드롭 위치 찾기
              const dropPos = editorView.posAtCoords({ left: event.clientX, top: event.clientY })
              if (!dropPos) return

              // 같은 위치에 드롭하면 무시
              if (Math.abs(dropPos.pos - draggedNodePos) < 5) return

              try {
                const { tr } = editorView.state
                const draggedNodeSize = draggedNode.nodeSize

                // 드래그한 노드 삭제
                tr.delete(draggedNodePos, draggedNodePos + draggedNodeSize)

                // 삭제 후 위치 조정
                let insertPos = dropPos.pos
                if (dropPos.pos > draggedNodePos) {
                  insertPos -= draggedNodeSize
                }

                // 새 위치에 노드 삽입
                tr.insert(insertPos, draggedNode)

                // 트랜잭션 실행
                editorView.dispatch(tr)
              } catch (error) {
                console.error('Drag and drop error:', error)
              }

              draggedNodePos = null
              draggedNode = null
            })
          }, 0) // React 렌더링 대기

          return {
            destroy() {
              if (wrapperElement) {
                wrapperElement.removeEventListener('mousemove', updateHandlePosition)
                wrapperElement.removeEventListener('mouseleave', scheduleHide)
              }
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
