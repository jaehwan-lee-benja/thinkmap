// spend Edge 공용부 — 계약 `asset/spend-edge@1` v1.1.
//
// ★두 함수(spend-queue·spend-verdicts)가 «같은» 인증·CORS·에러 규칙을 쓰게 하려고 여기 모은다.
//   두 곳에 복사하면 반드시 어긋난다(오늘 하루 그 형태를 여러 번 봤다).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.78.0'

/** ★허용 오리진은 «고정»한다(계약 §5 추가분·와일드카드 금지).
 *  하드코딩하지 않는다 — cf-pages·커스텀 도메인으로 옮기면 코드를 고쳐야 하니까.
 *  env `SPEND_ALLOWED_ORIGINS` 에 콤마로 넣는다. 미설정이면 위성 기본 호스트 하나. */
const ALLOWED = (Deno.env.get('SPEND_ALLOWED_ORIGINS') ??
  'https://jaehwan-lee-benja.github.io').split(',').map((s) => s.trim()).filter(Boolean)

export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const ok = ALLOWED.includes(origin)
  return {
    // 매칭될 때만 그 오리진을 반사한다. 안 맞으면 헤더를 안 준다 → 브라우저가 막는다.
    ...(ok ? { 'Access-Control-Allow-Origin': origin } : {}),
    // ★Vary 필수 — 오리진별로 응답이 달라지므로 캐시가 섞이면 안 된다.
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
  }
}

/** 계약 §4 — 에러는 «구분»한다. `{code,message}` 고정.
 *  ★DB 원문 오류를 message 에 그대로 싣지 않는다(스키마 누설). */
export const err = (req: Request, status: number, code: string, message: string) =>
  new Response(JSON.stringify({ code, message }), {
    status, headers: { ...corsFor(req), 'content-type': 'application/json; charset=utf-8' },
  })

export const ok = (req: Request, body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200, headers: { ...corsFor(req), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

/** 계약 §1 — 호출자 JWT 를 «그대로» 실어 클라이언트를 만든다.
 *  ★service_role 을 쓰지 않는다. §6-1-c: service_role 은 설계상 spend 에 못 닿는다.
 *    닿게 하려고 grant 를 열면 그건 우회가 아니라 RLS 붕괴다. */
export async function authed(req: Request): Promise<
  { client: SupabaseClient; userId: string } | Response
> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return err(req, 401, 'no_token', '로그인이 필요합니다.')

  const URL_ = Deno.env.get('SUPABASE_URL')
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')
  if (!URL_ || !ANON) return err(req, 500, 'server_error', '서버 설정 오류입니다.')

  const client = createClient(URL_, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user) {
    // ★«만료»와 «없음»을 가른다(계약 §4). 위성 동작이 다르다:
    //   token_expired → 조용히 갱신 후 재시도 / no_token → 로그인 화면.
    const m = (error?.message ?? '').toLowerCase()
    const expired = m.includes('expired') || m.includes('jwt expired')
    return expired
      ? err(req, 401, 'token_expired', '세션이 만료되었습니다.')
      : err(req, 401, 'no_token', '로그인이 필요합니다.')
  }
  return { client, userId: data.user.id }
}

/** 계약 §1 — 권한 «판정»은 DB 가 한다. Edge 는 묻기만 하고 스스로 판단하지 않는다.
 *  (판정이 두 곳이면 반드시 어긋난다 — asset 문면 그대로.) */
export async function requireViewer(req: Request, client: SupabaseClient): Promise<Response | null> {
  const { data, error } = await client.rpc('spend_can_view')
  if (error) {
    // ★예고된 함정(계약 §4): 트리거 함수 권한 오류는 뭉개지 말고 그대로 보고한다.
    if ((error.message ?? '').includes('touch_updated_at')) {
      return err(req, 500, 'server_error', 'touch_updated_at 권한 오류 — 보고 필요(예고된 함정)')
    }
    return err(req, 500, 'server_error', '권한을 확인하지 못했습니다.')
  }
  // ★403 이다. 401 로 주면 위성이 로그인 화면으로 보내고 «무한 루프»가 된다(계약 §4).
  if (data !== true) return err(req, 403, 'not_viewer', '열람 권한이 없습니다.')
  return null
}

/** 계약 §5 — 사용자당 240 req/min(두 엔드포인트 합산).
 *  ★인스턴스 메모리 기반이라 «완벽한» 상한이 아니다(엣지 인스턴스가 여러 개면 각자 센다).
 *    자동 루프를 막는 것이 목적이고, 정확한 과금·차단이 목적이 아니다 — 그 한계를 알고 쓴다. */
const hits = new Map<string, number[]>()
const LIMIT = Number(Deno.env.get('SPEND_RATE_PER_MIN') ?? '240')
export function rateLimited(req: Request, userId: string): Response | null {
  const now = Date.now()
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < 60_000)
  arr.push(now)
  hits.set(userId, arr)
  if (arr.length > LIMIT) {
    const retry = Math.max(1, Math.ceil((60_000 - (now - arr[0])) / 1000))
    return new Response(JSON.stringify({ code: 'rate_limited', message: '요청이 많습니다. 잠시 후 다시 시도하세요.' }), {
      status: 429,
      headers: { ...corsFor(req), 'content-type': 'application/json; charset=utf-8', 'Retry-After': String(retry) },
    })
  }
  return null
}

export const preflight = (req: Request) =>
  req.method === 'OPTIONS' ? new Response(null, { status: 204, headers: corsFor(req) }) : null
