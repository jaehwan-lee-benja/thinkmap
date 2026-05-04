// 이월 파이프라인 v2 — row 기반. WORKLOG-SPEC.md §4.3, §10 Phase v2.2.
//
// 책임:
//   - selectCarryOverCandidates: 미완료 todo + pinned 추출 (pure)
//   - filterRootCandidates:      후보들 중 다른 후보의 자손인 row 제외 (pure, 트리 보존)
//   - filterNewThreads:          현재 페이지에 이미 있는 thread 제외 (pure)
//   - toCarryOverRow:            한 row 만 변환 (pure, 단일)
//   - toCarryOverSubtree:        root + 자손 트리 변환 (pure, blockId 매핑 유지)
//   - carryOverEager:            새 daily 페이지 생성 시 직전 페이지에서 한 번에 복제 (IO, 트리 보존)
//   - carryOverLazy:             기존 daily 페이지 열 때 신규 미완료만 추가 (IO, 트리 보존)
//
// dedup 키: COALESCE(originBlockId, blockId) — thread 단위 (§3.2.2 §9.3 결정).
// soft delete 차단: 같은 thread 의 row 가 (살아있든 deleted 든) 현재 페이지에 있으면 skip.

import { newBlockId } from './blockIdV2.js'
import { rowToDb } from './dailyBlockMapper.js'
import { fetchAllBlocksIncludingDeleted, fetchBlocks } from './dailyBlockOps.js'

// ----------------------------------------------------------------------------
// pure
// ----------------------------------------------------------------------------

// 이월 후보: 미완료 todo (텍스트 있는 것만) 또는 pinned. deleted_at 은 호출 전에 이미 필터됨.
// textContent 가 빈 todo (= 사용자가 안 쓴 빈 자식 토글) 는 이월 안 함.
export function selectCarryOverCandidates(rows) {
  return (rows || []).filter(r => {
    if (r.deletedAt) return false
    if (r.isPinned) return true
    if (r.isTodo && !r.todoChecked) {
      return (r.textContent || '').trim().length > 0
    }
    return false
  })
}

// 후보들 중 "다른 후보의 자손" 인 row 를 제외하고 root 만 남김.
// 부모와 자식이 모두 후보면 부모만 root → 자식은 부모의 subtree 로 함께 이월된다.
// 부모가 후보가 아니면 자식이 root 가 된다 (완료된 부모 + 미완료 자식 케이스).
export function filterRootCandidates(candidates) {
  const ids = new Set((candidates || []).map(c => c.blockId))
  return (candidates || []).filter(c =>
    !c.parentBlockId || !ids.has(c.parentBlockId)
  )
}

// 현재 페이지에 이미 있는 thread (살아있는 + soft deleted 모두 포함) 제외.
export function filterNewThreads(candidates, currentPageRows) {
  const existingThreads = new Set(
    (currentPageRows || []).map(r => r.originBlockId || r.blockId)
  )
  return (candidates || []).filter(c =>
    !existingThreads.has(c.originBlockId || c.blockId)
  )
}

// row → 이월본 row (단일).
// blockId 재발급, originBlockId 승계, isCarryOver=true.
// 자손이 있어도 끌고 오지 않음 — 트리 이월은 toCarryOverSubtree 사용.
//
// carryOverFrom: 최초 생성 날짜 보존.
//   - 이미 이월본 (src.carryOverFrom 있음) 이면 그 값 유지 (최초 원본 날짜).
//   - 새 이월 (src.carryOverFrom=null) 이면 src.pageDate (= 어제 날짜).
export function toCarryOverRow(src, ctx) {
  const isTodo = !!src.isTodo
  return {
    blockId: newBlockId(),
    pageId: ctx.pageId,
    pageDate: ctx.pageDate,
    userId: ctx.userId,
    blockType: src.blockType,
    parentBlockId: null,
    sectionId: src.sectionId,
    sectionMasterId: null,
    position: src.position,
    textContent: src.textContent,
    richContent: src.richContent,
    isTodo,
    todoChecked: isTodo ? false : !!src.todoChecked,
    todoStatus: isTodo ? 'open' : (src.todoStatus || 'open'),
    isCarryOver: true,
    carryOverFrom: src.carryOverFrom || src.pageDate,
    originBlockId: src.originBlockId || src.blockId,
    isPinned: !!src.isPinned,
    visibility: src.visibility || 'all',
    isFixedSection: false,
  }
}

