import { Table } from '@tiptap/extension-table'
import { columnResizing, tableEditing, addColumnBefore, addColumnAfter, deleteColumn, addRowBefore, addRowAfter, deleteRow } from '@tiptap/pm/tables'
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

    this._zoom = 1

    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper table-print-preview'

    // 체크박스 바 (테이블 위)
    this.foldBar = document.createElement('div')
    this.foldBar.className = 'table-fold-bar'
    this.foldBar.contentEditable = 'false'
    this.dom.appendChild(this.foldBar)

    // 테이블 영역 (상대 위치 — 행/열 추가 핸들의 기준)
    this.tableArea = document.createElement('div')
    this.tableArea.className = 'table-area'
    this.dom.appendChild(this.tableArea)

    // 열 문자 바 (A, B, C...)
    this.colLetterBar = document.createElement('div')
    this.colLetterBar.className = 'table-col-letters'
    this.colLetterBar.contentEditable = 'false'
    this.tableArea.appendChild(this.colLetterBar)

    // 행 번호 컨테이너 (1, 2, 3...)
    this.rowNumberGutter = document.createElement('div')
    this.rowNumberGutter.className = 'table-row-numbers'
    this.rowNumberGutter.contentEditable = 'false'
    this.tableArea.appendChild(this.rowNumberGutter)

    this.table = this.tableArea.appendChild(document.createElement('table'))
    if (node.attrs.style) {
      this.table.style.cssText = node.attrs.style
    }
    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumns(node, this.colgroup, this.table, cellMinWidth)
    this.contentDOM = this.table.appendChild(document.createElement('tbody'))

    // 열 추가 핸들 (테이블 오른쪽 바깥)
    this.colAddHandle = document.createElement('div')
    this.colAddHandle.className = 'table-add-col-handle'
    this.colAddHandle.contentEditable = 'false'
    this.colAddHandle.innerHTML = '<span class="table-add-icon">+</span>'
    this.colAddHandle.title = '열 추가'
    this.colAddHandle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.addColumnAtEnd()
    })
    this.tableArea.appendChild(this.colAddHandle)

    // 행 추가 핸들 (테이블 아래)
    this.rowAddHandle = document.createElement('div')
    this.rowAddHandle.className = 'table-add-row-handle'
    this.rowAddHandle.contentEditable = 'false'
    this.rowAddHandle.innerHTML = '<span class="table-add-icon">+</span>'
    this.rowAddHandle.title = '행 추가'
    this.rowAddHandle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.addRowAtEnd()
    })
    this.tableArea.appendChild(this.rowAddHandle)

    // 에디터 변경 시 쪽 나누기 재계산
    this._pageBreakUpdate = () => this._schedulePageBreaks()
    this.editorView.dom.addEventListener('input', this._pageBreakUpdate)

    // 초기 fold 적용 (DOM 마운트 전이라 offsetWidth가 0 → 마운트 후 재계산)
    this.applyFold()
    requestAnimationFrame(() => this.applyFold())
  }

  update(node) {
    if (node.type !== this.node.type) return false
    const prevHidden = JSON.stringify(this.node.attrs.hiddenCols || [])
    const nextHidden = JSON.stringify(node.attrs.hiddenCols || [])
    this.node = node
    updateColumns(node, this.colgroup, this.table, this.cellMinWidth)
    // hiddenCols가 바뀌었을 때만 전체 재계산
    if (prevHidden !== nextHidden) {
      this.applyFold()
    } else {
      this._schedulePageBreaks()
    }
    return true
  }

  ignoreMutation(mutation) {
    const target = mutation.target
    const isInsideWrapper = this.dom.contains(target)
    const isInsideContent = this.contentDOM.contains(target)
    if (isInsideWrapper && !isInsideContent) return true
    // 쪽 나눠보기 셀 padding 변경 무시
    if (mutation.type === 'attributes' && target.dataset && target.dataset.origPaddingTop != null) return true
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

    this._schedulePageBreaks()
  }

  _schedulePageBreaks() {
    if (this._scheduleRaf) return
    this._scheduleRaf = requestAnimationFrame(() => {
      this._scheduleRaf = null
      this.renderPageBreaks()
      const hidden = this.getHiddenCols()
      const colCount = this.getColCount()
      this.updateExcelHeaders(hidden, colCount)
    })
  }

  // 엑셀 스타일 열 문자 + 행 번호
  updateExcelHeaders(hidden, colCount) {
    // 열 문자 (A, B, C...) — 셀의 실제 위치 기준 + 클릭 메뉴
    this.colLetterBar.innerHTML = ''
    const firstRow = this.contentDOM.querySelector('tr')
    if (!firstRow) return

    const cells = firstRow.querySelectorAll('th, td')
    const tableLeft = this.table.offsetLeft

    let i = 0
    while (i < colCount) {
      if (hidden.includes(i)) {
        // 숨긴 열 구간 → 구분선
        const hiddenGroup = []
        const prevCell = i > 0 && cells[i - 1] ? cells[i - 1] : null
        while (i < colCount && hidden.includes(i)) {
          hiddenGroup.push(i)
          i++
        }
        if (prevCell) {
          const divider = document.createElement('span')
          divider.className = 'col-letter-divider'
          divider.style.left = `${tableLeft + prevCell.offsetLeft + prevCell.offsetWidth}px`
          divider.title = `${hiddenGroup.length}개 열 숨김 중`
          divider.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            this.showHiddenColsMenu(hiddenGroup, e)
          })
          this.colLetterBar.appendChild(divider)
        }
        continue
      }

      if (!cells[i]) { i++; continue }
      const colIdx = i
      const letter = document.createElement('span')
      letter.className = 'col-letter'
      letter.textContent = this.colIndexToLetter(colIdx)
      letter.style.left = `${tableLeft + cells[i].offsetLeft}px`
      letter.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.showColMenu(colIdx, e)
      })
      this.colLetterBar.appendChild(letter)
      i++
    }

    // 행 번호 (1, 2, 3...)
    this.rowNumberGutter.innerHTML = ''
    const rows = this.contentDOM.querySelectorAll('tr')
    const tableTop = this.table.offsetTop

    rows.forEach((row, idx) => {
      const num = document.createElement('span')
      num.className = 'row-number'
      num.textContent = idx + 1
      num.style.top = `${tableTop + row.offsetTop}px`
      num.style.height = `${row.offsetHeight}px`
      this.rowNumberGutter.appendChild(num)
    })
  }

  colIndexToLetter(idx) {
    let s = ''
    idx++
    while (idx > 0) {
      idx--
      s = String.fromCharCode(65 + (idx % 26)) + s
      idx = Math.floor(idx / 26)
    }
    return s
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
      const colIdx = i
      const btn = document.createElement('button')
      btn.className = `fold-bar-tool-btn ${isVisible ? '' : 'inactive'}`
      btn.textContent = this.colIndexToLetter(i)
      btn.title = `${this.colIndexToLetter(i)}열 ${isVisible ? '숨기기' : '보이기'}`
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.toggleCol(colIdx)
      })
      checkRow.appendChild(btn)
    }

    // 도구 버튼 그룹 (오른쪽 정렬)
    const toolGroup = document.createElement('div')
    toolGroup.className = 'fold-bar-tools'

    // 확대/축소
    const zoomGroup = document.createElement('div')
    zoomGroup.className = 'fold-bar-zoom'

    const fitBtn = document.createElement('button')
    fitBtn.className = 'fold-bar-tool-btn'
    fitBtn.innerHTML = '<span>맞춤</span>'
    fitBtn.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation()
      this.fitToWidth()
    })
    zoomGroup.appendChild(fitBtn)

    const zoomOut = document.createElement('button')
    zoomOut.className = 'fold-bar-tool-btn'
    zoomOut.textContent = '−'
    zoomOut.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation()
      this.stepZoom(-1)
    })
    zoomGroup.appendChild(zoomOut)

    const zoomLabel = document.createElement('span')
    zoomLabel.className = 'fold-bar-zoom-label'
    zoomLabel.textContent = `${Math.round(this._zoom * 100)}%`
    zoomGroup.appendChild(zoomLabel)

    const zoomIn = document.createElement('button')
    zoomIn.className = 'fold-bar-tool-btn'
    zoomIn.textContent = '+'
    zoomIn.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation()
      this.stepZoom(1)
    })
    zoomGroup.appendChild(zoomIn)

    toolGroup.appendChild(zoomGroup)

    // 인쇄 버튼
    const printBtn = document.createElement('button')
    printBtn.className = 'fold-bar-tool-btn'
    printBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>인쇄하기</span>'
    printBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.printTable()
    })
    toolGroup.appendChild(printBtn)

    checkRow.appendChild(toolGroup)

    this.foldBar.appendChild(checkRow)
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

  // 특정 행/열의 셀로 커서 이동
  selectCellAtRowCol(rowIdx, colIdx) {
    try {
      const pos = this.getTablePos()
      if (pos === null) return
      const table = this.editorView.state.doc.nodeAt(pos)
      if (!table) return

      let cellPos = pos + 1 // table 시작
      for (let r = 0; r <= rowIdx && r < table.childCount; r++) {
        const row = table.child(r)
        if (r === rowIdx) {
          cellPos += 1 // row 시작
          for (let c = 0; c < colIdx && c < row.childCount; c++) {
            cellPos += row.child(c).nodeSize
          }
          break
        }
        cellPos += row.nodeSize
      }
      const { tr } = this.editorView.state
      tr.setSelection(TextSelection.near(tr.doc.resolve(cellPos + 1)))
      this.editorView.dispatch(tr)
    } catch (e) {
      console.error('selectCellAtRowCol error:', e)
    }
  }

  // 테이블 끝에 열 추가
  addColumnAtEnd() {
    const colCount = this.getColCount()
    this.selectCellAt(colCount - 1)
    setTimeout(() => {
      addColumnAfter(this.editorView.state, this.editorView.dispatch)
    }, 0)
  }

  // 테이블 끝에 행 추가
  addRowAtEnd() {
    const pos = this.getTablePos()
    if (pos === null) return
    const table = this.editorView.state.doc.nodeAt(pos)
    if (!table) return
    const lastRowIdx = table.childCount - 1
    this.selectCellAtRowCol(lastRowIdx, 0)
    setTimeout(() => {
      addRowAfter(this.editorView.state, this.editorView.dispatch)
    }, 0)
  }

  // ─── 확대/축소 ───
  applyZoom(zoom) {
    this._zoom = zoom
    this.tableArea.style.zoom = zoom === 1 ? '' : zoom
    this.applyFold()
  }

  stepZoom(dir) {
    const steps = [0.5, 0.75, 1, 1.25, 1.5]
    const cur = steps.indexOf(this._zoom)
    const next = cur === -1
      ? (dir > 0 ? steps.findIndex(s => s > this._zoom) : steps.findLastIndex(s => s < this._zoom))
      : Math.max(0, Math.min(steps.length - 1, cur + dir))
    if (next !== -1) this.applyZoom(steps[next])
  }

  fitToWidth() {
    const wrapperPad = 48 // 24px * 2
    const wrapperWidth = this.dom.clientWidth - wrapperPad
    const paperPx = 210 * 3.7795275591
    const zoom = Math.min(1, Math.round((wrapperWidth / paperPx) * 20) / 20) // 5% 단위 반올림
    this.applyZoom(zoom)
  }

  renderPageBreaks() {
    // 기존 오버레이·셀 패딩 제거 (CSS 용지 스타일은 유지)
    this._clearBreakElements()

    const rows = Array.from(this.contentDOM.querySelectorAll('tr'))
    if (rows.length === 0) return

    // A4 페이지 치수 (mm → px)
    const MM = 3.7795275591
    const MARGIN_V_PX = Math.round(10 * MM)  // 38px — 상하 여백
    const MARGIN_H_PX = Math.round(12 * MM)  // 45px — 좌우 여백
    const GAP_PX = 16                         // 쪽 사이 간격
    const BREAK_GAP = MARGIN_V_PX + GAP_PX + MARGIN_V_PX // 92px
    const printableHeight = (297 - 20) * MM   // ~1047px

    // 행별 높이 측정 (용지 너비 반영된 자연 높이)
    const rowHeights = rows.map(r => r.offsetHeight)
    const headerHeight = rowHeights[0] || 0

    // 쪽 경계 행 계산
    const breakRows = []
    let accHeight = 0
    let pageStart = 0

    for (let i = 0; i < rows.length; i++) {
      const needed = accHeight === 0 && pageStart > 0 ? headerHeight + rowHeights[i] : rowHeights[i]
      accHeight += needed
      if (accHeight > printableHeight && i > pageStart) {
        breakRows.push(i)
        pageStart = i
        accHeight = headerHeight + rowHeights[i]
      }
    }

    if (breakRows.length === 0) return // 1쪽 — 경계 불필요

    // 쪽 경계 행에 padding-top 삽입 → 실제 여백 공간 생성
    this._breakRowCells = []
    breakRows.forEach(rowIdx => {
      const cells = rows[rowIdx].querySelectorAll('td, th')
      cells.forEach(cell => {
        const orig = parseInt(getComputedStyle(cell).paddingTop) || 0
        cell.dataset.origPaddingTop = orig
        cell.style.paddingTop = `${BREAK_GAP + orig}px`
        this._breakRowCells.push(cell)
      })
    })

    // 오버레이 배치 (셀 padding 적용 후 위치 계산)
    if (this._pageBreakRaf) cancelAnimationFrame(this._pageBreakRaf)
    this._pageBreakRaf = requestAnimationFrame(() => {
      this._pageBreakRaf = null
      this._pageBreakOverlays = []
      const areaRect = this.tableArea.getBoundingClientRect()
      const totalPages = breakRows.length + 1
      const zoom = this._zoom || 1

      breakRows.forEach((rowIdx, idx) => {
        const firstCell = rows[rowIdx].querySelector('td, th')
        if (!firstCell) return
        const cellRect = firstCell.getBoundingClientRect()
        const yPos = (cellRect.top - areaRect.top) / zoom

        const band = document.createElement('div')
        band.className = 'table-page-break-band'
        band.contentEditable = 'false'
        band.style.top = `${yPos}px`
        band.style.height = `${BREAK_GAP}px`

        const label = document.createElement('span')
        label.className = 'table-page-break-label'
        label.textContent = `${idx + 1} / ${totalPages}`
        band.appendChild(label)

        this.tableArea.appendChild(band)
        this._pageBreakOverlays.push(band)
      })
    })
  }

  // 오버레이·셀 패딩만 제거 (CSS 용지 스타일은 유지)
  _clearBreakElements() {
    if (this._pageBreakRaf) {
      cancelAnimationFrame(this._pageBreakRaf)
      this._pageBreakRaf = null
    }
    if (this._pageBreakOverlays) {
      this._pageBreakOverlays.forEach(el => el.remove())
      this._pageBreakOverlays = null
    }
    if (this._breakRowCells) {
      this._breakRowCells.forEach(cell => {
        const orig = cell.dataset.origPaddingTop
        cell.style.paddingTop = orig != null ? `${orig}px` : ''
        delete cell.dataset.origPaddingTop
      })
      this._breakRowCells = null
    }
  }

  destroy() {
    if (this._pageBreakUpdate) {
      this.editorView.dom.removeEventListener('input', this._pageBreakUpdate)
    }
    if (this._scheduleRaf) {
      cancelAnimationFrame(this._scheduleRaf)
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
