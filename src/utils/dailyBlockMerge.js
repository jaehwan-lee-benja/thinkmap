// useDailyBlocks 훅의 순수 머지 로직. React 분리해서 단위 테스트 가능.
// WORKLOG-SPEC.md §3.7, §10 Phase v2.2.

import { rowFromDb } from './dailyBlockMapper.js'

// 정렬: position asc, 동률 시 createdAt asc (R4)
export function sortByPositionAndCreatedAt(rows) {
  return [...rows].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position
    return (a.createdAt || '').localeCompare(b.createdAt || '')
  })
}

// BlockDiff 를 로컬 state 에 낙관적으로 적용.
// realtime 이 두 번째로 들어와도 멱등.
export function mergeDiffLocal(prev, diff) {
  let next = prev

  if (diff.insert && diff.insert.length > 0) {
    const ids = new Set(diff.insert.map(r => r.blockId))
    next = [
      ...next.filter(r => !ids.has(r.blockId)),
      ...diff.insert,
    ]
  }

  if (diff.update && diff.update.length > 0) {
    const patchById = new Map(diff.update.map(u => [u.blockId, u.patch]))
    next = next.map(r => patchById.has(r.blockId)
      ? { ...r, ...patchById.get(r.blockId) }
      : r
    )
  }

  if (diff.softDelete && diff.softDelete.length > 0) {
    const del = new Set(diff.softDelete)
    next = next.filter(r => !del.has(r.blockId))
  }

  return sortByPositionAndCreatedAt(next)
}

// Supabase Realtime payload 를 로컬 state 에 적용.
//   payload = { eventType: 'INSERT'|'UPDATE'|'DELETE', new, old }
// soft delete 는 UPDATE 로 들어오며 deleted_at 이 채워져 있다.
export function applyRealtimeEvent(prev, payload) {
  const event = payload.eventType
  const newRow = payload.new ? rowFromDb(payload.new) : null
  const oldRow = payload.old ? rowFromDb(payload.old) : null

  let next = prev
  if (event === 'INSERT' && newRow) {
    if (!prev.some(r => r.blockId === newRow.blockId)) {
      next = [...prev, newRow]
    }
  } else if (event === 'UPDATE' && newRow) {
    if (newRow.deletedAt) {
      next = prev.filter(r => r.blockId !== newRow.blockId)
    } else if (prev.some(r => r.blockId === newRow.blockId)) {
      next = prev.map(r => r.blockId === newRow.blockId ? newRow : r)
    } else {
      // 이전엔 없던 row 가 UPDATE 로 들어옴 (예: deleted_at 풀림 / fetch 누락 회복)
      next = [...prev, newRow]
    }
  } else if (event === 'DELETE' && oldRow) {
    next = prev.filter(r => r.blockId !== oldRow.blockId)
  }

  return sortByPositionAndCreatedAt(next)
}
