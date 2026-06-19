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

// 이월 후보:
//   - 미완료 todo (isTodo=true && !todoChecked + 텍스트 있음)
//   - 완료 todo + 하위(서브트리)에 미완료 todo 존재 (CARRY-OVER-MAP §1 "완료유지" 이월)
//   - 일반 텍스트 토글 (isTodo=false + blockType='toggle' + 텍스트 있음)
// 즉 daily 페이지 본문의 의미 있는 모든 토글이 다음 daily 에 자동 이월됨.
//
// 제외:
//   - section row (블록 종류가 'section') — worklog_sections master 가 자동 등장
//   - 빈 자식 토글 (textContent 비어있음)
//   - 전부완료 todo (서브트리 전체가 완료)
//   - deleted
//
// v2 (2026-05-07): 핀 (isPinned) 분기 폐기 + 일반 텍스트 토글도 이월 대상에 포함.
// v2 (2026-05-21): 완료유지 분기 활성화 — 완료 todo 라도 하위에 미완료가 있으면 후보 유지.
export function selectCarryOverCandidates(rows) {
  if (!rows) return []
  const childrenByParent = buildChildrenByParent(rows)
  return rows.filter(r => {
    if (r.deletedAt) return false
    if (r.blockType !== 'toggle') return false
    if ((r.textContent || '').trim().length === 0) return false
    if (r.isTodo && r.todoChecked) {
      // 완료 todo: 하위에 미완료 todo 가 있어야만 유지 (완료유지 이월) — 전부완료면 제외.
      return hasUnfinishedDescendantTodo(r, childrenByParent)
    }
    return true
  })
}

