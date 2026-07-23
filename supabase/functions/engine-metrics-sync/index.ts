// Edge Function: engine-metrics-sync
// ----------------------------------------------------------------------------
// 목적: crm 이 배포한 engine-metrics Edge(비밀키 게이트)를 **서버사이드에서만** 호출해
//   월별 CRM 지표(engine-metrics/v2 · R8/R9 키셋)를 thinkmap DB `crm_metrics` 테이블에 upsert 한다.
//   CRM-BOARD-SPEC §8, ENGINE-HANDOFF.md(v2).
//
// 왜 서버사이드: payload 는 재무 숫자(매출/마진/퍼널이익)를 포함한다. 시크릿(ENGINE_API_KEY)과
//   원본 payload 는 브라우저에 절대 노출하지 않는다 — 로그인한 마스터가 이 함수를 트리거하면
//   함수가 시크릿으로 crm endpoint 를 호출하고, 결과는 crm_metrics(마스터 전용 RLS)에만 적재된다.
//   브라우저는 그 뒤 crm_metrics 를 is_master() 로 읽을 뿐이다(재무숫자 클라 노출 0).
//
// 권한 경계:
//   - 인증: 호출자 JWT 검증(getUser) + **is_master() 확인**. 비마스터/익명 거부.
//   - 시크릿: ENGINE_API_KEY 는 이 함수 env 에만(유저 세팅, 값=crm-archive/.env). 코드/로그/응답
//     어디에도 값을 싣지 않는다. 응답은 적재 건수 요약만(개별 수치 미반환).
//
// 멱등성: crm_metrics PK (ym, region_key) + upsert(onConflict) → 재호출해도 최신월까지 갱신만.
// ----------------------------------------------------------------------------

import { createClient } from 'npm:@supabase/supabase-js@2.78.0'
import { corsHeaders } from '../_shared/cors.ts'

// crm engine-metrics 엔드포인트(라이브·검증 200). 헤더 x-api-key 로 게이트.
const CRM_ENGINE_ENDPOINT =
  'https://rstazttwlghsorpzsugy.supabase.co/functions/v1/engine-metrics'

// series 있는 여정 region(순서=엔진 여정). target_pool 은 series:null(POS 밖).
// ★R8/R9(v2, 2026-07-23): 'visitor'(방문) → 'unregistered'(미등록)로 개명. 나머지 키 동일.
const REGION_KEYS = [
  'unregistered', 'experience', 'decision', 'retention', 'fan_pool',
  'application', 'target_pool',
] as const

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const numAt = (arr: unknown, i: number): number | null =>
  Array.isArray(arr) && typeof arr[i] === 'number' ? (arr[i] as number) : null

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const ENGINE_API_KEY = Deno.env.get('ENGINE_API_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return json({ error: 'server_misconfigured' }, 500)
  }
  if (!ENGINE_API_KEY) {
    // 유저가 함수 시크릿을 아직 안 넣음 — 값은 crm-archive/.env 의 ENGINE_API_KEY.
    return json({ error: 'engine_api_key_not_set' }, 503)
  }

  // 1. 인증 — 호출자 JWT 검증
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401)

  // 2. 마스터 전용 게이트 — is_master() RPC(호출자 권한 기준 판정)
  const { data: isMaster, error: masterErr } = await authClient.rpc('is_master')
  if (masterErr) return json({ error: 'master_check_failed' }, 500)
  if (isMaster !== true) return json({ error: 'forbidden_master_only' }, 403)

  // 3. crm endpoint 서버사이드 호출 (시크릿 헤더). 응답에 시크릿/payload 를 로그하지 않는다.
  let payload: any
  try {
    const res = await fetch(CRM_ENGINE_ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': ENGINE_API_KEY, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) {
      // 401=키 문제, 그 외=crm측. 값은 싣지 않고 상태만 전달.
      return json({ error: 'engine_fetch_failed', upstream_status: res.status }, 502)
    }
    payload = await res.json()
  } catch (_err) {
    return json({ error: 'engine_unreachable' }, 502)
  }

  // 4. payload 검증
  if (payload?.schema !== 'engine-metrics/v2' || !Array.isArray(payload?.months)) {
    return json({ error: 'unexpected_payload_schema' }, 502)
  }
  const months: string[] = payload.months
  const regions = payload.regions ?? {}
  const business = payload.business ?? null
  const generatedMonth: string | null = payload.generated_month ?? null

  // 5. rows 생성 — (ym, region_key) 펼치기
  //    같은 ym 이 payload 에 중복되면 upsert 가 "cannot affect row a second time"로 전체 실패하므로
  //    방어적으로 첫 등장만 취한다(crm payload 는 유일 배열이나 안전망).
  const rows: Array<Record<string, unknown>> = []
  const seenYm = new Set<string>()
  for (let i = 0; i < months.length; i++) {
    const ym = months[i]
    if (typeof ym !== 'string' || seenYm.has(ym)) continue
    seenYm.add(ym)

    for (const key of REGION_KEYS) {
      const r = regions[key]
      if (!r) continue
      const hasSeries = Array.isArray(r.series)
      let extra: Record<string, unknown> = {}
      if (key === 'retention' && r.extra) {
        extra = {
          '총단골': numAt(r.extra['총단골'], i),
          '활성단골율': numAt(r.extra['활성단골율'], i),
        }
      } else if (!hasSeries && r.note) {
        extra = { note: r.note }
      }
      rows.push({
        ym,
        region_key: key,
        metric: r.metric ?? r.label ?? null,
        value: hasSeries ? numAt(r.series, i) : null,
        extra,
        generated_month: generatedMonth,
      })
    }

    // business 블록 — 응용편 숫자띠
    if (business) {
      rows.push({
        ym,
        region_key: 'business',
        metric: '사업지표',
        value: numAt(business['매출'], i),
        extra: {
          // v2 business: 퍼널이익 폐기. 매출/객단가/단골총마진은 월별 배열, 관리비/임대료/원재료율은 상수.
          '매출': numAt(business['매출'], i),
          '객단가': numAt(business['객단가'], i),
          '단골총마진': numAt(business['단골총마진'], i),
          '관리비': typeof business['관리비'] === 'number' ? business['관리비'] : null,
          '임대료': typeof business['임대료'] === 'number' ? business['임대료'] : null,
          '원재료율': typeof business['원재료율'] === 'number' ? business['원재료율'] : null,
        },
        generated_month: generatedMonth,
      })
    }
  }

  if (rows.length === 0) return json({ error: 'no_rows_parsed' }, 502)

  // 6. service_role 로 upsert (RLS 우회)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { error: upsertErr } = await admin
    .from('crm_metrics')
    .upsert(rows, { onConflict: 'ym,region_key' })
  if (upsertErr) {
    console.error('[engine-metrics-sync] upsert failed', { message: upsertErr.message })
    return json({ error: 'upsert_failed' }, 500)
  }

  // 7. 요약만 반환 — 개별 재무 수치는 싣지 않는다.
  return json({
    ok: true,
    months: months.length,
    rows: rows.length,
    generated_month: generatedMonth,
  })
})
