/**
 * 업무일지(daily) 페이지 초기 콘텐츠 템플릿
 * CalendarView에서 "+" 클릭 시 이 구조로 daily 페이지가 생성됨
 *
 * 섹션 정의는 worklog_sections 테이블에서 조회하여 사용
 * DB 조회 실패 시 FALLBACK_SECTIONS로 대체
 */

import { SECTION_IDS, DEFAULT_SECTION_ID, FALLBACK_SECTIONS } from './worklogConstants'
import { sectionToggle, pinnedSectionToggle, emptyToggle } from './toggleNodeFactory'
import { genSectionId } from './toggleNodeFactory'

function genBlockId() {
  return 'blk_' + Math.random().toString(36).slice(2, 10)
}

/**
 * 이월 블록: 원본 노드를 deep clone하되
 * - isCarryOver/carryOverFrom 설정
 * - blockId 새로 부여, originBlockId로 원본 ��적
 * - 완료된 상위 todo (하위에 미완료가 있어서 이월됨) → 완료 상태 유지
 */
function toCarryOverNode(block) {
  const node = JSON.parse(JSON.stringify(block.node))
  const originalTodoId = node.attrs.blockId || node.attrs.originBlockId || null

  // 완료된 상위 (하위에 미완료가 있어서 이월) → todoChecked 유지
  const keepChecked = block.type === 'todo-with-unfinished'

  node.attrs = {
    ...node.attrs,
    isCarryOver: true,
    carryOverFrom: block.fromDate,
    todoChecked: keepChecked ? node.attrs.todoChecked : false,
    blockId: genBlockId(),
    originBlockId: originalTodoId,
  }

  // 하위 블록���도 재귀적으로 blockId/originBlockId 부여
  assignBlockIds(node)
  return node
}

/** 하위 ��글에 blockId/originBlockId 재귀 부여 */
function assignBlockIds(node) {
  if (!node.content) return
  for (const child of node.content) {
    if (child.type === 'toggle' && child.attrs?.isTodo) {
      const origId = child.attrs.blockId || child.attrs.originBlockId || null
      child.attrs.blockId = genBlockId()
      child.attrs.originBlockId = origId
    }
    assignBlockIds(child)
  }
}

/**
 * @param {Array} sections - worklog_sections 테이블에서 조회한 섹션 정의 (빈 배열이면 fallback 사용)
 * @param {Array} pinnedSections - 이전 daily 페이지에서 추출한 pinned 섹션 배열
 * @param {Array} carryOverTodos - 이월할 미완료 todo 배열 [{ text, fromDate, sectionId }]
 */
export function createWorklogTemplate(sections = [], pinnedSections = [], carryOverTodos = []) {
  const effectiveSections = sections.length > 0 ? sections : FALLBACK_SECTIONS

  // 이월 투두를 sectionId별로 그룹핑
  const carryOverBySectionId = {}
  for (const t of carryOverTodos) {
    const key = t.sectionId || DEFAULT_SECTION_ID
    if (!carryOverBySectionId[key]) carryOverBySectionId[key] = []
    carryOverBySectionId[key].push(t)
  }

  // 매칭되지 않는 sectionId의 이월 투두는 기본 섹션으로 이동 (기존 페이지 호환)
  const allKnownIds = new Set(effectiveSections.map(s => s.id))
  pinnedSections.forEach(s => { if (s.sectionId) allKnownIds.add(s.sectionId) })

  for (const sectionId of Object.keys(carryOverBySectionId)) {
    if (!allKnownIds.has(sectionId)) {
      if (!carryOverBySectionId[DEFAULT_SECTION_ID]) carryOverBySectionId[DEFAULT_SECTION_ID] = []
      carryOverBySectionId[DEFAULT_SECTION_ID].push(...carryOverBySectionId[sectionId])
      delete carryOverBySectionId[sectionId]
    }
  }

  // 섹션 노드 빌드
  const topLevelSections = effectiveSections.filter(s => !s.parent_id)
  const childSections = effectiveSections.filter(s => s.parent_id)

  const sectionNodes = topLevelSections.map(section => {
    const carryOvers = (carryOverBySectionId[section.id] || []).map(toCarryOverNode)

    const childNodes = childSections
      .filter(c => c.parent_id === section.id)
      .map(child => {
        const childCarryOvers = (carryOverBySectionId[child.id] || []).map(toCarryOverNode)
        return sectionToggle(child.title, 'h3', [...childCarryOvers, emptyToggle(false)], {
          isFixed: child.section_type === 'fixed', visibility: child.visibility || 'all', sectionId: child.id,
        })
      })

    return sectionToggle(section.title, 'h2', [
      ...carryOvers, ...childNodes, emptyToggle(section.id === SECTION_IDS.TODO),
    ], {
      isFixed: section.section_type === 'fixed', visibility: section.visibility || 'all', sectionId: section.id,
    })
  })

  // pinned 섹션 노드 빌드 (이월 투두 포함)
  const pinnedNodes = pinnedSections.map(s => {
    const title = typeof s === 'string' ? s : s.title
    const visibility = typeof s === 'string' ? 'all' : (s.visibility || 'all')
    const sectionId = typeof s === 'string' ? null : (s.sectionId || null)
    const carryOvers = sectionId ? (carryOverBySectionId[sectionId] || []).map(toCarryOverNode) : []

    return pinnedSectionToggle(title, 'h2', [...carryOvers, emptyToggle(false)], { visibility, sectionId })
  })

  // pinned 섹션을 마지막 고정 섹션 앞에 삽입
  if (sectionNodes.length > 0 && pinnedNodes.length > 0) {
    const lastSection = sectionNodes.pop()
    return { type: 'doc', content: [...sectionNodes, ...pinnedNodes, lastSection] }
  }

  return { type: 'doc', content: [...sectionNodes, ...pinnedNodes] }
}