// rows → Map<parentBlockId, child rows[]> (deleted 제외).
// selectCarryOverCandidates 와 collectLiveDescendants 가 공유.
function buildChildrenByParent(rows) {
  const map = new Map()
  for (const r of (rows || [])) {
    if (!r.parentBlockId || r.deletedAt) continue
    if (!map.has(r.parentBlockId)) map.set(r.parentBlockId, [])
    map.get(r.parentBlockId).push(r)
  }
  return map
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
//   sectionVisibilityByNewId (선택): Map<newSectionBlockId, visibility> — 새 페이지 섹션 행의 visibility.
//                        P1: 이월 블록은 *대상 섹션*의 visibility 를 상속한다(원본 visibility 비정규화 갈라짐 방지).
export function toCarryOverSubtree(srcRoot, srcAllRows, ctx, sectionIdMap = null, sectionVisibilityByNewId = null) {
  const descendants = collectLiveDescendants(srcRoot, srcAllRows)
  const subtree = [srcRoot, ...descendants]

  const idMap = new Map()
  for (const r of subtree) {
    idMap.set(r.blockId, newBlockId())
  }

  return subtree.map((r, i) => {
    const isRoot = i === 0
    const remappedSectionId = sectionIdMap?.get(r.sectionId)
    const newSectionId = remappedSectionId || r.sectionId
    // root 의 parentBlockId 결정:
    //   - parentBlockId 있고 어제 section row 면 → 새 section row 로 매핑 (자식으로 들어감)
    //   - parentBlockId null 이지만 sectionId 가 어제 섹션 blockId 면 → 새 섹션 row 자식으로 (root-level 텍스트도 카드 안으로)
    //   - 둘 다 매핑 안 되면 null (doc 최상위)
    const remappedParent = r.parentBlockId ? sectionIdMap?.get(r.parentBlockId) : null
    const remappedSectionAsParent = !r.parentBlockId ? sectionIdMap?.get(r.sectionId) : null
    const rootParent = remappedParent ?? remappedSectionAsParent ?? null
    return {
      blockId: idMap.get(r.blockId),
      pageId: ctx.pageId,
      pageDate: ctx.pageDate,
      userId: ctx.userId,
      blockType: r.blockType,
      parentBlockId: isRoot ? rootParent : (idMap.get(r.parentBlockId) || null),
      sectionId: newSectionId,
      sectionMasterId: null,
      position: r.position,
      textContent: r.textContent,
      richContent: r.richContent,
      isTodo: !!r.isTodo,
      // root + 자손 모두 원본 todoChecked 보존 — CARRY-OVER-MAP §1 "완료유지" 원칙.
      //   - 미완료 todo: false 그대로
      //   - 완료 todo + 하위 미완료 존재: true 유지 (root 든 자손이든)
      //   - 전부완료 서브트리: selectCarryOverCandidates / collectLiveDescendants 에서 이미 제외됨
      todoChecked: !!r.todoChecked,
      todoStatus: r.todoStatus || 'open',
      isCarryOver: true,
      carryOverFrom: r.carryOverFrom || r.pageDate,
      originBlockId: r.originBlockId || r.blockId,
      isPinned: !!r.isPinned,
      // P1: 대상 섹션 visibility 상속. 매핑 정보 없으면 원본 보존(fallback).
      visibility: sectionVisibilityByNewId?.get(newSectionId) ?? (r.visibility || 'all'),
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

// 새 페이지 섹션 행의 visibility 맵 — P1 이월 visibility 상속용. Map<sectionBlockId, visibility>.
export function buildSectionVisibilityMap(currentRows) {
  const map = new Map()
  for (const r of (currentRows || [])) {
    if (r.blockType !== 'section') continue
    map.set(r.blockId, r.visibility || 'all')
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
  const childrenByParent = buildChildrenByParent(allRows)
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
      // 전부완료 자손 서브트리는 가지치기 — CARRY-OVER-MAP §1 "완료 투두(전부완료) → 이월 안 됨" 원칙을
      // 자손 레벨에도 적용. 완료 todo 라도 하위에 미완료가 있으면 keep (완료유지 이월).
      if (c.isTodo && c.todoChecked && !hasUnfinishedDescendantTodo(c, childrenByParent)) continue
      out.push(c)
      walk(c.blockId)
    }
  }
  walk(root.blockId)
  return out
}

// row 자신을 포함한 서브트리 어딘가에 미완료 todo 가 있는지 확인.
// childrenByParent: collectLiveDescendants 가 만든 parent→children Map (soft-deleted 이미 제외됨).
function hasUnfinishedDescendantTodo(row, childrenByParent) {
  if (row.isTodo && !row.todoChecked) return true
  const cs = childrenByParent.get(row.blockId) || []
  for (const c of cs) {
    if (hasUnfinishedDescendantTodo(c, childrenByParent)) return true
  }
  return false
}

// ----------------------------------------------------------------------------
// IO
// ----------------------------------------------------------------------------

// Eager 이월: 새 daily 페이지 직후, 직전 daily 의 미완료/pinned 를 한 번에 복제 (트리 보존).
// 새 페이지에 이미 section row 들이 INSERT 되어 있어야 한다 (worklogTemplateV2 결과).
// 그 row 들을 기준으로 §9.9 옵션 A self-ref sectionId 매핑.
//
// currentRows (선택): 새 페이지의 section row 들. createDailyPageV2 가 방금 INSERT 한
//   메모리 상의 row 를 그대로 넘긴다 → eager 가 *자기 자신이 막 쓴* section row 를 DB 에서
//   다시 읽는(read-after-write) 재조회를 건너뛴다. 재조회가 (replica lag·가시성 타이밍으로)
//   빈/부분 결과를 주면 buildSectionIdMap 이 비어 모든 후보가 skip → 이월 0건(빈 카드) 버그가
//   났다. 생성 직후엔 호출자가 가진 in-memory row 가 항상 권위 있는 최신본이므로 이를 우선한다.
//   넘기지 않으면(기존 호환) 종전대로 DB 재조회.
export async function carryOverEager(supabase, fromPageId, ctx, currentRows = null) {
  if (!fromPageId || !ctx?.pageId) return { inserted: 0 }

  const [prevRows, currentRowsResolved] = await Promise.all([
    fetchBlocks(supabase, fromPageId),
    currentRows ? Promise.resolve(currentRows) : fetchBlocks(supabase, ctx.pageId),
  ])
  const allCands = selectCarryOverCandidates(prevRows)
  const rootCands = filterRootCandidates(allCands)
  if (rootCands.length === 0) return { inserted: 0 }

  const sectionIdMap = buildSectionIdMap(prevRows, currentRowsResolved)
  const sectionVisMap = buildSectionVisibilityMap(currentRowsResolved)

  // 섹션별로 root 후보 그룹 + position 1, 2, 3... 매김.
  // → createDailyPageV2 가 박은 빈 자식 (position=999) 위에 자연 배치.
  // 새 페이지에서 섹션을 못 찾으면(sectionIdMap 미스) 건너뛴다. 과거엔 || root.sectionId 로
  // 옛(직전 페이지) section_id 를 그대로 둬서, 그 섹션이 새 페이지에 없으면 헤더 없는 고아 토글이 됐다.
  // 특히 비마스터가 페이지를 만들 때 RLS 가 prev 의 master 섹션을 가려 매핑이 실패 → master 섹션
  // 콘텐츠가 cross-page 고아로 박혔다. 못 매핑되는 건 끌어오지 않는다(원본 페이지에 그대로 남음).
  const bySection = new Map()
  for (const root of rootCands) {
    const newSec = sectionIdMap.get(root.sectionId)
    if (!newSec) continue
    if (!bySection.has(newSec)) bySection.set(newSec, [])
    bySection.get(newSec).push(root)
  }

  const carryRows = []
  for (const [, rootsInSection] of bySection) {
    rootsInSection.forEach((root, i) => {
      const subtree = toCarryOverSubtree(root, prevRows, ctx, sectionIdMap, sectionVisMap)
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
// position 정책: 섹션별로 현재 페이지의 max(position < 999) + 1 부터 매김 →
//   빈 자식 토글 (position=999) 위로 자연 정렬. 이미 이월된 row 들 다음 순서로.
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
  const sectionVisMap = buildSectionVisibilityMap(currentRowsAll)

  // 섹션별로 현재 페이지의 max(position) 계산 — 빈 자식 (999+) 은 제외
  const sectionMaxPos = new Map()
  for (const r of (currentRowsAll || [])) {
    if (!r.parentBlockId) continue
    const pos = Number(r.position) || 0
    if (pos >= 999) continue
    const cur = sectionMaxPos.get(r.parentBlockId) || 0
    if (pos > cur) sectionMaxPos.set(r.parentBlockId, pos)
  }

  // 섹션별로 그룹 후 root position 매김.
  // 새 페이지에서 섹션을 못 찾으면 건너뛴다 (carryOverEager 와 동일 원칙 — cross-page 고아 방지).
  const bySection = new Map()
  for (const root of newOnes) {
    const newSec = sectionIdMap.get(root.sectionId)
    if (!newSec) continue
    if (!bySection.has(newSec)) bySection.set(newSec, [])
    bySection.get(newSec).push(root)
  }

  const carryRows = []
  for (const [secKey, rootsInSection] of bySection) {
    let nextPos = (sectionMaxPos.get(secKey) || 0) + 1
    rootsInSection.forEach(root => {
      const subtree = toCarryOverSubtree(root, prevRows, ctx, sectionIdMap, sectionVisMap)
      if (subtree[0]) subtree[0].position = nextPos++
      carryRows.push(...subtree)
    })
  }

  const { error } = await supabase
    .from('daily_blocks')
    .insert(carryRows.map(rowToDb))
  if (error) throw error
  return { inserted: carryRows.length, rows: carryRows }
}
