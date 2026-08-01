// 멤버십 키오스크 프록시 Edge 공용 — 직원게이트 + 레이트리밋/감사 + ★로컬 crm RPC 직접호출(1-hop).
// SPEC docs/MEMBERSHIP-KIOSK-SPEC.md §3.3·§5.
//
// ★1-hop 전환(2026-07-28): CRM이 thinkmap DB로 통합됨 → crm RPC가 로컬(thinkmap public, SECURITY DEFINER).
//   기존 크로스프로젝트 HTTP(x-api-key MEMBERSHIP_KIOSK_KEY) → service_role client 로 로컬 RPC 직접 호출.
//   MEMBERSHIP_KIOSK_KEY 소멸. 직원게이트·레이트리밋·감사는 그대로. 마스킹·검색필수·1일1회는 RPC 서버단.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.78.0'
import { corsHeaders } from './cors.ts'

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// 레이트리밋: operator 당 최근 60초 임계. 열거 스크래핑(§5.3)·spam-write 방어.
const RATE_WINDOW_SEC = 60
const RATE_MAX: Record<string, number> = {
  lookup: 30,       // 회원 PII 조회 — 열거 방어(엄격, DB오류 시 fail-closed).
  signup: 15,       // 가입 write — spam 방어.
  event_claim: 60,  // 적립 — 서버 1일1회 partial-unique 로 자연 제한, 느슨.
  history: 60,      // 수령내역 읽기 — 조회된 회원 한정, 느슨.
  list: 6,          // ★회원 리스트(전량 PII) — 매우 엄격(반복 덤프 방어).
  stamp: 60,        // 스탬프 상태 읽기 — 조회된 회원 한정, 느슨.
  reward: 12,       // ★리워드 수령 write — abuse 방어(서버 멱등·중복방지 있으나 프록시도 제한).
}
// 테이블 부재(마이그 전 부트스트랩) 코드 — 이때만 감사/레이트리밋을 조용히 skip 한다.
const PG_UNDEFINED_TABLE = '42P01'

type GateOk = {
  ok: true
  operator: string          // app_user id(감사·레이트리밋 키)
  service: SupabaseClient    // service_role(로컬 RPC·감사/레이트리밋)
}
type GateErr = { ok: false; res: Response }

// 직원 게이트: JWT 검증 + (is_master() OR is_store()). 통과 시 operator·service 반환.
export async function gate(req: Request): Promise<GateOk | GateErr> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return { ok: false, res: json({ error: 'server_misconfigured' }, 500) }
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return { ok: false, res: json({ error: 'unauthorized' }, 401) }

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData?.user) return { ok: false, res: json({ error: 'unauthorized' }, 401) }

  // 직원 게이트 — is_master() OR is_store()(호출자 권한 기준). §5.1.
  const [{ data: isMaster }, { data: isStore }] = await Promise.all([
    authClient.rpc('is_master'),
    authClient.rpc('is_store').then((r) => r, () => ({ data: null })), // is_store() 마이그 전엔 null → master만 통과
  ])
  if (isMaster !== true && isStore !== true) {
    return { ok: false, res: json({ error: 'forbidden_staff_only' }, 403) }
  }

  return {
    ok: true,
    operator: userData.user.id,
    service: createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } }),
  }
}

// 레이트리밋 + 감사. membership_kiosk_audit(thinkmap) 에 행위 기록(민감 PII 없이 operator+action+member_id).
// ★fail 정책(guardian §2-B1): 테이블 부재(42P01, 마이그 전 부트스트랩)만 조용히 skip. 그 외 DB 오류는
//   레이트리밋을 **fail-closed**(503)로 막는다 — "매장 태블릿 유출 시 마지막 방어선"이 조용히 꺼지지 않게.
//   반환: 차단 Response | null(통과). 카운트 게이트는 fail-closed, 감사 insert 실패(카운트 통과 후)는 best-effort.
export async function rateLimitAndAudit(
  g: GateOk, action: string, memberId: string | null,
): Promise<Response | null> {
  const since = new Date(Date.now() - RATE_WINDOW_SEC * 1000).toISOString()
  const max = RATE_MAX[action] ?? 30

  // 1) 카운트 게이트 (fail-closed).
  const { count, error: cntErr } = await g.service
    .from('membership_kiosk_audit')
    .select('id', { count: 'exact', head: true })
    .eq('operator', g.operator).eq('action', action).gte('created_at', since)
  if (cntErr) {
    if ((cntErr as { code?: string }).code === PG_UNDEFINED_TABLE) {
      return null // 마이그 전 부트스트랩 — 테이블 없음. 배포 시 테이블 필수(SPEC §3.3).
    }
    // 실제 DB 오류 → 조용히 통과시키지 않는다(열거 방어선 유지).
    return json({ error: 'rate_check_unavailable' }, 503)
  }
  if ((count ?? 0) >= max) return json({ error: 'rate_limited' }, 429)

  // 2) 감사 기록 (best-effort — 카운트 게이트는 이미 통과).
  const { error: insErr } = await g.service.from('membership_kiosk_audit').insert({
    operator: g.operator, action, member_id: memberId,
  })
  if (insErr && (insErr as { code?: string }).code !== PG_UNDEFINED_TABLE) {
    console.error('[membership] audit insert failed', { action, code: (insErr as { code?: string }).code })
  }
  return null
}

// ★로컬 crm RPC 직접 호출(service_role, SECURITY DEFINER). 1-hop. 마스킹·검색필수·1일1회는 RPC 서버단.
//   wrap: RPC 원출력을 프론트 계약 형태로 감싼다(예: 배열 → {events:[...]}). 없으면 원출력 그대로.
export async function callRpc(
  g: GateOk, name: string, params: Record<string, unknown>, wrap?: (d: unknown) => unknown,
): Promise<Response> {
  const { data, error } = await g.service.rpc(name, params)
  if (error) {
    console.error('[membership] rpc failed', { name, code: (error as { code?: string }).code })
    return json({ error: 'rpc_failed' }, 502)
  }
  return json(wrap ? wrap(data) : data)
}