// root + 자손 subtree 를 모두 이월. 새 blockId 부여 + 부모-자식 관계 유지.
//   srcRoot: 이월할 root row
//   srcAllRows: 자손 lookup 용 (같은 페이지의 모든 row, deleted 제외)
//   ctx: { pageId, pageDate, userId }
//   sectionIdMap (선택): Map<oldSectionBlockId, newSectionBlockId>
//                        §9.9 옵션 A self-ref 모델에서 어제 섹션 blockId → 새 페이지 섹션 blockId
// 반환: 새 row 배열 (root 가 첫 번째, 자손 순).
export function toCarryOverSubtree(srcRoot, srcAllRows, ctx, sectionIdMap = null) {
  const descendants = collectLiveDescendants(srcRoot, srcAllRows)
  const subtree = [srcRoot, ...descendants]

  const idMap = new Map()
  for (const r of subtree) {
    idMap.set(r.blockId, newBlockId())
  }

  return subtree.map((r, i) => {
    const isRoot = i === 0
    const isTodo = !!r.isTodo
    const remappedSectionId = sectionIdMap?.get(r.sectionId)
    // root 의 parentBlockId: 어제 section row 였으면 새 section row 로 매핑.
    //   sectionIdMap 에 매핑 있으면 그 값 (= 새 섹션 자식으로 들어감)
    //   매핑 없으면 null (= doc 최상위 sibling)
    // 자손의 parentBlockId 는 idMap (subtree 안의 새 blockId) 로.
    const rootParent = r.parentBlockId ? (sectionIdMap?.get(r.parentBlockId) ?? null) : null
    return {
      blockId: idMap.get(r.blockId),
      pageId: ctx.pageId,
      pageDate: ctx.pageDate,
      userId: ctx.userId,
      blockType: r.blockType,
      parentBlockId: isRoot ? rootParent : (idMap.get(r.parentBlockId) || null),
      sectionId: remappedSectionId || r.sectionId,
      sectionMasterId: null,
      position: r.position,
      textContent: r.textContent,
      richContent: r.richContent,
      isTodo,
      // 자손 todo 도 미완료 reset — 새 페이지에서 다시 시작. (todo 가 아니면 그대로)
      todoChecked: isTodo ? false : !!r.todoChecked,
      todoStatus: isTodo ? 'open' : (r.todoStatus || 'open'),
      isCarryOver: true,
      carryOverFrom: r.carryOverFrom || r.pageDate,
      originBlockId: r.originBlockId || r.blockId,
      isPinned: !!r.isPinned,
      visibility: r.visibility || 'all',
      isFixedSection: false,
    }
  })
}

// 어제 페이지의 section row blockId → 새 페이지의 같은 master 의 section row blockId 매핑.
// §9.9 옵션 A: self-ref sectionId 모델에서 이월 row 의 sectionId 를 새 페이지 row 로 갈아끼우기 위함.
//
// 1차: sectionMasterId 매칭. 2차 fallback: textContent (섹션 제목) 매칭 — 옛 row 가
//      sectionMasterId NULL 인 경우 (마이그레이션 전 INSERT) 회복.
export function buildSectionIdMap(prevRows, currentRows) {
  const newByMaster = new Map()
  const newByText = new Map()
  for (const r of (currentRows || [])) {
    if (r.blockType !== 'section') continue
    if (r.sectionMasterId) newByMaster.set(r.sectionMasterId, r.blockId)
    if (r.textContent) newByText.set(r.textContent, r.blockId)
  }
  const map = new Map()
  for (const r of (prevRows || [])) {
    if (r.blockType !== 'section') continue
    let newId = r.sectionMasterId ? newByMaster.get(r.sectionMasterId) : null
    if (!newId && r.textContent) newId = newByText.get(r.textContent)
    if (newId) map.set(r.blockId, newId)
  }
  return map
}

