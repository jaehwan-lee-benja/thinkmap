/**
 * 이월 파이프라인
 * Eager(새 daily 생성)와 Lazy(기존 daily 열람) 양쪽에서 공통 사용
 *
 * 흐름:
 *   1. extractCarryOverData(prevContent, prevDate)  → 이월 대상 raw 목록
 *   2. filterNewCarryOvers(candidates, targetContent, dismissedIds)
 *        → 이미 존재/거부 당한 항목 제외
 *   3. toCarryOverNode(candidate, { maybeDuplicate })  → 실제 삽입할 노드
 *
 * Eager는 새 페이지라 targetContent가 비어있어 filter 단계가 사실상 no-op.
 */

import { toCarryOverNode } from './worklogTemplate'
import { genBlockId } from './blockId'

const DISMISSED_KEY = '_dismissed'

/** content_tiptap 루트에 있는 dismissed blockId 집합 읽기 */
export function readDismissedIds(content) {
  return new Set(content?.[DISMISSED_KEY] || [])
}

/** dismissed 집합을 content_tiptap에 반영 */
export function writeDismissedIds(content, dismissedSet) {
  return { ...content, [DISMISSED_KEY]: [...dismissedSet] }
}

/** content에서 _dismissed를 제외한 TipTap-safe 객체 반환 (에디터 prop용) */
export function stripDismissed(content) {
  if (!content || !(DISMISSED_KEY in content)) return content
  const { [DISMISSED_KEY]: _drop, ...rest } = content
  return rest
}

/**
 * 현재 content에 있는 blockId/originBlockId + 텍스트 수집
 * 중복 판단의 기준이 됨
 */
export function collectExistingMarkers(content) {
  const ids = new Set()
  const texts = new Set()
  const walk = (nodes) => {
    if (!nodes) return
    for (const n of nodes) {
      if (n.attrs?.blockId) ids.add(n.attrs.blockId)
      if (n.attrs?.originBlockId) ids.add(n.attrs.originBlockId)
      const text = n.content?.[0]?.content?.[0]?.text || ''
      if (text) texts.add(text)
      if (n.content) walk(n.content)
    }
  }
  walk(content?.content)
  return { ids, texts }
}

/**
 * 이월 후보 중 신규 항목만 골라냄
 * - 원본 blockId 가 targetContent 또는 dismissed에 이미 있으면 제외
 * - blockId 가 없는 레거시 항목은 텍스트가 이미 있으면 제외
 * - 통과한 항목에는 maybeDuplicate 플래그 부여 (텍스트가 이미 존재하면 true)
 */
export function filterNewCarryOvers(candidates, targetContent, dismissedIds) {
  const { ids, texts } = collectExistingMarkers(targetContent)
  const result = []
  for (const t of candidates) {
    const origId = t.node?.attrs?.blockId
    if (origId && ids.has(origId)) continue
    if (origId && dismissedIds.has(origId)) continue
    if (!origId) {
      const text = t.node?.content?.[0]?.content?.[0]?.text || ''
      if (text && texts.has(text)) continue
    }
    const text = t.node?.content?.[0]?.content?.[0]?.text || ''
    result.push({ ...t, maybeDuplicate: Boolean(text && texts.has(text)) })
  }
  return result
}

/**
 * content_tiptap 안의 토글 중 blockId가 누락된 것에 blockId를 부여
 * 이전 daily 페이지에서 legacy 데이터를 만났을 때 1회 backfill
 * @returns { content, changed }
 */
export function backfillBlockIds(content) {
  let changed = false
  const walk = (nodes) => {
    if (!nodes) return nodes
    return nodes.map(n => {
      let node = n
      if (
        n.type === 'toggle' &&
        !n.attrs?.blockId &&
        n.attrs?.blockType !== 'h2' &&
        n.attrs?.blockType !== 'h3'
      ) {
        changed = true
        node = { ...n, attrs: { ...n.attrs, blockId: genBlockId() } }
      }
      if (node.content) return { ...node, content: walk(node.content) }
      return node
    })
  }
  const next = { ...content, content: walk(content?.content) }
  return { content: next, changed }
}

/**
 * 이월 후보 → 실제 삽입 노드
 * maybeDuplicate 플래그를 attrs로 전달
 */
export function buildCarryOverNodes(candidates) {
  return candidates.map(c =>
    toCarryOverNode(c, { maybeDuplicate: c.maybeDuplicate || false })
  )
}
