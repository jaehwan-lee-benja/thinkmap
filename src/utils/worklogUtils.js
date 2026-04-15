/**
 * 업무일지 유틸리티
 */

import { createWorklogTemplate } from './worklogTemplate'

/**
 * content_tiptap에서 pinned 섹션과 미완료 todo(이월 대상)를 추출
 * 캘린더 "+", "오늘" 버튼 등 daily 페이지 생성 시 공통으로 사용
 *
 * @param {object|null} contentTiptap - 가장 최근 daily 페이지의 content_tiptap
 * @param {string} pageDate - 해당 페이지의 page_date (YYYY-MM-DD)
 * @returns {{ pinnedSections: string[], carryOverTodos: Array<{text: string, fromDate: string}> }}
 */
export function extractCarryOverData(contentTiptap, pageDate) {
  const pinnedSections = []
  const carryOverTodos = []

  if (!contentTiptap?.content) return { pinnedSections, carryOverTodos }

  for (const node of contentTiptap.content) {
    if (node.type !== 'toggle') continue

    // pinned 섹션 추출
    if (node.attrs?.isPinned && node.attrs?.blockType === 'h2') {
      const titleText = node.content?.[0]?.content?.[0]?.text
      if (titleText) pinnedSections.push(titleText)
    }

    // "할 일" 섹션에서 미완료 todo 추출
    if (node.attrs?.isFixedSection && node.attrs?.blockType === 'h2') {
      const sectionTitle = node.content?.[0]?.content?.[0]?.text
      if (sectionTitle === '할 일' && node.content) {
        for (const child of node.content) {
          if (child.type === 'toggle' && child.attrs?.isTodo && !child.attrs?.todoChecked) {
            const todoText = child.content?.[0]?.content?.[0]?.text
            if (todoText) {
              // 이미 이월된 항목이면 최초 출처 날짜 유지
              const fromDate = child.attrs?.carryOverFrom || pageDate
              carryOverTodos.push({ text: todoText, fromDate })
            }
          }
        }
      }
    }
  }

  return { pinnedSections, carryOverTodos }
}

/**
 * daily 페이지의 초기 content_tiptap 템플릿을 생성
 * 가장 최근 daily 페이지에서 이월/pinned 데이터를 추출하여 반영
 *
 * @param {Array} dailyPages - 기존 daily 페이지 배열 (page_date, content_tiptap 필요)
 * @returns {object} TipTap document JSON
 */
export function buildDailyPageTemplate(dailyPages) {
  const sorted = (dailyPages || [])
    .filter(p => p.page_date && p.content_tiptap)
    .sort((a, b) => b.page_date.localeCompare(a.page_date))

  let pinnedSections = []
  let carryOverTodos = []

  if (sorted.length > 0) {
    const result = extractCarryOverData(sorted[0].content_tiptap, sorted[0].page_date)
    pinnedSections = result.pinnedSections
    carryOverTodos = result.carryOverTodos
  }

  return createWorklogTemplate(pinnedSections, carryOverTodos)
}

/**
 * content_tiptap JSON에서 todo 완료 통계를 추출
 * 재귀적으로 모든 toggle 노드를 순회하여 isTodo 항목 집계
 *
 * @param {object|null} contentTiptap - TipTap document JSON
 * @returns {{ total: number, completed: number }}
 */
export function parseTodoStats(contentTiptap) {
  if (!contentTiptap?.content) return { total: 0, completed: 0 }

  let total = 0
  let completed = 0

  function walk(nodes) {
    for (const node of nodes) {
      if (node.type === 'toggle' && node.attrs?.isTodo) {
        total++
        if (node.attrs.todoChecked) completed++
      }
      if (node.content) walk(node.content)
    }
  }

  walk(contentTiptap.content)
  return { total, completed }
}
