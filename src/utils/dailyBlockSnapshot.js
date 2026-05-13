// daily_block_snapshots 쓰기 유틸.
//
// 호출 패턴 (useDailyBlocks.applyDiff 내부):
//   1) 변경 시 throttle — 마지막 스냅샷이 SNAPSHOT_THROTTLE_MS 이상 지났을 때만
//   2) mass softDelete 직전 — diff.softDelete.length >= MASS_DELETE_SOFT_THRESHOLD 면 무조건
//
// 모든 경로에서 실패해도 사용자 작업에 영향 주지 않도록 fire-and-forget + catch silent.

export const SNAPSHOT_THROTTLE_MS = 5 * 60 * 1000   // 5분
export const MASS_DELETE_SOFT_THRESHOLD = 5         // 이 이상 지울 땐 mandatory 스냅샷

export async function writeSnapshot(supabase, args) {
  const { pageId, userId, pageDate, blocks, reason = 'change' } = args
  if (!pageId || !userId || !pageDate || !Array.isArray(blocks)) return { skipped: true }
  if (blocks.length === 0) return { skipped: true }  // 빈 페이지는 백업 가치 없음
  const { error } = await supabase
    .from('daily_block_snapshots')
    .insert({
      page_id: pageId,
      user_id: userId,
      page_date: pageDate,
      reason,
      blocks,
      block_count: blocks.length,
    })
  if (error) throw error
  return { ok: true }
}

// throttle 결정 로직 — useDailyBlocks 외부에서 단위 테스트 가능.
export function shouldSnapshot({ now, lastSnapshotAt, hasMassDelete }) {
  if (hasMassDelete) return true
  if (!lastSnapshotAt) return true
  return (now - lastSnapshotAt) >= SNAPSHOT_THROTTLE_MS
}
