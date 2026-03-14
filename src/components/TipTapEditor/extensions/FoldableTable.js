import { Table } from '@tiptap/extension-table'
import { columnResizing, tableEditing, addColumnBefore, addColumnAfter, deleteColumn } from '@tiptap/pm/tables'
import { TextSelection } from '@tiptap/pm/state'

/**
 * 열 접기/펼치기를 지원하는 테이블 확장
 * - hiddenCols: 숨길 열 인덱스 배열 (예: [2, 3] → 3번째, 4번째 열 숨김)
 * - 테이블 위에 열 개수만큼 체크박스 표시: 체크 = 보임, 해제 = 숨김
 */

// --- TableView 원본의 updateColumns 로직 재현 ---
function getColStyleDeclaration(minWidth, width) {
  if (width) return ['width', `${Math.max(width, minWidth)}px`]
  return ['min-width', `${minWidth}px`]
}

function updateColumns(node, colgroup, table, cellMinWidth, overrideCol, overrideValue) {
  let totalWidth = 0
  let fixedWidth = true
  let nextDOM = colgroup.firstChild
  const row = node.firstChild

  if (row !== null) {
    for (let i = 0, col = 0; i < row.childCount; i += 1) {
      const { colspan, colwidth } = row.child(i).attrs
      for (let j = 0; j < colspan; j += 1, col += 1) {
        const hasWidth = overrideCol === col ? overrideValue : colwidth && colwidth[j]
        totalWidth += hasWidth || cellMinWidth
        if (!hasWidth) fixedWidth = false

        if (!nextDOM) {
          const colEl = document.createElement('col')
          const [prop, val] = getColStyleDeclaration(cellMinWidth, hasWidth)
          colEl.style.setProperty(prop, val)
          colgroup.appendChild(colEl)
        } else {
          const cssWidth = hasWidth ? `${hasWidth}px` : ''
          if (nextDOM.style.width !== cssWidth) {
            const [prop, val] = getColStyleDeclaration(cellMinWidth, hasWidth)
            nextDOM.style.setProperty(prop, val)
          }
          nextDOM = nextDOM.nextSibling
        }
      }
    }
  }

  while (nextDOM) {
    const after = nextDOM.nextSibling
    nextDOM.parentNode?.removeChild(nextDOM)
    nextDOM = after
  }

  if (fixedWidth) {
    table.style.width = `${totalWidth}px`
    table.style.minWidth = ''
  } else {
    table.style.width = ''
    table.style.minWidth = `${totalWidth}px`
  }
}

// --- 접기/펼치기 지원 TableView ---
class FoldableTableView {
  constructor(node, cellMinWidth, editorView) {
    this.node = node
    this.cellMinWidth = cellMinWidth
    this.editorView = editorView

    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'

    // 체크박스 바 (테이블 위)
    this.foldBar = document.createElement('div')
    this.foldBar.className = 'table-fold-bar'
    this.foldBar.contentEditable = 'false'
    this.dom.appendChild(this.foldBar)

    this.table = this.dom.appendChild(document.createElement('table'))
    if (node.attrs.style) {
      this.table.style.cssText = node.attrs.style
    }
    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(node, this.colgroup, this.table, cellMinWidth)
    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    // 초기 fold 적용 (DOM 마운트 전이라 offsetWidth가 0 → 마운트 후 재계산)
    this.applyFold()
    requestAnimationFrame(() => this.applyFold())
  }

