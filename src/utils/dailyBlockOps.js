// daily_blocks 의 Supabase CRUD 순수 로직.
// useDailyBlocks 훅의 React 외 부분을 분리해 단위 테스트 가능하도록 함.
//
// 모든 함수는 Supabase 클라이언트를 인자로 받는다 (의존성 주입).
// 실패 시 throw — 호출자가 try/catch.

import { rowToDb, rowFromDb, patchToDb } from './dailyBlockMapper.js'

// 페이지의 살아있는 row 를 모두 가져와 camelCase 로 반환.
export async function fetchBlocks(supabase, pageId) {
  if (!pageId) return []
  const { data, error } = await supabase
    .from('daily_blocks')
    .select('*')
    .eq('page_id', pageId)
    .is('deleted_at', null)
    .order('position', { ascending: true })
  if (error) throw error
  return (data || []).map(rowFromDb)
}

// 한 페이지의 모든 row (deleted 포함). thread dedup 검사 등에 사용.
export async function fetchAllBlocksIncludingDeleted(supabase, pageId) {
  if (!pageId) return []
  const { data, error } = await supabase
    .from('daily_blocks')
    .select('*')
    .eq('page_id', pageId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data || []).map(rowFromDb)
}

// BlockDiff 를 Supabase 에 적용. insert / update / softDelete 를 병렬 발사.
//
// 트랜잭션이 아니라는 한계: 일부만 성공하고 일부 실패할 수 있음.
// 호출자는 실패 시 refetch + 사용자 알림으로 회복.
// (향후 RPC 함수로 묶어 단일 트랜잭션화 검토 — Phase v2.2 후속)
export async function applyDiffToSupabase(supabase, diff) {
  const ops = []

  if (diff.insert && diff.insert.length > 0) {
    ops.push(
      supabase.from('daily_blocks').insert(diff.insert.map(rowToDb))
    )
  }

  for (const { blockId, patch } of (diff.update || [])) {
    ops.push(
      supabase
        .from('daily_blocks')
        .update(patchToDb(patch))
        .eq('block_id', blockId)
    )
  }

  if (diff.softDelete && diff.softDelete.length > 0) {
    const now = new Date().toISOString()
    ops.push(
      supabase
        .from('daily_blocks')
        .update({ deleted_at: now })
        .in('block_id', diff.softDelete)
    )
  }

  if (ops.length === 0) return { applied: 0 }

  const results = await Promise.all(ops)
  for (const r of results) {
    if (r && r.error) throw r.error
  }
  return { applied: ops.length }
}

// Thread 단위 체크박스 동기화 (§4.4).
// 같은 originBlockId thread 의 모든 row 를 UPDATE.
// 윈도우 = 3년 (§9.2).
//
// 구현: `.or()` 단일 쿼리 대신 두 번 update — block_id 매칭, origin_block_id 매칭.
// PostgREST schema cache stale 등 한쪽이 실패해도 다른 쪽은 통과 (graceful degrade).
export async function syncThreadCheckbox(supabase, blockId, todoChecked) {
  if (!blockId) return { affected: 0 }

  const { data: anchor, error: anchorErr } = await supabase
    .from('daily_blocks')
    .select('block_id, origin_block_id')
    .eq('block_id', blockId)
    .maybeSingle()
  if (anchorErr) throw anchorErr
  if (!anchor) return { affected: 0 }

  const threadId = anchor.origin_block_id || anchor.block_id

  const threeYearsAgo = new Date()
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)
  const dateStr = threeYearsAgo.toISOString().slice(0, 10)

  const patch = {
    todo_checked: todoChecked,
    todo_status: todoChecked ? 'done' : 'open',
  }

  // 1) block_id 자기 자신 매칭
  const a = await supabase
    .from('daily_blocks')
    .update(patch)
    .eq('block_id', threadId)
    .gte('page_date', dateStr)
    .is('deleted_at', null)
    .select('block_id, page_id')

  // 2) origin_block_id 매칭 (다른 페이지의 이월본). schema cache stale 시 silent skip.
  let bData = []
  try {
    const b = await supabase
      .from('daily_blocks')
      .update(patch)
      .eq('origin_block_id', threadId)
      .gte('page_date', dateStr)
      .is('deleted_at', null)
      .select('block_id, page_id')
    if (!b.error) bData = b.data || []
  } catch {}

  const merged = [...(a.data || []), ...bData]
  return {
    affected: merged.length,
    threadId,
    affectedPages: [...new Set(merged.map(r => r.page_id))],
  }
}