// 단일 row 도 sectionId 매핑 적용 가능 (기존 호환).
export function toCarryOverRowMapped(src, ctx, sectionIdMap = null) {
  const out = toCarryOverRow(src, ctx)
  const remapped = sectionIdMap?.get(src.sectionId)
  if (remapped) out.sectionId = remapped
  return out
}

function collectLiveDescendants(root, allRows) {
  const childrenByParent = new Map()
  for (const r of (allRows || [])) {
    if (!r.parentBlockId || r.deletedAt) continue
    if (!childrenByParent.has(r.parentBlockId)) childrenByParent.set(r.parentBlockId, [])
    childrenByParent.get(r.parentBlockId).push(r)
  }
  // 자손 children 정렬: position asc, createdAt asc
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position
      return (a.createdAt || '').localeCompare(b.createdAt || '')
    })
  }
  const out = []
  function walk(parentId) {
    const cs = childrenByParent.get(parentId) || []
    for (const c of cs) {
      out.push(c)
      walk(c.blockId)
    }
  }
  walk(root.blockId)
  return out
}

// ----------------------------------------------------------------------------
// IO
// ----------------------------------------------------------------------------

// Eager 이월: 새 daily 페이지 직후, 직전 daily 의 미완료/pinned 를 한 번에 복제 (트리 보존).
// 새 페이지에 이미 section row 들이 INSERT 되어 있어야 한다 (worklogTemplateV2 결과).
// 그 row 들을 기준으로 §9.9 옵션 A self-ref sectionId 매핑.
export async function carryOverEager(supabase, fromPageId, ctx) {
  if (!fromPageId || !ctx?.pageId) return { inserted: 0 }

  const [prevRows, currentRows] = await Promise.all([
    fetchBlocks(supabase, fromPageId),
    fetchBlocks(supabase, ctx.pageId),
  ])
  const allCands = selectCarryOverCandidates(prevRows)
  const rootCands = filterRootCandidates(allCands)
  if (rootCands.length === 0) return { inserted: 0 }

  const sectionIdMap = buildSectionIdMap(prevRows, currentRows)

  // 섹션별로 root 후보 그룹 + position 1, 2, 3... 매김.
  // → createDailyPageV2 가 박은 빈 자식 (position=999) 위에 자연 배치.
  const bySection = new Map()
  for (const root of rootCands) {
    const newSec = sectionIdMap.get(root.sectionId) || root.sectionId
    if (!bySection.has(newSec)) bySection.set(newSec, [])
    bySection.get(newSec).push(root)
  }

  const carryRows = []
  for (const [, rootsInSection] of bySection) {
    rootsInSection.forEach((root, i) => {
      const subtree = toCarryOverSubtree(root, prevRows, ctx, sectionIdMap)
      if (subtree[0]) subtree[0].position = i + 1  // root 만 1, 2, 3...
      carryRows.push(...subtree)
    })
  }
  const { error } = await supabase
    .from('daily_blocks')
    .insert(carryRows.map(rowToDb))
  if (error) throw error
  return { inserted: carryRows.length, rows: carryRows }
}

// Lazy 이월: 기존 daily 페이지 열 때, 직전 daily 의 신규 미완료 todo (트리) 를 추가.
export async function carryOverLazy(supabase, prevPageId, ctx) {
  if (!prevPageId || !ctx?.pageId) return { inserted: 0 }

  const [prevRows, currentRowsAll] = await Promise.all([
    fetchBlocks(supabase, prevPageId),
    fetchAllBlocksIncludingDeleted(supabase, ctx.pageId),
  ])

  const allCands = selectCarryOverCandidates(prevRows)
  const rootCands = filterRootCandidates(allCands)
  const newOnes = filterNewThreads(rootCands, currentRowsAll)
  if (newOnes.length === 0) return { inserted: 0 }

  const sectionIdMap = buildSectionIdMap(prevRows, currentRowsAll)
  const carryRows = newOnes.flatMap(root =>
    toCarryOverSubtree(root, prevRows, ctx, sectionIdMap)
  )
  const { error } = await supabase
    .from('daily_blocks')
    .insert(carryRows.map(rowToDb))
  if (error) throw error
  return { inserted: carryRows.length, rows: carryRows }
}
