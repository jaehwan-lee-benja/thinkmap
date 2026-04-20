/**
 * 업무일지 유틸리티
 */

import { createWorklogTemplate } from './worklogTemplate'

/**
 * 섹션 내부에서 미완료 todo를 재귀적으로 추출
 * h2 섹션 안의 직접 todo + h3 하위 섹션 안의 todo 모두 수집
 */
function extractTodosFromSection(node, pageDate) {
  const todos = []
  const sectionId = node.attrs?.sectionId || null

  if (!node.content) return todos

  for (const child of node.content) {
    if (child.type === 'toggle' && child.attrs?.isTodo && !child.attrs?.todoChecked) {
      const todoText = child.content?.[0]?.content?.[0]?.text
      if (todoText) {
        const fromDate = child.attrs?.carryOverFrom || pageDate
        todos.push({ text: todoText, fromDate, sectionId })
      }
    }
    // h3 하위 섹션 안의 todo도 추출 (해당 h3의 sectionId 사용)
    if (child.type === 'toggle' && child.attrs?.blockType === 'h3') {
      todos.push(...extractTodosFromSection(child, pageDate))
    }
  }

  return todos
}

/**
 * content_tiptap에서 pinned 섹션과 미완료 todo(이월 대상)를 추출
 * 모든 섹션(고정/pinned)에서 미완료 투두를 sectionId와 함께 추출
 *
 * @param {object|null} contentTiptap - 가장 최근 daily 페이지의 content_tiptap
 * @param {string} pageDate - 해당 페이지의 page_date (YYYY-MM-DD)
 * @returns {{ pinnedSections: Array, carryOverTodos: Array<{text: string, fromDate: string, sectionId: string}> }}
 */
export function extractCarryOverData(contentTiptap, pageDate) {
  const pinnedSections = []
  const carryOverTodos = []

  if (!contentTiptap?.content) return { pinnedSections, carryOverTodos }

  for (const node of contentTiptap.content) {
    if (node.type !== 'toggle') continue

    // pinned 섹션 추출 (visibility + sectionId 보존)
    if (node.attrs?.isPinned && node.attrs?.blockType === 'h2') {
      const titleText = node.content?.[0]?.content?.[0]?.text
      if (titleText) pinnedSections.push({
        title: titleText,
        visibility: node.attrs.visibility || 'all',
        sectionId: node.attrs.sectionId || null,
      })
    }

    // 모든 h2 섹션에서 미완료 todo 추출 (sectionId 포함)
    if (node.attrs?.blockType === 'h2' && node.content) {
      carryOverTodos.push(...extractTodosFromSection(node, pageDate))
    }
  }

  return { pinnedSections, carryOverTodos }
}

/**
 * daily 페이지의 초기 content_tiptap 템플릿을 생성
 * supabase에서 섹션 정의를 조회하여 사용
 *
 * @param {Array} dailyPages - 기존 daily 페이지 배열 (page_date, content_tiptap 필요)
 * @param {object} supabase - Supabase 클라이언트
 * @returns {Promise<object>} TipTap document JSON
 */
export async function buildDailyPageTemplate(dailyPages, supabase) {
  // 1. DB에서 기본 섹션 정의 조회
  let sections = []
  if (supabase) {
    const { data } = await supabase
      .from('worklog_sections')
      .select('*')
      .eq('is_default', true)
      .order('sort_order', { ascending: true })
    if (data) sections = data
  }

  // 2. 이전 daily 페이지에서 이월/pinned 데이터 추출
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

  return createWorklogTemplate(sections, pinnedSections, carryOverTodos)
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