  update(node) {
    if (node.type !== this.node.type) return false
    this.node = node
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth)
    this.applyFold()
    return true
  }

  ignoreMutation(mutation) {
    const target = mutation.target
    const isInsideWrapper = this.dom.contains(target)
    const isInsideContent = this.contentDOM.contains(target)
    if (isInsideWrapper && !isInsideContent) return true
    return false
  }

  getColCount() {
    const row = this.node.firstChild
    if (!row) return 0
    let count = 0
    for (let i = 0; i < row.childCount; i++) {
      count += row.child(i).attrs.colspan || 1
    }
    return count
  }

  getHiddenCols() {
    return this.node.attrs.hiddenCols || []
  }

  getTablePos() {
    try {
      const pos = this.editorView.posAtDOM(this.table, 0)
      const $pos = this.editorView.state.doc.resolve(pos)
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type.name === 'table') {
          return $pos.before(d)
        }
      }
    } catch (e) {}
    return null
  }

  setHiddenCols(hiddenCols) {
    const pos = this.getTablePos()
    if (pos === null) return
    const { tr } = this.editorView.state
    tr.setNodeMarkup(pos, null, {
      ...this.node.attrs,
      hiddenCols: hiddenCols.length > 0 ? hiddenCols : null,
    })
    this.editorView.dispatch(tr)
  }

  toggleCol(colIdx) {
    const hidden = this.getHiddenCols()
    let newHidden
    if (hidden.includes(colIdx)) {
      newHidden = hidden.filter(i => i !== colIdx)
    } else {
      newHidden = [...hidden, colIdx].sort((a, b) => a - b)
    }
    this.setHiddenCols(newHidden)
  }

  applyFold() {
    const hidden = this.getHiddenCols()
    const colCount = this.getColCount()

    // colgroup 처리 — 먼저 스타일 초기화 후 updateColumns로 복원, 그 후 숨긴 열만 0
    const cols = this.colgroup.children
    for (let i = 0; i < cols.length; i++) {
      cols[i].style.width = ''
      cols[i].style.minWidth = ''
      cols[i].style.overflow = ''
    }
    updateColumns(this.node, this.colgroup, this.table, this.cellMinWidth)
    for (let i = 0; i < cols.length; i++) {
      if (hidden.includes(i)) {
        cols[i].style.width = '0'
        cols[i].style.minWidth = '0'
        cols[i].style.overflow = 'hidden'
      }
    }

    // 셀에 fold 클래스 적용
    const rows = this.contentDOM.querySelectorAll('tr')
    rows.forEach((row) => {
      const cells = row.querySelectorAll('th, td')
      cells.forEach((cell, colIdx) => {
        cell.classList.toggle('col-folded', hidden.includes(colIdx))
      })
    })

    // 체크박스 바 업데이트
    this.updateFoldBar(hidden, colCount)
  }

  updateFoldBar(hidden, colCount) {
    this.foldBar.innerHTML = ''

    if (colCount <= 1) {
      this.foldBar.style.display = 'none'
      return
    }
    this.foldBar.style.display = ''

    // 1줄: 체크박스 + 도구 버튼
    const checkRow = document.createElement('div')
    checkRow.className = 'fold-bar-checks'

    for (let i = 0; i < colCount; i++) {
      const isVisible = !hidden.includes(i)
      const box = document.createElement('div')
      box.className = `fold-col-box ${isVisible ? 'fold-col-visible' : 'fold-col-hidden'}`
      box.title = `${i + 1}번째 열 ${isVisible ? '숨기기' : '보이기'}`

      const colIdx = i
      box.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.toggleCol(colIdx)
      })

      const num = document.createElement('span')
      num.className = 'fold-col-num'
      num.textContent = i + 1
      box.appendChild(num)

      checkRow.appendChild(box)
    }

    // 인쇄 버튼
    const printBtn = document.createElement('div')
    printBtn.className = 'fold-bar-print-btn'
    printBtn.title = '표 인쇄 (숨긴 열 제외)'
    printBtn.textContent = '🖨'
    printBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.printTable()
    })
    checkRow.appendChild(printBtn)

    this.foldBar.appendChild(checkRow)

    // 2줄: 번호 헤더 (flex 기반, 보이는 열은 실제 테이블 열 너비에 맞춤, 숨긴 구간은 divider)
    const headerRow = document.createElement('div')
    headerRow.className = 'fold-bar-header'

    // 보이는 열의 실제 DOM 너비 가져오기
    const colWidths = []
    const srcCols = this.colgroup.children
    for (let i = 0; i < colCount; i++) {
      if (hidden.includes(i)) {
        colWidths.push(0)
      } else {
        // 실제 테이블 첫 행의 셀 너비 사용
        const firstRow = this.contentDOM.querySelector('tr')
        const cells = firstRow ? firstRow.querySelectorAll('th, td') : []
        colWidths.push(cells[i] ? cells[i].offsetWidth : 100)
      }
    }

    // 연속 구간 분석: visible 열 또는 hidden 열 그룹으로 분할
    let i = 0
    while (i < colCount) {
      if (hidden.includes(i)) {
        // 연속 숨긴 열 그룹
        const hiddenGroup = []
        while (i < colCount && hidden.includes(i)) {
          hiddenGroup.push(i)
          i++
        }
        const divider = document.createElement('div')
        divider.className = 'fold-col-divider'
        divider.title = `${hiddenGroup.length}개 열 숨김 중 (클릭하여 펼치기)`
        divider.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.showHiddenColsMenu(hiddenGroup, e)
        })
        headerRow.appendChild(divider)
      } else {
        // 보이는 열
        const cell = document.createElement('div')
        cell.className = 'fold-col-cell fold-col-visible'
        cell.textContent = i + 1
        cell.style.width = `${colWidths[i]}px`
        cell.style.boxSizing = 'border-box'

        const colIdx = i
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.showColMenu(colIdx, e)
        })

        headerRow.appendChild(cell)
        i++
      }
    }

    this.foldBar.appendChild(headerRow)
  }

  // 열 편집 메뉴 표시
  showColMenu(colIdx, event) {
    // 기존 메뉴 제거
    this.closeColMenu()

    const hidden = this.getHiddenCols()
    const isVisible = !hidden.includes(colIdx)
    const colCount = this.getColCount()

    const menu = document.createElement('div')
    menu.className = 'col-edit-menu'
    menu.contentEditable = 'false'

    const items = [
      {
        label: isVisible ? '이 열 숨기기' : '이 열 보이기',
        action: () => this.toggleCol(colIdx),
      },
      { divider: true },
      {
        label: '왼쪽에 열 추가',
        action: () => {
          // 해당 열의 첫 셀로 커서 이동 후 addColumnBefore
          this.selectCellAt(colIdx)
          setTimeout(() => {
            addColumnBefore(this.editorView.state, this.editorView.dispatch)
          }, 0)
        },
      },
      {
        label: '오른쪽에 열 추가',
        action: () => {
          this.selectCellAt(colIdx)
          setTimeout(() => {
            addColumnAfter(this.editorView.state, this.editorView.dispatch)
          }, 0)
        },
      },
      { divider: true },
      {
        label: '이 열 삭제',
        className: 'col-menu-delete',
        action: () => {
          this.selectCellAt(colIdx)
          setTimeout(() => {
            deleteColumn(this.editorView.state, this.editorView.dispatch)
          }, 0)
        },
      },
    ]

    if (hidden.length > 0) {
      items.push({ divider: true })
      items.push({
        label: '모든 열 보이기',
        action: () => this.setHiddenCols([]),
      })
    }

    items.forEach(item => {
      if (item.divider) {
        const div = document.createElement('div')
        div.className = 'col-menu-divider'
        menu.appendChild(div)
        return
      }
      const btn = document.createElement('button')
      btn.className = `col-menu-item ${item.className || ''}`
      btn.textContent = item.label
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.closeColMenu()
        item.action()
      })
      menu.appendChild(btn)
    })

    // 위치 계산 — 클릭한 셀 아래
    const rect = event.target.getBoundingClientRect()
    menu.style.position = 'fixed'
    menu.style.top = `${rect.bottom + 2}px`
    menu.style.left = `${rect.left}px`

    this._colMenu = menu
    this._colMenuClose = (e) => {
      if (!menu.contains(e.target)) this.closeColMenu()
    }
    document.addEventListener('mousedown', this._colMenuClose, true)
    document.body.appendChild(menu)
  }

  closeColMenu() {
    if (this._colMenu) {
      this._colMenu.remove()
      this._colMenu = null
    }
    if (this._colMenuClose) {
      document.removeEventListener('mousedown', this._colMenuClose, true)
      this._colMenuClose = null
    }
  }

  // 숨긴 열 펼치기 메뉴
  showHiddenColsMenu(hiddenColIndices, event) {
    this.closeColMenu()

    const menu = document.createElement('div')
    menu.className = 'col-edit-menu'
    menu.contentEditable = 'false'

    // 각 숨긴 열 개별 펼치기
    hiddenColIndices.forEach(colIdx => {
      const btn = document.createElement('button')
      btn.className = 'col-menu-item'
      btn.textContent = `${colIdx + 1}번 열 보이기`
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.closeColMenu()
        this.toggleCol(colIdx)
      })
      menu.appendChild(btn)
    })

    // 구분선 + 전체 펼치기
    if (hiddenColIndices.length > 1) {
      const div = document.createElement('div')
      div.className = 'col-menu-divider'
      menu.appendChild(div)

      const allBtn = document.createElement('button')
      allBtn.className = 'col-menu-item'
      allBtn.textContent = `${hiddenColIndices.length}개 열 모두 보이기`
      allBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.closeColMenu()
        const currentHidden = this.getHiddenCols()
        const newHidden = currentHidden.filter(i => !hiddenColIndices.includes(i))
        this.setHiddenCols(newHidden)
      })
      menu.appendChild(allBtn)
    }

    // 모든 열 보이기
    const allHidden = this.getHiddenCols()
    if (allHidden.length > hiddenColIndices.length) {
      const div = document.createElement('div')
      div.className = 'col-menu-divider'
      menu.appendChild(div)

      const showAllBtn = document.createElement('button')
      showAllBtn.className = 'col-menu-item'
      showAllBtn.textContent = '모든 열 보이기'
      showAllBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.closeColMenu()
        this.setHiddenCols([])
      })
      menu.appendChild(showAllBtn)
    }

    const rect = event.target.getBoundingClientRect()
    menu.style.position = 'fixed'
    menu.style.top = `${rect.bottom + 2}px`
    menu.style.left = `${rect.left}px`

    this._colMenu = menu
    this._colMenuClose = (e) => {
      if (!menu.contains(e.target)) this.closeColMenu()
    }
    document.addEventListener('mousedown', this._colMenuClose, true)
    document.body.appendChild(menu)
  }

  // 표 인쇄 (숨긴 열 제외, 표 가로 너비에 맞춤)
  printTable() {
    const hidden = this.getHiddenCols()
    const rows = this.contentDOM.querySelectorAll('tr')

    // 보이는 열만 추출하여 HTML 테이블 생성
    let html = '<table>'
    rows.forEach((row) => {
      html += '<tr>'
      const cells = row.querySelectorAll('th, td')
      cells.forEach((cell, colIdx) => {
        if (hidden.includes(colIdx)) return
        const tag = cell.tagName.toLowerCase()
        html += `<${tag}>${cell.innerHTML}</${tag}>`
      })
      html += '</tr>'
    })
    html += '</table>'

    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (!printWindow) return

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>표 인쇄</title>
<style>
  @page { margin: 15mm 20mm; }
  body {
    margin: 0;
    padding: 40px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    color: #1a1a1a;
    line-height: 1.6;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
    margin: 0 auto;
  }
  th, td {
    border: 1px solid #bbb;
    padding: 10px 14px;
    text-align: left;
    vertical-align: top;
    word-break: break-word;
  }
  tr:first-child th, tr:first-child td {
    background: #f5f5f5;
    font-weight: 600;
    border-bottom: 2px solid #999;
  }
  tr:nth-child(even) { background: #fafafa; }
  th { background: #f0f0f0; font-weight: 700; }
  /* 토글 블럭 간소화 */
  .toggle-block { margin: 4px 0; }
  .toggle-button { display: none; }
  .toggle-content { display: block !important; padding-left: 0 !important; }
  /* 드래그 핸들 숨기기 */
  .drag-handle { display: none !important; }
  [data-drag-handle] { display: none !important; }
  p { margin: 4px 0; }
</style>
</head>
<body>${html}</body>
</html>`)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  // 특정 열의 첫 행 셀로 커서 이동
  selectCellAt(colIdx) {
    try {
      const pos = this.getTablePos()
      if (pos === null) return
      const table = this.editorView.state.doc.nodeAt(pos)
      if (!table) return
      const firstRow = table.firstChild
      if (!firstRow) return

      let cellPos = pos + 1 + 1 // table 시작 + row 시작
      for (let i = 0; i < colIdx && i < firstRow.childCount; i++) {
        cellPos += firstRow.child(i).nodeSize
      }
      // 셀 안의 첫 위치로 커서 이동
      const { tr } = this.editorView.state
      tr.setSelection(TextSelection.near(tr.doc.resolve(cellPos + 1)))
      this.editorView.dispatch(tr)
    } catch (e) {
      console.error('selectCellAt error:', e)
    }
  }
}

// --- 커스텀 Table Extension ---
export const FoldableTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      hiddenCols: {
        default: null,
        parseHTML: (el) => {
          const val = el.getAttribute('data-hidden-cols')
          if (!val) return null
          try { return JSON.parse(val) } catch { return null }
        },
        renderHTML: (attrs) => {
          if (!attrs.hiddenCols || attrs.hiddenCols.length === 0) return {}
          return { 'data-hidden-cols': JSON.stringify(attrs.hiddenCols) }
        },
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      toggleTableCol: (colIndex) => ({ tr, state, dispatch }) => {
        const { $from } = state.selection
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'table') {
            const pos = $from.before(d)
            const node = state.doc.nodeAt(pos)
            if (node) {
              const hidden = node.attrs.hiddenCols || []
              const newHidden = hidden.includes(colIndex)
                ? hidden.filter(i => i !== colIndex)
                : [...hidden, colIndex].sort((a, b) => a - b)
              tr.setNodeMarkup(pos, null, {
                ...node.attrs,
                hiddenCols: newHidden.length > 0 ? newHidden : null,
              })
              if (dispatch) dispatch(tr)
              return true
            }
          }
        }
        return false
      },
      showAllTableCols: () => ({ tr, state, dispatch }) => {
        const { $from } = state.selection
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'table') {
            const pos = $from.before(d)
            const node = state.doc.nodeAt(pos)
            if (node) {
              tr.setNodeMarkup(pos, null, { ...node.attrs, hiddenCols: null })
              if (dispatch) dispatch(tr)
              return true
            }
          }
        }
        return false
      },
    }
  },

  addProseMirrorPlugins() {
    const isResizable = this.options.resizable && this.editor.isEditable
    return [
      ...(isResizable ? [
        columnResizing({
          handleWidth: this.options.handleWidth,
          cellMinWidth: this.options.cellMinWidth,
          defaultCellMinWidth: this.options.cellMinWidth,
          View: FoldableTableView,
          lastColumnResizable: this.options.lastColumnResizable,
        })
      ] : []),
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
    ]
  },
})
