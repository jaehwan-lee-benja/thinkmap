import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { NodeSelection, TextSelection, Selection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Fragment, Slice } from '@tiptap/pm/model'
import { genBlockId } from '../../../utils/blockId'

export const multiSelectPluginKey = new PluginKey('multiSelect')
export const focusHighlightPluginKey = new PluginKey('toggleFocusHighlight')
const blockDragPluginKey = new PluginKey('blockDrag')

// 섹션(h2) 드래그로 순서 재배치 — 현재 보류(섹션 이동은 ⋮ 버튼으로만).
// 부활: 이 값을 true 로 + TipTapPage.css 의 "섹션 이동 모드 핸들 노출" 규칙 주석 해제.
// (드래그 타겟팅/병합 확인/인디케이터 색 코드는 그대로 보존 — 이 플래그로만 잠금)
const SECTION_DRAG_ENABLED = false

// 섹션 카드 색상 팔레트 — daily 페이지 h2 섹션이 "입는" 색.
// value 는 base hue hex. 카드 테두리/배경 틴트는 CSS color-mix 로 파생 (TipTapEditor.css).
// 일반 블록 배경색(BG_COLORS, rgba 색면)과는 별개 개념.
export const SECTION_CARD_COLORS = [
  { name: '기본', value: null },
  { name: '빨강', value: '#ef4444' },
  { name: '주황', value: '#f97316' },
  { name: '노랑', value: '#eab308' },
  { name: '초록', value: '#22c55e' },
  { name: '파랑', value: '#3b82f6' },
  { name: '보라', value: '#a855f7' },
  { name: '분홍', value: '#ec4899' },
  { name: '회색', value: '#9ca3af' },
]

// backgroundColor attr 를 DOM 에 반영.
// daily 페이지 h2 섹션  → 카드가 색을 "입음": --card-color 변수 + data-card-color 만 세팅,
//                         실제 테두리/배경 틴트는 CSS 가 color-mix 로 처리 (마스터 보라색도 override).
// 그 외 블록            → 기존 동작: data-bg-color + 인라인 background-color (색면 채우기).
function applyBlockBackground(dom, attrs, editor) {
  const color = attrs.backgroundColor || null
  const isDailyCard = attrs.blockType === 'h2' && !!editor.storage.toggle?.isDailyPage
  // 항상 먼저 초기화 (속성 전환 시 잔재 제거)
  dom.removeAttribute('data-bg-color')
  dom.removeAttribute('data-card-color')
  dom.style.removeProperty('--card-color')
  dom.style.removeProperty('background-color')
  if (!color) return
  if (isDailyCard) {
    dom.setAttribute('data-card-color', color)
    dom.style.setProperty('--card-color', color)
  } else {
    dom.setAttribute('data-bg-color', color)
    dom.style.setProperty('background-color', color, 'important')
  }
}

// --- Todo thread 동기화 ---
// 체크박스 완료/해제 시 같은 originBlockId를 가진 이월본을 교차 페이지 동기화
// 조회 범위: 최근 CARRY_OVER_SYNC_WINDOW_DAYS일 이내의 daily 페이지
// (이월 체인의 실질 생존 기간을 커버하면서 과도한 I/O를 방지)
const CARRY_OVER_SYNC_WINDOW_DAYS = 90

async function syncBlockAcrossPages(supabase, blockId, checked) {
  try {
    const since = new Date(Date.now() - CARRY_OVER_SYNC_WINDOW_DAYS * 86400_000)
      .toISOString().slice(0, 10)
    const { data: pages } = await supabase
      .from('pages')
      .select('id, content_tiptap')
      .eq('page_type', 'daily')
      .is('deleted_at', null)
      .gte('page_date', since)
      .order('page_date', { ascending: false })

    if (!pages?.length) return

    for (const page of pages) {
      // 클라이언트에서 blockId 매칭 확인 (관계없는 페이지는 조기 컷)
      const json = JSON.stringify(page.content_tiptap)
      if (!json.includes(blockId)) continue

      let changed = false
      const updated = updateBlockInContent(page.content_tiptap, blockId, checked, () => { changed = true })
      if (changed) {
        await supabase.from('pages').update({ content_tiptap: updated }).eq('id', page.id)
        window.dispatchEvent(new CustomEvent('quicktodo-inserted', { detail: { pageId: page.id } }))
      }
    }
  } catch (err) {
    console.warn('Block 동기화 오류:', err)
  }
}

function updateBlockInContent(content, blockId, checked, onChanged) {
  if (!content?.content) return content
  return {
    ...content,
    content: content.content.map(node => updateBlockInNode(node, blockId, checked, onChanged))
  }
}

function updateBlockInNode(node, blockId, checked, onChanged) {
  if (node.type === 'toggle' && node.attrs?.isTodo) {
    // originBlockId 또는 blockId가 매칭되면 동기화
    if (node.attrs.originBlockId === blockId || node.attrs.blockId === blockId) {
      if (node.attrs.todoChecked !== checked) {
        onChanged()
        return {
          ...node,
          attrs: { ...node.attrs, todoChecked: checked },
          content: node.content ? node.content.map(c => updateBlockInNode(c, blockId, checked, onChanged)) : node.content,
        }
      }
    }
  }
  if (node.content) {
    return { ...node, content: node.content.map(c => updateBlockInNode(c, blockId, checked, onChanged)) }
  }
  return node
}

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
 * paste 된 toggle 자손의 식별 attr 들을 재생성.
 * - blockId: 새로 발급 (DB UNIQUE 제약 회피 — 같은 blockId 두 번 INSERT 차단)
 * - sectionId / sectionMasterId: paste 위치 따라 새로 결정되어야 → null
 * - originBlockId / isCarryOver / carryOverFrom: thread 끊김 (새 인스턴스)
 *
 * paragraph 등 toggle 외 노드는 그대로. 자손 재귀.
 */
function regenToggleIds(node) {
  if (node.type.name !== 'toggle') return node
  const newAttrs = {
    ...node.attrs,
    blockId: genBlockId(),
    sectionId: null,
    sectionMasterId: null,
    originBlockId: null,
    isCarryOver: false,
    carryOverFrom: null,
  }
  const children = []
  node.content.forEach(child => children.push(regenToggleIds(child)))
  return node.type.create(newAttrs, Fragment.fromArray(children), node.marks)
}

/**
 * h2 토글 섹션을 이동.
 * - currentPos: NodeView 의 getPos() 결과 (h2 toggle 의 시작 pos)
 * - action: 'top' | 'up' | 'down' | 'bottom'
 *   - 'top': 첫 번째 h2 섹션 자리로 이동
 *   - 'up'/'down': 인접 h2 와 swap
 *   - 'bottom': 마지막 h2 섹션 자리로 이동
 *
 * 구현: doc 의 자식들 중 h2 toggle 만 골라 인덱스 배열로 정렬.
 * h2 사이에 다른 노드(빈 paragraph 등) 가 있어도 그 자리는 유지하고 h2 노드끼리만 자리 교환/재배치.
 * top/bottom 은 단순 swap 이 아니므로, h2 슬롯들의 노드 배열만 회전(rotate)시킴.
 * setContent 로 doc 재구성 → onUpdate 트리거 → v2 daily 의 handleUpdate 가 section_order 자동 동기.
 */
