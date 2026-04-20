/**
 * 업무일지 섹션 관련 공통 유틸리티
 * TipTap content_tiptap JSON에서 섹션을 추출/필터/매칭
 */

import { DEFAULT_SECTION_ID } from './worklogConstants'

/** h2 섹션 노드인지 판별 */
export const isH2Section = (node) =>
  node.type === 'toggle' && node.attrs?.blockType === 'h2'

/** h3 하위 섹션 노드인지 판별 */
export const isH3Section = (node) =>
  node.type === 'toggle' && node.attrs?.blockType === 'h3'

/** 투두 노드인지 판별 */
export const isTodoNode = (node) =>
  node.type === 'toggle' && node.attrs?.isTodo

/** 미완료 투두인지 판별 */
export const isIncompleteTodo = (node) =>
  isTodoNode(node) && !node.attrs?.todoChecked

/** 토글 노드의 첫 줄 텍스트 추출 */
export const getToggleTitle = (node, defaultTitle = '(무제)') =>
  node.content?.[0]?.content?.[0]?.text || defaultTitle

/** content_tiptap에서 h2 섹션 목록 추출 */
export function extractH2Sections(content) {
  if (!content?.content) return []
  return content.content
    .filter(isH2Section)
    .map(n => ({
      id: n.attrs?.sectionId || null,
      title: getToggleTitle(n),
      isFixed: n.attrs?.isFixedSection || false,
      isPinned: n.attrs?.isPinned || false,
      visibility: n.attrs?.visibility || 'all',
    }))
}

/** visibility 기준으로 섹션 필터링 */
export function filterByVisibility(sections, isMaster) {
  return sections.filter(s => isMaster || s.visibility !== 'master')
}

/**
 * content에서 targetId로 섹션 매칭
 * 1순위: sectionId 일치, 2순위: 제목 일치, 3순위: 기본 섹션
 */
export function findSectionMatcher(content, targetId) {
  const nodes = content?.content || []
  const byId = (node) => isH2Section(node) && node.attrs?.sectionId === targetId
  const byName = (node) => isH2Section(node) && getToggleTitle(node) === targetId
  const byDefault = (node) => isH2Section(node) && node.attrs?.sectionId === DEFAULT_SECTION_ID

  if (nodes.some(byId)) return { matcher: byId, found: true }
  if (nodes.some(byName)) return { matcher: byName, found: true }
  return { matcher: byDefault, found: false }
}
