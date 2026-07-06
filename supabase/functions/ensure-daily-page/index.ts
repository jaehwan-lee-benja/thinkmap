// Edge Function: ensure-daily-page
// ----------------------------------------------------------------------------
// PLAN-daily-carryover-authority.md Phase 1 (A안 — 보드-권한 서버측 이월).
//
// 목적(P2/P4): 데일리 페이지의 "생성 + 양식 시드 + 이월" 을 *행위자의 RLS 권한* 이 아니라
//   **보드 권한(service_role)** 으로 멱등 실행한다. 그래야 비마스터가 만들어도 직전 페이지의
//   master 섹션 콘텐츠까지 빠짐없이 이월된다(P1: 이월 블록 visibility = 대상 섹션 visibility).
//
// 재사용(P5): 검증된 JS 파이프라인 `createDailyPageV2`(→ worklogTemplateV2 / carryOverPipelineV2
//   / dailyBlockMapper / blockIdV2)를 **그대로** 재사용한다. service_role 클라이언트만 주입할 뿐
//   로직은 한 줄도 재구현하지 않는다(PL/pgSQL 배제 이유 = §3.3).
//
// 권한 경계:
//   - 인증: 호출자의 JWT(Authorization Bearer)를 검증해 requestingUserId 추출. 익명 거부.
//     (현행 `pages` INSERT 정책 = "로그인 전원" 과 동일 권한선. 멤버십 강제 게이트는 멤버 row 가
//      없는 다른 보드의 생성을 깨뜨리므로 도입하지 않는다 — P6 완전 정렬은 후속 단계.)
//   - 누출 없음: 이월된 master 블록은 대상 섹션 visibility='master' 를 상속하므로(P1),
//     daily_blocks SELECT(`visibility='all' OR is_master()`) 상 비마스터는 여전히 읽지 못한다.
//
// 멱등성: createDailyPageV2 가 (parent_id, page_date) 중복을 차단(+ uniq 인덱스)하므로 재호출해도
//   페이지/섹션/이월 row 가 1회만 생성된다.
// ----------------------------------------------------------------------------

import { createClient } from 'npm:@supabase/supabase-js@2.78.0'
import { corsHeaders } from '../_shared/cors.ts'
// 검증된 클라 파이프라인을 그대로 재사용 (순수 ESM, 브라우저 전역 미사용 → Deno 호환).
import { createDailyPageV2 } from '../../../src/utils/createDailyPageV2.js'
import { dailyPageName } from '../../../packages/core/src/utils/dateUtils.js'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    // 런타임이 자동 주입하는 값들 — 비면 배포/환경 문제.
    return json({ error: 'server_misconfigured' }, 500)
  }

  // 1. 요청 파싱
  let parentId: string | undefined
  let dateKey: string | undefined
  try {
    const body = await req.json()
    parentId = body?.parentId
    dateKey = body?.dateKey
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!parentId || !dateKey) {
    return json({ error: 'parentId, dateKey 필수' }, 400)
  }

  // 2. 인증 — 호출자 JWT 검증 (서버 권한 작업의 트리거 자격 = 로그인 사용자).
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401)
  }
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ error: 'unauthorized' }, 401)
  }
  const requestingUserId = userData.user.id

  // 3. 보드 권한(service_role)으로 멱등 생성 + 시드 + 이월.
  //    RLS 우회 → 직전 페이지의 master 블록까지 읽어 대상 섹션 visibility 로 이월(P1).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    const result = await createDailyPageV2({
      supabase: admin,
      parentId,
      dateKey,
      userId: requestingUserId, // user_id = created_by 감사 메타(P6)
      dailyPageName,
    })
    return json(result ?? { pageId: null })
  } catch (err) {
    console.error('[ensure-daily-page] failed', {
      parentId,
      dateKey,
      requestingUserId,
      message: err instanceof Error ? err.message : String(err),
    })
    return json({ error: 'ensure_failed', detail: String(err) }, 500)
  }
})
