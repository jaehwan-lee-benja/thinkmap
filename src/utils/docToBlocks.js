// TipTap doc 변경 → row CRUD diff (write 경로). WORKLOG-SPEC.md §3.7.
//
// 입력: prevDoc (이전 저장된 doc, 신규면 null), nextDoc, ctx { pageId, pageDate, userId }
// 출력: { insert: DailyBlock[], update: [{blockId, patch}], softDelete: blockId[] }
//
// 평탄화 규칙 (flattenDoc):
//   - 최상위 (doc.content) 의 toggle 노드들 = parentBlockId === null
//   - toggle 노드의 content 안에서 type==='toggle' 인 자식들이 children, 그 외(paragraph 등)는 본문
//   - 자식 toggle 의 parentBlockId = 직접 부모의 blockId
//   - sectionId = 가장 가까운 조상 section row 의 blockId (자기 자신 포함, R6)
//   - position = 같은 부모 아래 형제 toggle 들 사이 1-based 인덱스 (R4)
//
// row 종류 결정:
//   - attrs.blockType === 'h2' or 'h3'  → blockType='section', sectionId=자기 blockId
//   - 그 외                              → blockType='toggle'
//
// todo_status 동기화:
//   - isTodo=false           → 'open'
//   - isTodo=true, checked=t → 'done'
//   - isTodo=true, checked=f → 'open'

import { docsEqual } from './blocksToDoc.js'

export function docToBlocks(prevDoc, nextDoc, ctx) {
  const prevMap = flattenDoc(prevDoc, ctx)
  const nextMap = flattenDoc(nextDoc, ctx)

  const insert = []
  const update = []
  const softDelete = []

  for (const [blockId, nextRow] of nextMap) {
    if (!prevMap.has(blockId)) {
      // 안전망: sectionId 결정 못한 row 는 INSERT skip — DB NOT NULL 위반 회피.
      // 정상 doc 이라면 flattenDoc 가 직전 섹션 blockId 를 currentSectionId 로 상속.
      // null 이라면 doc 구조 자체가 비정상 (섹션 없음).
      if (nextRow.blockType === 'toggle' && !nextRow.sectionId) {
        console.warn('[docToBlocks] sectionId 결정 불가, INSERT skip:', {
          blockId, parentBlockId: nextRow.parentBlockId, textContent: nextRow.textContent,
        })
        continue
      }
      insert.push(nextRow)
    } else {
      const prevRow = prevMap.get(blockId)
      const patch = computePatch(prevRow, nextRow)
      if (Object.keys(patch).length > 0) {
        update.push({ blockId, patch })
      }
    }
  }

  for (const blockId of prevMap.keys()) {
    if (!nextMap.has(blockId)) {
      softDelete.push(blockId)
    }
  }

  return { insert, update, softDelete }
}

// ----------------------------------------------------------------------------
// 평탄화
// ----------------------------------------------------------------------------

function flattenDoc(doc, ctx) {
  const map = new Map()
  if (!doc || !Array.isArray(doc.content)) return map

  // doc.content 의 최상위 toggle 들 순회. 섹션 토글을 만나면 그 blockId 를
  // 이후 형제 토글들의 sectionId 로 상속 (v1 의 isH2Section 패턴).
  const roots = doc.content.filter(n => n && n.type === 'toggle')
  let currentSectionId = null
  for (let i = 0; i < roots.length; i++) {
    const node = roots[i]
    const attrs = node.attrs || {}
    const isSection = attrs.blockType === 'h2' || attrs.blockType === 'h3'
    if (isSection) {
      currentSectionId = attrs.blockId
    }
    walkNode(node, i + 1, null, currentSectionId, map, ctx)
  }
  return map
}

function walkNode(node, position, parentBlockId, ancestorSectionId, map, ctx) {
  if (!node || node.type !== 'toggle') return

  const row = makeRow(node, position, parentBlockId, ancestorSectionId, ctx)
  map.set(row.blockId, row)

  const isSection = row.blockType === 'section'
  const passDownSectionId = isSection ? row.blockId : ancestorSectionId

  const children = (node.content || []).filter(c => c && c.type === 'toggle')
  for (let i = 0; i < children.length; i++) {
    walkNode(children[i], i + 1, row.blockId, passDownSectionId, map, ctx)
  }
}

function makeRow(node, position, parentBlockId, ancestorSectionId, ctx) {
  const attrs = node.attrs || {}
  const isSection = attrs.blockType === 'h2' || attrs.blockType === 'h3'

  const body = (node.content || []).filter(c => c && c.type !== 'toggle')

  if (isSection) {
    const titleNode = body[0]
    return {
      blockId: attrs.blockId,
      pageId: ctx.pageId,
      pageDate: ctx.pageDate,
      userId: ctx.userId,
      blockType: 'section',
      parentBlockId,
      sectionId: attrs.blockId,        // R6 self-ref
      sectionMasterId: attrs.sectionMasterId ?? null,
      position,
      textContent: extractText(titleNode),
      richContent: null,
      isTodo: false,
      todoChecked: false,
      todoStatus: 'open',
      isCarryOver: false,
      carryOverFrom: null,
      originBlockId: null,
      isPinned: false,
      visibility: attrs.visibility ?? 'all',
      isFixedSection: !!attrs.isFixedSection,
    }
  }

  // toggle row (todo 또는 일반 토글)
  const isTodo = !!attrs.isTodo
  const todoChecked = !!attrs.todoChecked
  return {
    blockId: attrs.blockId,
    pageId: ctx.pageId,
    pageDate: ctx.pageDate,
    userId: ctx.userId,
    blockType: 'toggle',
    parentBlockId,
    sectionId: ancestorSectionId,
    sectionMasterId: null,           // section row 만 채움 (§3.4)
    position,
    textContent: body.map(extractText).join('\n'),
    richContent: body.length > 0 ? body : null,
    isTodo,
    todoChecked,
    todoStatus: isTodo ? (todoChecked ? 'done' : 'open') : 'open',
    isCarryOver: !!attrs.isCarryOver,
    carryOverFrom: attrs.carryOverFrom ?? null,
    originBlockId: attrs.originBlockId ?? null,
    isPinned: !!attrs.isPinned,
    visibility: attrs.visibility ?? 'all',
    isFixedSection: false,
  }
}

function extractText(node) {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  if (Array.isArray(node.content)) {
    return node.content.map(extractText).join('')
  }
  return ''
}

// ----------------------------------------------------------------------------
// patch 계산: 변경된 필드만
// ----------------------------------------------------------------------------

const PATCH_FIELDS = [
  'parentBlockId', 'sectionId', 'sectionMasterId', 'position',
  'textContent', 'richContent',
  'isTodo', 'todoChecked', 'todoStatus',
  'isCarryOver', 'carryOverFrom', 'originBlockId',
  'isPinned', 'visibility', 'isFixedSection',
  'blockType',
]

function computePatch(prev, next) {
  const patch = {}
  for (const f of PATCH_FIELDS) {
    if (!docsEqual(prev[f], next[f])) {
      patch[f] = next[f]
    }
  }
  return patch
}