function moveH2SectionAtPos(editor, currentPos, action) {
  if (currentPos == null) return
  const $pos = editor.state.doc.resolve(currentPos)
  const parent = $pos.parent
  if (parent.type.name !== 'doc') return
  const myIndex = $pos.index()

  const h2Indices = []
  parent.forEach((child, _offset, idx) => {
    if (child.type.name === 'toggle' && child.attrs?.blockType === 'h2') {
      h2Indices.push(idx)
    }
  })
  const myH2Idx = h2Indices.indexOf(myIndex)
  if (myH2Idx === -1) return

  // 동작 안 하는 케이스는 조용히 무시 (UI 가 disabled 처리)
  if ((action === 'up' || action === 'top') && myH2Idx === 0) return
  if ((action === 'down' || action === 'bottom') && myH2Idx === h2Indices.length - 1) return

  const nodes = []
  parent.forEach(n => nodes.push(n))

  if (action === 'up' || action === 'down') {
    const targetH2Idx = action === 'up' ? myH2Idx - 1 : myH2Idx + 1
    const swapIndex = h2Indices[targetH2Idx]
    ;[nodes[myIndex], nodes[swapIndex]] = [nodes[swapIndex], nodes[myIndex]]
  } else if (action === 'top' || action === 'bottom') {
    // h2 슬롯들의 노드만 재배치. 슬롯(=인덱스) 자체는 그대로 두고 들어가는 노드만 회전.
    const h2Nodes = h2Indices.map(i => nodes[i])
    const moved = h2Nodes.splice(myH2Idx, 1)[0]
    if (action === 'top') h2Nodes.unshift(moved)
    else h2Nodes.push(moved)
    h2Indices.forEach((slotIdx, i) => { nodes[slotIdx] = h2Nodes[i] })
  }

  const docJSON = { type: 'doc', content: nodes.map(n => n.toJSON()) }
  editor.chain().setContent(docJSON, true).run()
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

  addOptions() {
    // isDailyPage: 데일리 페이지 여부를 NodeView 빌드 시점에 알 수 있게 옵션으로 받는다.
    // (storage 만으로는 useEffect 가 첫 렌더 커밋 뒤에 세팅돼, h2 섹션 배경이 카드 틴트가
    //  아닌 불투명 색면 분기로 빌드되는 타이밍 버그가 있었음 — applyBlockBackground 참조.)
    return { isDailyPage: false }
  },

  addStorage() {
    // isReloading: setContent 등으로 문서 전체를 교체하는 동안 true
    // 이월 블록 삭제 감지 plugin이 이 플래그를 보고 감지를 건너뛴다.
    // activePageIds: 삭제되지 않은(deleted_at IS NULL) 페이지 id 집합. React 레이어가 갱신.
    //   page 블록의 pageId 가 이 집합에 없으면 = 삭제된 자식 → 고아 블록으로 숨김.
    // pageIdsLoaded: pages 목록이 로드됐는지. 로딩 중 오인 숨김 방지용.
    // isDailyPage: 옵션 기본값으로 초기화 → 첫 NodeView 빌드부터 올바른 분기. useEffect 가 런타임에 갱신.
    return { viewerMode: false, isMaster: false, isReloading: false, activePageIds: null, pageIdsLoaded: false, isDailyPage: this.options.isDailyPage }
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
      isPinned: {
        default: false,
        parseHTML: element => element.getAttribute('data-is-pinned') === 'true',
        renderHTML: attributes => attributes.isPinned ? { 'data-is-pinned': 'true' } : {},
      },
      isCarryOver: {
        default: false,
        parseHTML: element => element.getAttribute('data-carry-over') === 'true',
        renderHTML: attributes => attributes.isCarryOver ? { 'data-carry-over': 'true' } : {},
      },
      carryOverFrom: {
        default: null,
        parseHTML: element => element.getAttribute('data-carry-over-from') || null,
        renderHTML: attributes => attributes.carryOverFrom ? { 'data-carry-over-from': attributes.carryOverFrom } : {},
      },
      visibility: {
        default: 'all',
        parseHTML: element => element.getAttribute('data-visibility') || 'all',
        renderHTML: attributes => attributes.visibility && attributes.visibility !== 'all' ? { 'data-visibility': attributes.visibility } : {},
      },
      sectionId: {
        default: null,
        parseHTML: element => element.getAttribute('data-section-id') || null,
        renderHTML: attributes => attributes.sectionId ? { 'data-section-id': attributes.sectionId } : {},
      },
      sectionMasterId: {
        default: null,
        parseHTML: element => element.getAttribute('data-section-master-id') || null,
        renderHTML: attributes => attributes.sectionMasterId ? { 'data-section-master-id': attributes.sectionMasterId } : {},
      },
      isStarred: {
        default: false,
        parseHTML: element => element.getAttribute('data-starred') === 'true',
        renderHTML: attributes => attributes.isStarred ? { 'data-starred': 'true' } : {},
      },
      blockId: {
        default: null,
        parseHTML: element => element.getAttribute('data-block-id') || null,
        renderHTML: attributes => attributes.blockId ? { 'data-block-id': attributes.blockId } : {},
      },
      originBlockId: {
        default: null,
        parseHTML: element => element.getAttribute('data-origin-block-id') || null,
        renderHTML: attributes => attributes.originBlockId ? { 'data-origin-block-id': attributes.originBlockId } : {},
      },
      maybeDuplicate: {
        default: false,
        parseHTML: element => {
          const v = element.getAttribute('data-maybe-duplicate')
          if (v === 'original') return 'original'
          if (v === 'true') return true
          return false
        },
        renderHTML: attributes => attributes.maybeDuplicate ? { 'data-maybe-duplicate': String(attributes.maybeDuplicate) } : {},
      },
      // 리스트뷰 2단 좌/우 배치 (1=좌, 2=우). transient — daily_blocks 엔 저장 안 함.
      // 출처는 worklog_board_user_settings.section_cols (DailyPageV2 가 오버레이).
      col: {
        default: 1,
        parseHTML: element => element.getAttribute('data-col') === '2' ? 2 : 1,
        renderHTML: attributes => attributes.col === 2 ? { 'data-col': '2' } : {},
      },
      // 멀티컬럼 강제 break 표식 — 좌→우 그룹 경계의 첫 우측 섹션에만 true.
      colBreak: {
        default: false,
        parseHTML: element => element.getAttribute('data-col-break') === 'true',
        renderHTML: attributes => attributes.colBreak ? { 'data-col-break': 'true' } : {},
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
      dom.setAttribute('data-block-type', node.attrs.blockType || 'paragraph')
      if (node.attrs.blockId) dom.setAttribute('data-block-id', node.attrs.blockId)

      // 리스트뷰 2단 좌/우 배치 attr → DOM (CSS 멀티컬럼 / 강제 break 용)
      const applyColAttrs = (attrs) => {
        if (attrs.col === 2) dom.setAttribute('data-col', '2')
        else dom.removeAttribute('data-col')
        if (attrs.colBreak) dom.setAttribute('data-col-break', 'true')
        else dom.removeAttribute('data-col-break')
      }
      applyColAttrs(node.attrs)

      // 고아(삭제된) 페이지 블록 숨김 상태 적용.
      // pageId 가 storage.activePageIds(미삭제 페이지)에 없으면 삭제된 자식 → 숨김.
      // pageIdsLoaded=false(로딩 중)면 판정 보류해 오인 숨김 방지.
      const applyPageDeletedState = (attrs) => {
        const isPage = attrs.blockType === 'page' && attrs.pageId
        const ids = editor.storage.toggle?.activePageIds
        const loaded = editor.storage.toggle?.pageIdsLoaded
        dom.classList.toggle('toggle-page-block-deleted', !!(isPage && loaded && ids && !ids.has(attrs.pageId)))
      }

      // 초기 클래스 — 기본=마스터 전용이 norm 이므로 공유('all') 섹션만 시각 강조
      if (node.attrs.visibility === 'all' && node.attrs.blockType === 'h2') {
        dom.classList.add('toggle-shared')
      }
      if (node.attrs.isStarred) {
        dom.classList.add('toggle-starred')
      }

      // 배경색 적용 (daily h2 섹션은 카드 테마, 그 외는 색면 채우기)
      applyBlockBackground(dom, node.attrs, editor)

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
      // 선택(멀티셀렉트)된 블록만 본문 드래그 가능 — 미선택은 텍스트 선택/클릭 유지
      dom.draggable = hasMultiSelectClass(decorations)

      // 드래그 핸들 (블록 내부에 배치)
      // 자식 블록(줄)은 항상 드래그 가능. h2 섹션 핸들은 '섹션 이동 모드'에서만 CSS 로 노출되고
      // 드래그도 그때만 허용(dragstart 가드) — 섹션 순서 재배치 전용.
      const dragHandle = document.createElement('div')
      dragHandle.classList.add('toggle-drag-handle')
      dragHandle.contentEditable = 'false'
      dragHandle.draggable = true


      // 드래그 시작 로직 (드래그 핸들 ⠿ + 선택된 블록 본문 공용)
      // fromHandle=false(본문 드래그)일 땐 멀티셀렉트에 포함된 블록에서만 시작한다 —
      // 미선택 블록 본문은 기존처럼 텍스트 선택/클릭 동작을 유지(dom.draggable=false 이므로 애초에 발화 안 함).
      const startBlockDrag = (e, fromHandle) => {
        // ProseMirror dragstart가 dispatch→DOM교체→드래그 취소하므로 버블링 차단
        e.stopPropagation()

        // h2 섹션 드래그: 현재 보류(SECTION_DRAG_ENABLED=false). 활성 시엔 '섹션 이동 모드'에서만 허용.
        if (node.attrs.blockType === 'h2' && (!SECTION_DRAG_ENABLED || !editor.view.dom.closest('.daily-page-v2--move-mode'))) {
          e.preventDefault()
          return
        }

        if (typeof getPos !== 'function') return
        const pos = getPos()
        const nodeAtPos = editor.state.doc.nodeAt(pos)
        if (!nodeAtPos) return

        // multi-select 활성 + 현재 블록이 포함되면 모든 선택 블록 묶음 드래그
        const multiState = multiSelectPluginKey.getState(editor.state)
        const selectedSet = new Set(multiState?.selectedPositions || [])
        const isSelected = selectedSet.has(pos)
        const isMulti = selectedSet.size > 1 && isSelected

        // 본문 드래그는 선택된 블록에서만 — 안전 가드(미선택 본문은 기본 동작에 맡김)
        if (!fromHandle && !isSelected) return

        let dragPositions, dragNodes
        if (isMulti) {
          dragPositions = [...selectedSet].sort((a, b) => a - b)
          dragNodes = dragPositions
            .map(p => editor.state.doc.nodeAt(p))
            .filter(n => n && n.type.name === 'toggle')
        } else {
          dragPositions = [pos]
          dragNodes = [nodeAtPos]
        }

        const payload = isMulti ? dragNodes.map(n => n.toJSON()) : dragNodes[0].toJSON()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/x-thinkmap-block', JSON.stringify(payload))

        window.__crossPaneDrag = {
          sourceEditor: editor,
          sourcePositions: dragPositions,
          nodeSizes: dragNodes.map(n => n.nodeSize),
          // 호환 (단일 모드 fallback)
          sourcePos: dragPositions[0],
          nodeSize: dragNodes[0].nodeSize,
        }
        const slice = new Slice(Fragment.fromArray(dragNodes), 0, 0)
        editor.view.dragging = { slice, move: true }
        // CSS 클래스 변경 없음 — dragstart 중 어떤 DOM/스타일 변경도 브라우저가 드래그를 취소시킴
      }

      // 드래그 종료 — stale state 정리(다음 드래그 오인 방지). 핸들/본문 드래그 공용.
      const endBlockDrag = () => {
        window.__crossPaneDrag = null
        editor.view.dragging = null
      }

      // 드래그 시작 이벤트 (핸들 ⠿)
      dragHandle.addEventListener('dragstart', (e) => startBlockDrag(e, true))
      dragHandle.addEventListener('dragend', endBlockDrag)

      // 선택된 블록은 본문 어디를 잡아도 드래그 — 바탕화면 아이콘 선택→이동 메타포 완성.
      // dom.draggable 은 멀티셀렉트 상태에서만 true(초기 설정 + update() 에서 동기화).
      // 핸들 드래그는 위 핸들 dragstart 가 stopPropagation 하므로 여기 도달하지 않음.
      dom.addEventListener('dragstart', (e) => startBlockDrag(e, false))
      dom.addEventListener('dragend', endBlockDrag)

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
        // 메뉴가 대상 블록을 가리지 않도록 블록 전체 사각형(anchorRect)도 함께 전달 → 메뉴는 블록 아래/위에 배치.
        const blockRect = dom.getBoundingClientRect()
        dom.dispatchEvent(new CustomEvent('toggle-context-menu', {
          bubbles: true,
          detail: {
            pos,
            top: rect.bottom + 5,
            left: rect.left,
            anchorRect: {
              top: blockRect.top, bottom: blockRect.bottom,
              left: blockRect.left, right: blockRect.right,
              width: blockRect.width, height: blockRect.height,
            },
          }
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
        // [5] 섹션 접힘 상태는 섹션 "정체성" → worklog_sections 마스터에 write-through.
        //     (다음 날 데일리 templating 이 그대로 승계해 "섹션 카드 풀림"(전부 펼침) 방지)
        {
          const sectionMasterId = currentNode.attrs.sectionMasterId || null
          if (sectionMasterId) {
            dom.dispatchEvent(new CustomEvent('section-presentation-change', {
              bubbles: true,
              detail: { masterId: sectionMasterId, isOpen: newIsOpen },
            }))
          }
        }

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

      // 상태 아이콘 (보류/진행중/취소)
      const statusIcon = document.createElement('div')
      statusIcon.classList.add('checkbox-status-icon')
      statusIcon.innerHTML = ''
      checkbox.appendChild(statusIcon)

      const updateStatusIcon = (status) => {
        checkbox.classList.remove('status-hold', 'status-progress', 'status-cancel')
        if (status === 'hold') {
          checkbox.classList.add('status-hold')
          statusIcon.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10"><rect x="2.5" y="2" width="2.5" height="8" rx="0.8" fill="currentColor"/><rect x="7" y="2" width="2.5" height="8" rx="0.8" fill="currentColor"/></svg>'
        } else if (status === 'progress') {
          checkbox.classList.add('status-progress')
          statusIcon.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10"><path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor"/></svg>'
        } else if (status === 'cancel') {
          checkbox.classList.add('status-cancel')
          statusIcon.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5"/></svg>'
        } else {
          statusIcon.innerHTML = ''
        }
      }

      if (!node.attrs.isTodo) checkbox.style.display = 'none'
      else dom.classList.add('toggle-todo')   // 명시적 클래스 — CSS :has() 가 display:none 을 검사 못 하므로 클래스로 정확히 매치
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
        <button data-action="incomplete" class="status-popup-item status-popup-incomplete">
          <svg viewBox="0 0 12 12" width="12" height="12"><circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
          <span>미완료</span>
        </button>
        <button data-action="progress" class="status-popup-item status-popup-progress">
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M3 1.5L10 6L3 10.5V1.5Z" fill="currentColor"/></svg>
          <span>진행중</span>
        </button>
        <button data-action="hold" class="status-popup-item status-popup-hold">
          <svg viewBox="0 0 12 12" width="12" height="12"><rect x="2.5" y="2" width="2.5" height="8" rx="0.8" fill="currentColor"/><rect x="7" y="2" width="2.5" height="8" rx="0.8" fill="currentColor"/></svg>
          <span>보류</span>
        </button>
        <button data-action="done" class="status-popup-item status-popup-done">
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5L5 9L9.5 3.5"/></svg>
          <span>완료</span>
        </button>
        <button data-action="cancel" class="status-popup-item status-popup-cancel">
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5"/></svg>
          <span>취소</span>
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

        const action = btn.dataset.action
        let nextChecked = currentNode.attrs.todoChecked
        let nextStatus = currentNode.attrs.todoStatus
        let flashColor = '#6b7280'

        if (action === 'incomplete') {
          nextChecked = false; nextStatus = null; flashColor = '#9ca3af'
        } else if (action === 'progress') {
          nextChecked = false; nextStatus = 'progress'; flashColor = '#3b82f6'
        } else if (action === 'hold') {
          nextChecked = false; nextStatus = 'hold'; flashColor = '#f59e0b'
        } else if (action === 'done') {
          nextChecked = true; nextStatus = null; flashColor = '#10b981'
        } else if (action === 'cancel') {
          nextChecked = false; nextStatus = 'cancel'; flashColor = '#9ca3af'
        }

        const { tr } = editor.state
        tr.setNodeMarkup(popupNodePos, null, {
          ...currentNode.attrs,
          todoStatus: nextStatus,
          todoChecked: nextChecked,
        })
        editor.view.dispatch(tr)

        checkbox.animate([
          { transform: 'scale(1)', boxShadow: '0 0 0 0 transparent' },
          { transform: 'scale(1.3)', boxShadow: `0 0 0 4px ${flashColor}40`, offset: 0.3 },
          { transform: 'scale(0.9)', boxShadow: `0 0 0 2px ${flashColor}20`, offset: 0.6 },
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
          // 사용자 클릭 시에만 애니메이션 트리거 (DOM 재구성 시 재실행 방지)
          checkbox.classList.add('just-checked')
          setTimeout(() => checkbox.classList.remove('just-checked'), 700)
        }
        // blockId가 없으면 자동 부여
        const blockId = currentNode.attrs.blockId || (genBlockId())
        const { tr } = editor.state
        tr.setNodeMarkup(pos, null, { ...currentNode.attrs, todoChecked: willCheck, blockId })
        editor.view.dispatch(tr)

        // 교차 페이지 동기화: 같은 originBlockId를 가진 이월본 완료 상태 동기화
        const syncTodoId = currentNode.attrs.originBlockId || blockId
        if (syncTodoId && editor.storage.toggle?.isDailyPage) {
          import('../../../supabaseClient').then(({ supabase }) => {
            syncBlockAcrossPages(supabase, syncTodoId, willCheck)
          })
        }

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
        dom.setAttribute('data-page-id', node.attrs.pageId)
        button.style.display = 'none'
        checkbox.style.display = 'none'
        pageLink.style.display = ''
        pageOverlay.style.display = ''
        contentWrapper.className = 'toggle-content toggle-page-content closed'
      } else {
        pageLink.style.display = 'none'
        pageOverlay.style.display = 'none'
      }
      applyPageDeletedState(node.attrs)

      // dragover/drop은 글로벌 Plugin(blockDropIndicatorPlugin)에서 처리
      // NodeView에서는 dragstart/dragend만 관리

      // daily 페이지 안의 비-h2 블록 — star / delete 버튼 표시 조건 + 그 외에서 사용.
      const isBlockInDaily = node.attrs.blockType !== 'h2' && editor.storage.toggle?.isDailyPage

      // Pin 버튼 — v2 에서 폐기 (2026-05-07).
      //   · h2 자유 섹션 "섹션 고정": worklog_sections row 가 자동 등장이라 의미 없음
      //   · 일반 토글 핀: 사용자 가치 낮음. todo 로 만들어 처리하면 됨
      // dom 호환을 위해 button 은 만들지만 항상 숨김 + 이벤트 등록 안 함.
      const pinButton = document.createElement('button')
      pinButton.classList.add('toggle-pin-button')
      pinButton.contentEditable = 'false'
      pinButton.style.display = 'none'

      // 별표 (중요 표시) 버튼 — daily 페이지 비-h2 블록에서만
      const starButton = document.createElement('button')
      starButton.classList.add('toggle-star-button')
      starButton.contentEditable = 'false'
      starButton.title = node.attrs.isStarred ? '중요 해제' : '중요 표시'
      if (node.attrs.isStarred) starButton.classList.add('starred')
      starButton.style.display = isBlockInDaily ? '' : 'none'
      starButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
      starButton.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        if (!currentNode) return
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, null, { ...currentNode.attrs, isStarred: !currentNode.attrs.isStarred })
        )
      })

      // 블록 삭제 버튼 — daily 페이지 비-h2 블록에서만
      const deleteButton = document.createElement('button')
      deleteButton.classList.add('toggle-delete-button')
      deleteButton.contentEditable = 'false'
      deleteButton.title = '블록 삭제'
      deleteButton.style.display = isBlockInDaily ? '' : 'none'
      deleteButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>'
      deleteButton.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        if (!currentNode) return

        // 이월 항목 삭제 시 _dismissed에 기록 (재이월 방지)
        const blockId = currentNode.attrs.blockId || currentNode.attrs.originBlockId
        if (blockId && (currentNode.attrs.isCarryOver || currentNode.attrs.isPinned)) {
          // 커스텀 이벤트로 dismiss 알림
          dom.dispatchEvent(new CustomEvent('block-dismissed', {
            bubbles: true,
            detail: { blockId, originBlockId: currentNode.attrs.originBlockId }
          }))
        }

        editor.view.dispatch(editor.state.tr.delete(pos, pos + currentNode.nodeSize))
      })

      // 이월 태그
      const carryOverTag = document.createElement('span')
      carryOverTag.classList.add('toggle-carry-over-tag')
      carryOverTag.contentEditable = 'false'
      if (node.attrs.isCarryOver && node.attrs.carryOverFrom) {
        const mmdd = node.attrs.carryOverFrom.slice(5).replace('-', '/')
        carryOverTag.textContent = `이월 ${mmdd}`
        carryOverTag.style.display = ''
      } else {
        carryOverTag.style.display = 'none'
      }

      // 중복 가능 태그
      const duplicateTag = document.createElement('span')
      duplicateTag.classList.add('toggle-duplicate-tag')
      duplicateTag.contentEditable = 'false'
      duplicateTag.title = '같은 내용의 항목이 이미 있을 수 있습니다'
      if (node.attrs.maybeDuplicate === 'original') {
        duplicateTag.textContent = '원본 · 중복?'
        duplicateTag.classList.add('original')
        duplicateTag.style.display = ''
      } else if (node.attrs.maybeDuplicate) {
        duplicateTag.textContent = '중복?'
        duplicateTag.style.display = ''
      } else {
        duplicateTag.style.display = 'none'
      }

      // 공유 버튼 (h2 섹션 전용, 마스터만 조작). 기본=마스터 전용이 norm 이므로
      // 공유('all')일 때만 "공유" 배지로 강조, 마스터 전용(기본)일 땐 조용한 자물쇠(hover).
      const visibilityButton = document.createElement('button')
      visibilityButton.classList.add('toggle-visibility-button')
      visibilityButton.contentEditable = 'false'
      const isShared = node.attrs.visibility === 'all'
      visibilityButton.title = isShared ? '공유 해제 (마스터 전용으로 전환)' : '멤버에게 공유 (모두 보기)'
      if (isShared) visibilityButton.classList.add('shared')
      const showVisBtn = node.attrs.blockType === 'h2' && editor.storage.toggle?.isMaster
      visibilityButton.style.display = showVisBtn ? '' : 'none'
      // Lucide Users(공유) / Lock(마스터 전용=기본). 공유 시 강조 + "공유" 라벨, 기본은 아이콘만.
      const usersSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
      const lockSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
      visibilityButton.innerHTML = isShared
        ? `${usersSvg}<span>공유</span>`
        : lockSvg
      visibilityButton.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!editor.storage.toggle?.isMaster) return
        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        if (!currentNode) return
        const newVisibility = currentNode.attrs.visibility === 'master' ? 'all' : 'master'
        const masterId = currentNode.attrs.sectionMasterId || null
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, null, { ...currentNode.attrs, visibility: newVisibility })
        )
        // worklog_sections 의 master row 도 동기화 — 다음 daily / 리프레시 시 반영
        dom.dispatchEvent(new CustomEvent('section-visibility-toggle', {
          bubbles: true,
          detail: { masterId, newVisibility },
        }))
      })

      // 코멘트 버튼 (h2 섹션 + todo 항목)
      const commentButton = document.createElement('button')
      commentButton.classList.add('toggle-comment-button')
      commentButton.contentEditable = 'false'
      // 모든 토글에 댓글 가능 (h2 카드 / todo / 일반 자식 토글 모두). 페이지 블록 등 특수 케이스만 제외 가능.
      const showComment = node.attrs.blockType !== 'page'
      commentButton.title = node.attrs.isTodo ? 'todo 코멘트' : '섹션 코멘트'
      commentButton.style.display = showComment ? '' : 'none'
      commentButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
      commentButton.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        if (!currentNode) return
        const title = currentNode.content?.firstChild?.textContent || ''
        const targetType = currentNode.attrs.isTodo ? 'todo' : 'section'
        const blockId = currentNode.attrs.blockId || null
        const sectionId = currentNode.attrs.sectionId || null
        const originBlockId = currentNode.attrs.originBlockId || null
        dom.dispatchEvent(new CustomEvent('section-comment-click', {
          bubbles: true,
          detail: { sectionTitle: title, targetType, toggleDom: dom, blockId, sectionId, originBlockId }
        }))
      })

      // 섹션 이동 버튼 (h2 섹션 전용, daily 페이지에서만) — 클릭 시 4개 옵션 팝업
      const moveButton = document.createElement('button')
      moveButton.classList.add('toggle-move-button')
      moveButton.contentEditable = 'false'
      moveButton.title = '섹션 이동'
      moveButton.style.display = (node.attrs.blockType === 'h2' && editor.storage.toggle?.isDailyPage) ? '' : 'none'
      moveButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 9 5-5 5 5"/><path d="m7 15 5 5 5-5"/></svg>'

      // 이동 팝업 — body 에 부착 (overflow 클리핑 방지)
      const movePopup = document.createElement('div')
      movePopup.classList.add('section-move-popup')
      movePopup.contentEditable = 'false'
      movePopup.style.display = 'none'
      movePopup.innerHTML = `
        <button data-action="top" class="section-move-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/></svg>
          <span>제일 위로</span>
        </button>
        <button data-action="up" class="section-move-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          <span>위로</span>
        </button>
        <button data-action="down" class="section-move-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          <span>아래로</span>
        </button>
        <button data-action="bottom" class="section-move-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/></svg>
          <span>제일 아래로</span>
        </button>
        <div class="section-move-divider"></div>
        <button data-action="col-left" class="section-move-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          <span>왼쪽 단으로</span>
        </button>
        <button data-action="col-right" class="section-move-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          <span>오른쪽 단으로</span>
        </button>
      `
      document.body.appendChild(movePopup)

      // 섹션 좌/우 단 변경 → DailyPageV2 가 수신할 이벤트 dispatch (editor dom 에서 bubble)
      const dispatchColChange = (col) => {
        const pos = getPos()
        if (pos == null) return
        const n = editor.state.doc.nodeAt(pos)
        if (!n) return
        editor.view.dom.dispatchEvent(new CustomEvent('section-col-change', {
          bubbles: true,
          detail: { sectionMasterId: n.attrs.sectionMasterId, blockId: n.attrs.blockId, col },
        }))
      }

      const showMovePopup = () => {
        const rect = moveButton.getBoundingClientRect()
        movePopup.style.display = ''
        // 측정 후 위치 보정 — 화면 우측/하단 잘림 방지
        const popupRect = movePopup.getBoundingClientRect()
        let left = rect.right - popupRect.width
        let top = rect.bottom + 4
        if (left < 8) left = 8
        if (top + popupRect.height > window.innerHeight - 8) top = rect.top - popupRect.height - 4
        movePopup.style.left = left + 'px'
        movePopup.style.top = top + 'px'
        movePopup.animate([
          { opacity: 0, transform: 'scale(0.92) translateY(-4px)' },
          { opacity: 1, transform: 'scale(1) translateY(0)' },
        ], { duration: 140, easing: 'ease-out' })

        // 가능/불가 항목 비활성화 표시
        const $pos = editor.state.doc.resolve(getPos())
        const parent = $pos.parent
        let h2Total = 0, myH2Idx = -1
        if (parent.type.name === 'doc') {
          parent.forEach((child, _o, idx) => {
            if (child.type.name === 'toggle' && child.attrs?.blockType === 'h2') {
              if (idx === $pos.index()) myH2Idx = h2Total
              h2Total++
            }
          })
        }
        const cantUp = myH2Idx <= 0
        const cantDown = myH2Idx === -1 || myH2Idx >= h2Total - 1
        movePopup.querySelector('[data-action="top"]').classList.toggle('disabled', cantUp)
        movePopup.querySelector('[data-action="up"]').classList.toggle('disabled', cantUp)
        movePopup.querySelector('[data-action="down"]').classList.toggle('disabled', cantDown)
        movePopup.querySelector('[data-action="bottom"]').classList.toggle('disabled', cantDown)
      }
      const hideMovePopup = () => { movePopup.style.display = 'none' }

      moveButton.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (movePopup.style.display !== 'none') { hideMovePopup(); return }
        showMovePopup()
      })

      movePopup.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const btn = e.target.closest('.section-move-item')
        if (!btn || btn.classList.contains('disabled')) return
        const action = btn.dataset.action
        if (action === 'col-left') dispatchColChange(1)
        else if (action === 'col-right') dispatchColChange(2)
        else moveH2SectionAtPos(editor, getPos(), action)
        hideMovePopup()
      })

      const handleDocClickForMovePopup = (ev) => {
        if (movePopup.style.display !== 'none' && !movePopup.contains(ev.target) && ev.target !== moveButton && !moveButton.contains(ev.target)) {
          hideMovePopup()
        }
      }
      document.addEventListener('mousedown', handleDocClickForMovePopup)

      // 섹션 색상 버튼 (h2 섹션 전용, daily 페이지에서만) — 카드가 색을 "입음"
      const colorButton = document.createElement('button')
      colorButton.classList.add('toggle-color-button')
      colorButton.contentEditable = 'false'
      colorButton.title = '카드 색상'
      const showColorBtn = node.attrs.blockType === 'h2' && editor.storage.toggle?.isDailyPage
      colorButton.style.display = showColorBtn ? '' : 'none'
      // Lucide Palette
      colorButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>'

      // 색상 팝업 — body 에 부착 (overflow 클리핑 방지)
      const colorPopup = document.createElement('div')
      colorPopup.classList.add('section-color-popup')
      colorPopup.contentEditable = 'false'
      colorPopup.style.display = 'none'
      colorPopup.innerHTML = SECTION_CARD_COLORS.map(c => `
        <button class="section-color-swatch" data-color="${c.value ?? ''}" title="${c.name}">
          <span class="section-color-dot" style="${c.value
            ? `background:${c.value}`
            : 'background:transparent;border:1px dashed rgba(255,255,255,0.4)'}"></span>
        </button>
      `).join('')
      document.body.appendChild(colorPopup)

      const showColorPopup = () => {
        // 현재 선택 색 표시
        const cur = editor.state.doc.nodeAt(getPos())?.attrs.backgroundColor ?? null
        colorPopup.querySelectorAll('.section-color-swatch').forEach(sw => {
          sw.classList.toggle('is-active', (sw.dataset.color || null) === (cur || null))
        })
        const rect = colorButton.getBoundingClientRect()
        colorPopup.style.display = ''
        const popupRect = colorPopup.getBoundingClientRect()
        let left = rect.right - popupRect.width
        let top = rect.bottom + 4
        if (left < 8) left = 8
        if (top + popupRect.height > window.innerHeight - 8) top = rect.top - popupRect.height - 4
        colorPopup.style.left = left + 'px'
        colorPopup.style.top = top + 'px'
        colorPopup.animate([
          { opacity: 0, transform: 'scale(0.92) translateY(-4px)' },
          { opacity: 1, transform: 'scale(1) translateY(0)' },
        ], { duration: 140, easing: 'ease-out' })
      }
      const hideColorPopup = () => { colorPopup.style.display = 'none' }

      colorButton.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (colorPopup.style.display !== 'none') { hideColorPopup(); return }
        showColorPopup()
      })

      colorPopup.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const sw = e.target.closest('.section-color-swatch')
        if (!sw) return
        const value = sw.dataset.color || null
        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        if (currentNode) {
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, null, { ...currentNode.attrs, backgroundColor: value })
          )
          // [5] 섹션 배경색은 섹션 "정체성" → worklog_sections 마스터에 write-through.
          //     (다음 날 데일리 templating 이 승계해 "섹션색 유실" 방지)
          const masterId = currentNode.attrs.sectionMasterId || null
          if (masterId) {
            dom.dispatchEvent(new CustomEvent('section-presentation-change', {
              bubbles: true,
              detail: { masterId, backgroundColor: value },
            }))
          }
        }
        hideColorPopup()
      })

      const handleDocClickForColorPopup = (ev) => {
        if (colorPopup.style.display !== 'none' && !colorPopup.contains(ev.target) && ev.target !== colorButton && !colorButton.contains(ev.target)) {
          hideColorPopup()
        }
      }
      document.addEventListener('mousedown', handleDocClickForColorPopup)

      // ⋮ 메뉴 (daily 페이지의 자식 토글 한정 — h2 카드 제외)
      const moreButton = document.createElement('button')
      moreButton.classList.add('toggle-more-button')
      moreButton.contentEditable = 'false'
      moreButton.title = '추가 옵션'
      moreButton.style.display = (node.attrs.blockType !== 'h2' && editor.storage.toggle?.isDailyPage) ? '' : 'none'
      // 가로 세점 (MoreHorizontal)
      moreButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>'
      moreButton.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = getPos()
        const currentNode = editor.state.doc.nodeAt(pos)
        if (!currentNode) return
        const rect = moreButton.getBoundingClientRect()
        const title = currentNode.content?.firstChild?.textContent || ''
        dom.dispatchEvent(new CustomEvent('toggle-more-menu', {
          bubbles: true,
          detail: {
            blockId: currentNode.attrs.blockId || null,
            originBlockId: currentNode.attrs.originBlockId || null,
            isCarryOver: !!currentNode.attrs.isCarryOver,
            isStarred: !!currentNode.attrs.isStarred,
            isTodo: !!currentNode.attrs.isTodo,
            title,
            anchorRect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right },
            pos,
            editor,  // 2단 분할 시 어느 패널 에디터인지 — 별표 등 pos 기반 동작이 올바른 doc 을 참조하도록
          }
        }))
      })

      // 오른쪽 액션 그룹 — 하위 토글이어도 항상 오른쪽 끝에 정렬
      const actionsGroup = document.createElement('div')
      actionsGroup.classList.add('toggle-actions-group')
      actionsGroup.contentEditable = 'false'
      actionsGroup.appendChild(duplicateTag)
      actionsGroup.appendChild(carryOverTag)
      actionsGroup.appendChild(moveButton)
      actionsGroup.appendChild(colorButton)
      actionsGroup.appendChild(visibilityButton)
      actionsGroup.appendChild(commentButton)
      actionsGroup.appendChild(starButton)
      actionsGroup.appendChild(pinButton)
      actionsGroup.appendChild(moreButton)
      actionsGroup.appendChild(deleteButton)

      dom.appendChild(dragHandle)
      dom.appendChild(pageLink)
      dom.appendChild(button)
      dom.appendChild(checkbox)
      dom.appendChild(contentWrapper)
      dom.appendChild(actionsGroup)
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
            applyPageDeletedState(updatedNode.attrs)
          } else {
            pageLink.style.display = 'none'
            pageOverlay.style.display = 'none'
            button.style.display = ''
            dom.removeAttribute('data-page-id')
            dom.classList.remove('toggle-page-block-deleted')
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
              dom.classList.add('toggle-todo')
              checkbox.classList.toggle('checked', updatedNode.attrs.todoChecked && !updatedNode.attrs.todoStatus)
              dom.classList.toggle('toggle-todo-checked', updatedNode.attrs.todoChecked && !updatedNode.attrs.todoStatus)
              updateStatusIcon(updatedNode.attrs.todoStatus)
            } else {
              checkbox.style.display = 'none'
              dom.classList.remove('toggle-todo')
              checkbox.classList.remove('checked')
              dom.classList.remove('toggle-todo-checked')
              updateStatusIcon(null)
            }
          }

          // 이월 태그 업데이트
          if (updatedNode.attrs.isCarryOver && updatedNode.attrs.carryOverFrom) {
            const mmdd = updatedNode.attrs.carryOverFrom.slice(5).replace('-', '/')
            carryOverTag.textContent = `이월 ${mmdd}`
            carryOverTag.style.display = ''
          } else {
            carryOverTag.style.display = 'none'
          }

          // 중복 태그 업데이트
          if (updatedNode.attrs.maybeDuplicate === 'original') {
            duplicateTag.textContent = '원본 · 중복?'
            duplicateTag.classList.add('original')
            duplicateTag.style.display = ''
          } else if (updatedNode.attrs.maybeDuplicate) {
            duplicateTag.textContent = '중복?'
            duplicateTag.classList.remove('original')
            duplicateTag.style.display = ''
          } else {
            duplicateTag.style.display = 'none'
            duplicateTag.classList.remove('original')
          }

          // 배경색 업데이트 (daily h2 섹션은 카드 테마, 그 외는 색면 채우기)
          applyBlockBackground(dom, updatedNode.attrs, editor)

          // Visibility 버튼 상태 업데이트
          const showVis = updatedNode.attrs.blockType === 'h2' && editor.storage.toggle?.isMaster
          visibilityButton.style.display = showVis ? '' : 'none'
          const isSharedVis = updatedNode.attrs.visibility === 'all'
          visibilityButton.classList.toggle('shared', isSharedVis)
          visibilityButton.title = isSharedVis ? '공유 해제 (마스터 전용으로 전환)' : '멤버에게 공유 (모두 보기)'
          const usersSvg2 = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
          const lockSvg2 = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
          visibilityButton.innerHTML = isSharedVis
            ? `${usersSvg2}<span>공유</span>`
            : lockSvg2
          // 공유 섹션에 시각적 표시 (기본=마스터 전용은 표시 없음)
          dom.classList.toggle('toggle-shared', isSharedVis && updatedNode.attrs.blockType === 'h2')

          // 리스트뷰 2단 좌/우 배치 attr 반영
          applyColAttrs(updatedNode.attrs)

          // 섹션 이동 버튼 상태 업데이트
          const showMove = updatedNode.attrs.blockType === 'h2' && editor.storage.toggle?.isDailyPage
          moveButton.style.display = showMove ? '' : 'none'
          if (!showMove && movePopup.style.display !== 'none') hideMovePopup()

          // 섹션 색상 버튼 상태 업데이트 (이동 버튼과 동일 조건)
          colorButton.style.display = showMove ? '' : 'none'
          if (!showMove && colorPopup.style.display !== 'none') hideColorPopup()

          // 코멘트 버튼 상태 업데이트
          const showCmt = updatedNode.attrs.blockType === 'h2' || updatedNode.attrs.isTodo
          commentButton.style.display = showCmt ? '' : 'none'

          // Pin 버튼 — v2 에서 폐기. 항상 숨김.
          pinButton.style.display = 'none'

          // 별표 버튼 상태 업데이트
          const isBlockInDailyUpd = updatedNode.attrs.blockType !== 'h2' && editor.storage.toggle?.isDailyPage
          starButton.style.display = isBlockInDailyUpd ? '' : 'none'
          starButton.classList.toggle('starred', !!updatedNode.attrs.isStarred)
          dom.classList.toggle('toggle-starred', !!updatedNode.attrs.isStarred)

          // 삭제 버튼 상태 업데이트
          deleteButton.style.display = isBlockInDailyUpd ? '' : 'none'

          // Decoration 반영 (Plugin이 전달한 포커스 상태)
          dom.classList.toggle('toggle-block-focused', hasFocusClass(outerDecorations))
          dom.classList.toggle('toggle-checkbox-focused', hasCheckboxFocusClass(outerDecorations))
          dom.classList.toggle('toggle-block-multiselected', hasMultiSelectClass(outerDecorations))
          // 선택 상태 변화에 맞춰 본문 드래그 가능 여부 동기화 (A: 선택 블록 본문 드래그)
          dom.draggable = hasMultiSelectClass(outerDecorations)

          return true
        },
        destroy: () => {
          if (statusPopup.parentElement) statusPopup.remove()
          if (movePopup.parentElement) movePopup.remove()
          if (colorPopup.parentElement) colorPopup.remove()
          document.removeEventListener('mousedown', handleDocClickForPopup)
          document.removeEventListener('mousedown', handleDocClickForMovePopup)
          document.removeEventListener('mousedown', handleDocClickForColorPopup)
          // DOM 이벤트 리스너는 dom이 GC될 때 자동 해제되므로 별도 해제 불필요
        },
      }
    }
  },

  addProseMirrorPlugins() {
    const extensionThis = this
    // 글로벌 드롭 인디케이터 상태 (Plugin view ↔ handleDrop 공유)
    const _dropState = { target: null }

    // 드롭 좌표로부터 타겟 토글/모드(before/after/inside)를 직접 계산한다.
    // handleDrop 이 디바운스/별도 drop 리스너로 비워질 수 있는 _dropState.target 에
    // 의존하면, inside 인디케이터가 보였는데도 형제로 떨어지는 경합이 생긴다.
    // → 드롭 순간 좌표(authoritative)로 재계산해 경합을 제거. dragover 와 동일 로직.
    const computeDropTarget = (view, clientX, clientY) => {
      const coords = view.posAtCoords({ left: clientX, top: clientY })
      if (!coords) return null
      const $pos = view.state.doc.resolve(coords.pos)

      const crossDrag = window.__crossPaneDrag
      let draggedIsSection = false
      if (SECTION_DRAG_ENABLED && crossDrag?.sourcePositions?.length === 1) {
        const dn = crossDrag.sourceEditor?.state.doc.nodeAt(crossDrag.sourcePositions[0])
        draggedIsSection = !!(dn && dn.type.name === 'toggle' && dn.attrs.blockType === 'h2')
      }

      let togglePos = null, toggleNode = null
      if (draggedIsSection) {
        for (let d = 1; d <= $pos.depth; d++) {
          if ($pos.node(d).type.name === 'toggle') { togglePos = $pos.before(d); toggleNode = $pos.node(d); break }
        }
      } else {
        for (let d = $pos.depth; d >= 1; d--) {
          if ($pos.node(d).type.name === 'toggle') { togglePos = $pos.before(d); toggleNode = $pos.node(d); break }
        }
      }
      if (togglePos == null) return null

      const targetDom = view.nodeDOM(togglePos)
      if (!targetDom?.getBoundingClientRect) return null
      const rect = targetDom.getBoundingClientRect()
      const yInBlock = clientY - rect.top

      let mode
      if (draggedIsSection) {
        if (yInBlock < rect.height * 0.35) mode = 'before'
        else if (yInBlock > rect.height * 0.65) mode = 'after'
        else mode = 'inside'
      } else {
        const EDGE = 8
        if (yInBlock <= EDGE) mode = 'before'
        else if (yInBlock >= rect.height - EDGE) mode = 'after'
        else mode = 'inside'
      }

      return {
        pos: mode === 'after' ? togglePos + toggleNode.nodeSize : togglePos,
        mode,
        togglePos,
        toggleNodeSize: toggleNode.nodeSize,
      }
    }

    // 블록 드래그 드롭 실제 처리. PM handleDrop(편집모드)과 editorView.dom drop 리스너(뷰어 모드)
    // 양쪽에서 공유한다 — 뷰어 모드(editable:false)에선 ProseMirror 가 handleDrop 을 호출하지
    // 않으므로(editHandlers 미등록), DOM drop 리스너에서 직접 이 함수를 부른다.
    // view.dispatch 는 editable 과 무관하게 동작하므로 뷰어 모드에서도 안전.
    const handleBlockDrop = (view, event) => {
      // 드롭 순간 좌표로 타겟 재계산(authoritative). 경합으로 비워졌을 수 있는
      // _dropState.target 은 fallback 으로만 사용 → inside 가 형제로 새는 문제 방지.
      const target = computeDropTarget(view, event.clientX, event.clientY) || _dropState.target
      const crossDrag = window.__crossPaneDrag
      const { state } = view

      // JSON에서 토글 복원 (PM이 토글을 paragraph로 분해하므로) — 단일/다중 둘 다 처리
      let contentToInsert = null
      const blockJSON = event.dataTransfer.getData('application/x-thinkmap-block')
      if (blockJSON) {
        try {
          const parsed = JSON.parse(blockJSON)
          const list = Array.isArray(parsed) ? parsed : [parsed]
          const restored = list.map(j => state.schema.nodeFromJSON(j))
          contentToInsert = Fragment.fromArray(restored)
        } catch { /* */ }
      }
      if (!contentToInsert && crossDrag) {
        const positions = crossDrag.sourcePositions || [crossDrag.sourcePos]
        const nodes = positions
          .map(p => crossDrag.sourceEditor.state.doc.nodeAt(p))
          .filter(Boolean)
        if (nodes.length) contentToInsert = Fragment.fromArray(nodes.map(n => n.copy(n.content)))
      }
      if (!contentToInsert) { view.dragging = null; window.__crossPaneDrag = null; return true }

      // 섹션(h2)을 다른 섹션 내부로 떨굼 = 통합 → 사용자 확인. 취소 시 드롭 무효.
      const draggedFirst = contentToInsert.firstChild
      const draggedIsSection = SECTION_DRAG_ENABLED && draggedFirst?.type.name === 'toggle' && draggedFirst.attrs.blockType === 'h2'
      if (draggedIsSection && target?.mode === 'inside') {
        if (!window.confirm('섹션 내부로 통합하시겠습니까?')) {
          view.dragging = null
          window.__crossPaneDrag = null
          return true
        }
      }

      // 소스 정보 — 단일/다중 통합 (sourcePositions[] / sourceSizes[])
      let sourcePositions = null, sourceSizes = null
      if (crossDrag && crossDrag.sourceEditor?.view === view) {
        sourcePositions = crossDrag.sourcePositions || [crossDrag.sourcePos]
        sourceSizes = crossDrag.nodeSizes || [crossDrag.nodeSize]
      }

      // 드롭 위치 결정
      let insertPos
      if (target) {
        insertPos = target.pos
      } else {
        // fallback: posAtCoords로 가장 가까운 토글 뒤에 삽입
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (!coords) { insertPos = state.doc.content.size }
        else {
          const $p = state.doc.resolve(coords.pos)
          insertPos = coords.pos
          for (let d = $p.depth; d > 0; d--) {
            if ($p.node(d).type.name === 'toggle') { insertPos = $p.after(d); break }
          }
        }
      }

      // 자기 자신/포함 영역(소스의 내용 안)에 드롭이면 무시 (다중 중 하나라도 포함되면 무시)
      // 상한은 strict(<): sp+ss 는 소스 닫는 토큰 '다음' = 소스 밖 형제 경계다.
      // 인접한 블록을 바로 다음 형제 토글 inside 로 떨굴 때 insertPos == sp+ss 가 되는데,
      // <= 로 두면 이 정상 경계를 "자기 포함"으로 오판해 드롭이 통째로 무효화된다(형제로 남음).
      if (sourcePositions) {
        for (let i = 0; i < sourcePositions.length; i++) {
          const sp = sourcePositions[i], ss = sourceSizes[i]
          if (insertPos >= sp && insertPos < sp + ss) {
            view.dragging = null; window.__crossPaneDrag = null; return true
          }
        }
      }

      try {
        const { tr } = state
        // 소스 삭제 — 큰 위치부터 (mapping 영향 회피)
        if (sourcePositions) {
          const sortedSrc = sourcePositions
            .map((p, i) => ({ p, s: sourceSizes[i] }))
            .sort((a, b) => b.p - a.p)
          for (const { p, s } of sortedSrc) {
            const srcNode = tr.doc.nodeAt(p)
            if (srcNode && srcNode.nodeSize === s) tr.delete(p, p + srcNode.nodeSize)
          }
        }
        let mappedPos = tr.mapping.map(insertPos)

        if (target?.mode === 'inside') {
          // 내부 삽입: 토글의 마지막 자식으로
          const tPos = tr.mapping.map(target.togglePos)
          const tNode = tr.doc.nodeAt(tPos)
          if (tNode) {
            if (!tNode.attrs.isOpen) tr.setNodeMarkup(tPos, null, { ...tNode.attrs, isOpen: true })
            mappedPos = tPos + tNode.nodeSize - 1
          }
        }

        tr.insert(mappedPos, contentToInsert)
        tr.setMeta('toggleButtonClick', true)
        view.dispatch(tr)
      } catch (err) { console.error('블록 드롭 오류:', err) }

      // 크로스 패널 소스 삭제 — 다중 노드 큰 위치부터
      if (crossDrag && crossDrag.sourceEditor?.view !== view) {
        try {
          const positions = crossDrag.sourcePositions || [crossDrag.sourcePos]
          const sizes = crossDrag.nodeSizes || [crossDrag.nodeSize]
          const sortedSrc = positions.map((p, i) => ({ p, s: sizes[i] })).sort((a, b) => b.p - a.p)
          const srcTr = crossDrag.sourceEditor.state.tr
          for (const { p, s } of sortedSrc) {
            const srcNode = srcTr.doc.nodeAt(p)
            if (srcNode && srcNode.nodeSize === s) srcTr.delete(p, p + srcNode.nodeSize)
          }
          if (srcTr.docChanged) crossDrag.sourceEditor.view.dispatch(srcTr)
        } catch { /* */ }
      }

      // multi-select 상태 초기화 — drop 후 잔존 highlight 방지
      try {
        view.dispatch(view.state.tr.setMeta(multiSelectPluginKey, { type: 'clear' }))
      } catch { /* */ }

      view.dragging = null
      window.__crossPaneDrag = null
      return true
    }

    return [
      // ── 글로벌 블록 드래그 인디케이터 ──
      // 단일 floating 라인으로 모든 깊이에서 일관된 드롭 피드백 제공
      new Plugin({
        key: new PluginKey('blockDropIndicator'),
        view(editorView) {
          const indicator = document.createElement('div')
          indicator.className = 'block-drop-indicator'
          document.body.appendChild(indicator)

          let debounceTimer = null
          let autoOpenTimer = null

          const isBlockDrag = (e) => {
            const types = Array.from(e.dataTransfer?.types || [])
            return types.includes('application/x-thinkmap-block') || !!window.__crossPaneDrag
          }

          const clearIndicator = () => {
            indicator.className = 'block-drop-indicator'
            indicator.style.display = 'none'
            indicator.style.height = ''
            _dropState.target = null
            if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
            if (autoOpenTimer) { clearTimeout(autoOpenTimer); autoOpenTimer = null }
          }

          const onDragOver = (e) => {
            if (!isBlockDrag(e)) return

            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'

            // debounce
            if (debounceTimer) clearTimeout(debounceTimer)
            debounceTimer = setTimeout(clearIndicator, 200)

            // ProseMirror 위치 해석으로 가장 가까운 토글 찾기
            const coords = editorView.posAtCoords({ left: e.clientX, top: e.clientY })
            if (!coords) { clearIndicator(); return }

            const { state } = editorView
            const $pos = state.doc.resolve(coords.pos)

            // 드래그 중인 게 h2 섹션인가 — 섹션 드래그면 타겟을 '최상위 섹션' 단위로 잡는다
            // (자식 줄에 잡히면 위치가 어긋나고 자기 섹션 안으로 떨어져 무효가 됨)
            const crossDrag = window.__crossPaneDrag
            let draggedIsSection = false
            if (SECTION_DRAG_ENABLED && crossDrag?.sourcePositions?.length === 1) {
              const dn = crossDrag.sourceEditor?.state.doc.nodeAt(crossDrag.sourcePositions[0])
              draggedIsSection = !!(dn && dn.type.name === 'toggle' && dn.attrs.blockType === 'h2')
            }

            // 토글 찾기: 섹션 드래그면 최상위(가장 얕은) 토글, 아니면 가장 가까운(가장 깊은) 토글
            let togglePos = null, toggleNode = null
            if (draggedIsSection) {
              for (let d = 1; d <= $pos.depth; d++) {
                if ($pos.node(d).type.name === 'toggle') {
                  togglePos = $pos.before(d)
                  toggleNode = $pos.node(d)
                  break
                }
              }
            } else {
              for (let d = $pos.depth; d >= 1; d--) {
                if ($pos.node(d).type.name === 'toggle') {
                  togglePos = $pos.before(d)
                  toggleNode = $pos.node(d)
                  break
                }
              }
            }
            if (togglePos == null) { clearIndicator(); return }

            // 자기 자신 드래그 중이면 무시
            if (crossDrag && crossDrag.sourceEditor?.view === editorView && togglePos === crossDrag.sourcePos) return

            // DOM rect로 모드 결정
            const targetDom = editorView.nodeDOM(togglePos)
            if (!targetDom?.getBoundingClientRect) { clearIndicator(); return }
            const rect = targetDom.getBoundingClientRect()
            const yInBlock = e.clientY - rect.top

            let mode
            if (draggedIsSection) {
              // 섹션 재배치: 위/아래 넓게(각 35%) before/after, 가운데 30% 만 통합(merge)
              // (섹션은 키가 커서 가장자리만 재배치로 두면 거의 통합으로 잡힘)
              if (yInBlock < rect.height * 0.35) mode = 'before'
              else if (yInBlock > rect.height * 0.65) mode = 'after'
              else mode = 'inside'
            } else {
              const EDGE = 8
              if (yInBlock <= EDGE) mode = 'before'
              else if (yInBlock >= rect.height - EDGE) mode = 'after'
              else mode = 'inside'
            }

            if (mode === 'inside') {
              // 섹션을 섹션 내부로 = 통합 → 호박색 박스로 구분 (단순 재배치인 파란 줄과 명확히 다름)
              indicator.className = 'block-drop-indicator drop-box' + (draggedIsSection ? ' drop-box--merge' : '')
              indicator.style.top = rect.top + 'px'
              indicator.style.left = rect.left + 'px'
              indicator.style.width = rect.width + 'px'
              indicator.style.height = rect.height + 'px'
              indicator.style.display = 'block'

              // 닫힌 토글 자동 열기 (600ms 호버)
              if (!autoOpenTimer && toggleNode && !toggleNode.attrs.isOpen) {
                autoOpenTimer = setTimeout(() => {
                  autoOpenTimer = null
                  try {
                    const n = editorView.state.doc.nodeAt(togglePos)
                    if (n && n.type.name === 'toggle' && !n.attrs.isOpen) {
                      const { tr } = editorView.state
                      tr.setNodeMarkup(togglePos, null, { ...n.attrs, isOpen: true })
                      tr.setMeta('toggleButtonClick', true)
                      editorView.dispatch(tr)
                    }
                  } catch { /* 위치가 stale할 수 있음 */ }
                }, 600)
              }
            } else {
              // before/after: 파란 줄 표시
              if (autoOpenTimer) { clearTimeout(autoOpenTimer); autoOpenTimer = null }

              const lineY = mode === 'before' ? rect.top : rect.bottom
              indicator.className = 'block-drop-indicator drop-line'
              indicator.style.top = (lineY - 1) + 'px'
              indicator.style.left = rect.left + 'px'
              indicator.style.width = rect.width + 'px'
              indicator.style.height = ''
              indicator.style.display = 'block'
            }

            _dropState.target = {
              pos: mode === 'after' ? togglePos + toggleNode.nodeSize : togglePos,
              mode,
              togglePos,
              toggleNodeSize: toggleNode.nodeSize,
            }
          }

          const onDragLeave = (e) => {
            // 에디터 밖으로 나갔을 때만 정리
            if (!editorView.dom.contains(e.relatedTarget)) clearIndicator()
          }
          // 드롭/드래그 종료(취소·ESC 포함) 시 인디케이터 즉시 제거 — 디바운스만으로는 손 뗀 뒤에도 선이 남음.
          // dragend 는 소스 요소에서 발생하므로 document 레벨에서 듣는다.
          const onDragEndGlobal = () => clearIndicator()

          // 뷰어 모드(editable:false)에선 ProseMirror 가 drop(editHandlers)을 등록하지 않아
          // handleDrop 이 호출되지 않는다. 마키 다중선택 드래그는 뷰어 모드에서도 동작하므로
          // 여기서 직접 블록 드롭을 처리한다. 편집모드는 PM handleDrop 이 같은 handleBlockDrop 을
          // 부르므로 여기선 건너뛴다(중복 방지). capture 단계로 PM 핸들러보다 먼저 잡는다.
          const onViewerBlockDrop = (e) => {
            if (editorView.editable) return
            if (!isBlockDrag(e)) return
            e.preventDefault()
            try { handleBlockDrop(editorView, e) } catch (err) { console.error('뷰어 블록 드롭 오류:', err) }
            clearIndicator()
          }

          editorView.dom.addEventListener('dragover', onDragOver)
          editorView.dom.addEventListener('dragleave', onDragLeave)
          editorView.dom.addEventListener('drop', onViewerBlockDrop, true)
          editorView.dom.addEventListener('drop', onDragEndGlobal)
          document.addEventListener('dragend', onDragEndGlobal)
          document.addEventListener('drop', onDragEndGlobal)

          return {
            destroy() {
              indicator.remove()
              editorView.dom.removeEventListener('dragover', onDragOver)
              editorView.dom.removeEventListener('dragleave', onDragLeave)
              editorView.dom.removeEventListener('drop', onViewerBlockDrop, true)
              editorView.dom.removeEventListener('drop', onDragEndGlobal)
              document.removeEventListener('dragend', onDragEndGlobal)
              document.removeEventListener('drop', onDragEndGlobal)
              clearIndicator()
            }
          }
        },
      }),

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
          // 붙여넣기 시 블록 단위 보장 + toggle 식별 attr 재생성 (DB UNIQUE 충돌 방지)
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
              // 모든 toggle 자손의 blockId 등 재생성
              const regenChildren = []
              slice.content.forEach(n => regenChildren.push(regenToggleIds(n)))
              return new Slice(Fragment.fromArray(regenChildren), 0, 0)
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
              ? { isTodo: true, todoChecked: false, blockId: genBlockId() }
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
          // 블록 드래그 드롭 + 텍스트 드래그 중첩 방지
          handleDrop(view, event, slice, moved) {
            const isBlockDrag = event.dataTransfer.types.includes('application/x-thinkmap-block')
              || !!window.__crossPaneDrag

            // 블록 드래그는 공용 핸들러로 위임 (뷰어 모드 DOM drop 리스너와 동일 경로)
            if (isBlockDrag) return handleBlockDrop(view, event)

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
      // h2 섹션에 sectionId가 없으면 자동 부여 (기존 데이터 마이그레이션)
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null
          const fixes = []
          newState.doc.forEach((node, offset) => {
            if (node.type.name === 'toggle' && node.attrs.blockType === 'h2' && !node.attrs.sectionId) {
              fixes.push({ pos: offset, attrs: node.attrs })
            }
          })
          if (fixes.length === 0) return null
          const tr = newState.tr
          for (let i = fixes.length - 1; i >= 0; i--) {
            const { pos, attrs } = fixes[i]
            const id = 'sec_' + Math.random().toString(36).slice(2, 10)
            tr.setNodeMarkup(pos, null, { ...attrs, sectionId: id })
          }
          tr.setMeta('sectionIdAssign', true)
          return tr
        },
      }),
      // daily 페이지: blockId 유일성 불변식 보장.
      //  ① blockId 가 없는 토글 → 발급 (기존 동작)
      //  ② blockId 가 doc 안에서 이미 등장한 적 있으면(중복) → 새 id 재발급
      // block_id 는 daily_blocks 의 글로벌 PRIMARY KEY 다. 같은 blockId 토글이 둘이면
      // docToBlocks.flattenDoc 의 Map(set by blockId) 에서 뒤가 앞을 덮어써 한 블록이 조용히
      // 사라지고(저장 누락), cross-page insert 는 PK 위반으로 throw→refetch 되며 유실된다.
      // 중복본을 독립 블록으로 분리(새 id)해 양쪽 모두 보존한다. (붙여넣기는 transformPasted 가
      // 이미 regenToggleIds 로 처리 → 여기선 드래그 복원/undo/프로그램 삽입 등 잔여 경로를 커버.)
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null
          if (!extensionThis.storage.isDailyPage) return null
          const fixes = []
          const seen = new Set()
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'toggle') return true
            // h2/h3 섹션은 sectionId 체계 → blockId 부여 대상 아님
            if (node.attrs.blockType === 'h2' || node.attrs.blockType === 'h3') return true
            const id = node.attrs.blockId
            if (!id) {
              fixes.push({ pos, attrs: node.attrs })        // ① 누락 → 발급
            } else if (seen.has(id)) {
              fixes.push({ pos, attrs: node.attrs })        // ② 중복 → 재발급
            } else {
              seen.add(id)
            }
            return true
          })
          if (fixes.length === 0) return null
          const tr = newState.tr
          for (let i = fixes.length - 1; i >= 0; i--) {
            const { pos, attrs } = fixes[i]
            tr.setNodeMarkup(pos, null, { ...attrs, blockId: genBlockId() })
          }
          tr.setMeta('blockIdAssign', true)
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

      // ── 이월/고정 블록 삭제 감지: 삭제 경로 무관하게 block-dismissed 이벤트 발행 ──
      // setContent로 인한 문서 교체는 storage.isReloading 플래그로 제외
      new Plugin({
        key: new PluginKey('carryOverDismissTracker'),
        view(view) {
          const collectTrackable = (doc) => {
            const map = new Map()
            doc.descendants((node) => {
              if (
                node.type.name === 'toggle' &&
                node.attrs?.blockId &&
                (node.attrs?.isCarryOver || node.attrs?.isPinned)
              ) {
                map.set(node.attrs.blockId, node.attrs.originBlockId || null)
              }
            })
            return map
          }
          const collectBlockIds = (doc) => {
            const set = new Set()
            doc.descendants((node) => {
              if (node.type.name === 'toggle' && node.attrs?.blockId) {
                set.add(node.attrs.blockId)
              }
            })
            return set
          }

          return {
            update(view, prevState) {
              if (extensionThis.storage?.isReloading) return
              const newDoc = view.state.doc
              if (newDoc === prevState.doc) return

              const prevTracked = collectTrackable(prevState.doc)
              if (prevTracked.size === 0) return

              const newIds = collectBlockIds(newDoc)
              const deleted = []
              prevTracked.forEach((originBlockId, blockId) => {
                if (!newIds.has(blockId)) deleted.push({ blockId, originBlockId })
              })
              if (deleted.length === 0) return

              for (const detail of deleted) {
                view.dom.dispatchEvent(new CustomEvent('block-dismissed', {
                  bubbles: true, detail,
                }))
              }
            },
          }
        },
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

      /**
       * 모든 토글의 isOpen 을 일괄 설정.
       * - depth 가 number: 1..depth 깊이 토글은 열고, 그 이상은 닫음 (top-level toggle = depth 1).
       *   - depth = 0 → 전체 닫기
       *   - depth = Infinity → 전체 열기
       * tr 기반 동작 — setContent 와 달리 cursor/selection 유지.
       */
      setAllTogglesOpen: (depth) => ({ editor, tr, dispatch }) => {
        const targetDepth = (depth === undefined || depth === null) ? Infinity : depth
        const positions = []
        editor.state.doc.descendants((node, pos, parent) => {
          if (node.type.name !== 'toggle') return true
          // 토글 깊이 계산: 부모를 거슬러 올라가며 toggle 노드 갯수 세기
          // descendants 콜백은 자식 → 자식의 자식 순회 시 부모 정보가 직접 안 주어지므로 resolve 로 깊이 계산.
          const $pos = editor.state.doc.resolve(pos)
          let toggleDepth = 0
          for (let d = 0; d <= $pos.depth; d++) {
            if ($pos.node(d).type.name === 'toggle') toggleDepth++
          }
          toggleDepth += 1 // 자기 자신 포함
          const wantOpen = toggleDepth <= targetDepth
          if (node.attrs.isOpen !== wantOpen) positions.push({ pos, node, wantOpen })
          return true
        })
        if (positions.length === 0) return false
        if (dispatch) {
          positions.forEach(({ pos, node, wantOpen }) => {
            tr.setNodeMarkup(pos, null, { ...node.attrs, isOpen: wantOpen })
          })
        }
        return true
      },
    }
  },

  addKeyboardShortcuts() {
    // 커서가 paragraph 끝에 있을 때: 열린 토글이면 하위 첫 위치에, 아니면 형제 위치에 새 토글 삽입
    function handleEnterAtEnd(editor, $from, toggleDepth, toggleNode, togglePos, afterTogglePos) {
      const newAttrs = toggleNode.attrs.isTodo ? { isTodo: true, todoChecked: false, blockId: genBlockId() } : {}
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
        newAttrs.blockId = genBlockId()
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
          const newAttrs = toggleNode.attrs.isTodo ? { isTodo: true, todoChecked: false, blockId: genBlockId() } : {}
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
          // 토글을 투두로 변환 (blockId 즉시 부여)
          tr.setNodeMarkup(togglePos, null, {
            ...toggleNode.attrs,
            isTodo: true,
            todoChecked: false,
            blockId: toggleNode.attrs.blockId || (genBlockId()),
          })
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
