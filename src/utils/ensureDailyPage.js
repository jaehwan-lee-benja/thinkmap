// 데일리 페이지 보장 — 단일 진입점. PLAN-daily-carryover-authority.md Phase 1.
//
// 역할: "오늘/특정일 데일리 페이지를 (없으면) 만들고, 양식 시드 + 직전 페이지 이월까지 끝낸다."
// 모든 신규-데일리 진입점(App / TipTapTestPage / quickTodoOps)이 이 함수 하나만 호출한다.
// → 호출 지점을 한 곳으로 모아 Edge↔로컬 전환·롤백을 단일 스위치로 만든다(§9 안전망).
//
// 경로:
//   - Edge(보드 권한) : Supabase Edge Function `ensure-daily-page` 호출. service_role 로
//     RLS 를 우회해 직전 페이지의 master 블록까지 빠짐없이 이월(P1/P2). ★Phase 1 목표 경로.
//   - 로컬(폴백)      : 기존 `createDailyPageV2`(Phase 0 반영본)를 호출자 권한으로 실행.
//
// 전환: VITE_USE_EDGE_DAILY === 'true' 일 때만 Edge 경로 사용. 그 외(미설정/false)는 로컬.
//   배포·검증 전까지 기본값 OFF 라 앱 동작은 현행과 동일. 배포·검증 후 .env 에서 플래그를 켠다.
// 폴백: Edge 경로가 실패(미배포·네트워크·함수 오류)하면 로컬 경로로 자동 폴백해 사용자 흐름을
//   끊지 않는다. (단, 폴백 시 master 콘텐츠 이월 누락 가능 — 콘솔 경고로 가시화)

import { createDailyPageV2 } from './createDailyPageV2.js'

const USE_EDGE = import.meta.env?.VITE_USE_EDGE_DAILY === 'true'

/**
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {string} args.parentId  보드(캘린더) 페이지 id
 * @param {string} args.dateKey   YYYY-MM-DD
 * @param {string} args.userId    호출자 id (= created_by 감사 메타)
 * @param {(dateKey: string) => string} [args.dailyPageName]  로컬 폴백 시 페이지 이름 생성기
 * @returns {Promise<{ pageId: string|null, created?: boolean, inserted?: number, via?: 'edge'|'local' }>}
 */
export async function ensureDailyPage(args) {
  const { supabase, parentId, dateKey } = args
  if (!supabase || !parentId || !dateKey) {
    throw new Error('ensureDailyPage: supabase, parentId, dateKey 필수')
  }

  if (USE_EDGE) {
    try {
      const { data, error } = await supabase.functions.invoke('ensure-daily-page', {
        body: { parentId, dateKey },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.pageId) throw new Error('ensure-daily-page: pageId 없음')
      return { ...data, via: 'edge' }
    } catch (err) {
      console.warn(
        '[ensureDailyPage] Edge 경로 실패 → 로컬 폴백. master 콘텐츠 이월이 누락될 수 있음:',
        err,
      )
      // 폴백으로 진행
    }
  }

  const result = await createDailyPageV2(args)
  return { ...result, via: 'local' }
}
