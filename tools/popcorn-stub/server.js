// 팝콘 루프 — 계약 스텁 서버 (POPCORN-LOOP-SPEC §3 Edge 4종, 인메모리)
// =============================================================================
// 목적: 실 Edge/DB 배포(하드게이트) 전에 키오스크·카운터스캔·게임 클라이언트가
//   완전 동작하도록 계약을 실행 가능한 형태로 고정한다. 시나리오 러너(scenarios.js)의 대상.
// 실행: node server.js [port]  (기본 8931)
// 규칙(스텁이 실 구현과 동일하게 강제):
//   - ticket_issue : (member,type,channel,KST일자) 유니크 → 재호출=기존 토큰(멱등 reissued)
//   - ticket_redeem: 미회수·미만료만 1회(이중 스캔 거부), 회수 시점에 스탬프 적립 확정
//   - 만료: 발권일 당일 23:59 KST(조회 시 판정)
//   - game 채널: 회원 + score>=5000 요구
//   - 스탬프: 회수 확정 건만 카운트(10=아이스크림, 0017 승계 개념)
// 테스트용 확장: POST /_reset (전체 초기화) · POST /_time {now} (가짜 시계, 만료 시나리오)
// ★계약 변경(crm 2026-08-01, 시그니처·상태값 불변 — 실 Edge 구현 시 적용):
//   1) game 채널 인증 = 사용자 JWT + game Edge 서명 assertion(점수 검증 주체=game Edge, crm SQL score 체크=백스톱).
//      ※crm=thinkmap DB·game=multi-store로 다른 프로젝트(교차 조회 불가) — SPEC §4 재정정.
//   2) member_by_phone = 서버-투-서버 전용(브라우저에 member_id 직접 반환 금지 — 게임 클라는 game Edge 경유).
//   스텁은 로컬 개발용이라 인증 미시뮬(계약 형태만 고정).
// =============================================================================
import http from 'node:http'
import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ★DEV ES256 공개키(kid:"dev-1") — assertion 실서명검증용. DEV ONLY(실키 아님).
//   검증 스킵 env 금지(계약 — fail-open이면 게임 클라가 잘못된 성공에 길든다).
const DEV_KEYS = JSON.parse(readFileSync(fileURLToPath(new URL('./dev-keys.json', import.meta.url)), 'utf8'))
const TRUSTED_JWKS = { 'dev-1': DEV_KEYS.publicJwk }

// compact JWS(ES256) fail-closed 검증. 반환 {ok, payload} | {ok:false, code}
async function verifyAssertion(jws, todayDate) {
  try {
    const parts = String(jws || '').split('.')
    if (parts.length !== 3) return { ok: false, code: 'assertion_invalid' }
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    if (header.alg !== 'ES256') return { ok: false, code: 'assertion_invalid' }       // alg:none 등 전부 거부
    const jwk = TRUSTED_JWKS[header.kid]
    if (!jwk) return { ok: false, code: 'assertion_invalid' }                          // 미등록 kid
    const key = await webcrypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const valid = await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key,
      Buffer.from(parts[2], 'base64url'), Buffer.from(parts[0] + '.' + parts[1]))
    if (!valid) return { ok: false, code: 'assertion_invalid' }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const nowSec = Math.floor(Date.now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp < nowSec) return { ok: false, code: 'assertion_expired' }
    if (payload.event_date !== todayDate) return { ok: false, code: 'date_mismatch' }
    return { ok: true, payload }
  } catch (e) { return { ok: false, code: 'assertion_invalid' } }
}

const PORT = Number(process.argv[2] || 8931)
const THRESHOLD = 10

// ── 상태(인메모리) ───────────────────────────────────────────────────────────
let db
function reset() {
  db = {
    members: new Map(),   // id → {id, name, phone}
    byPhone: new Map(),   // phone(digits) → id
    tickets: new Map(),   // token → ticket
    stamps: new Map(),    // member_id → redeemed count
    fakeNow: null,
  }
  // 시드 회원 2명(시나리오용)
  seedMember('m-hong', '홍길동', '01011112222')
  seedMember('m-lee', '이재환', '01033334444')
}
function seedMember(id, name, phone) {
  db.members.set(id, { id, name, phone })
  db.byPhone.set(phone, id)
}

function now() { return db.fakeNow ? new Date(db.fakeNow) : new Date() }
function kstDate(d) { return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) }
function today() { return kstDate(now()) }

// 토큰: 12자리, 혼동문자(0/O,1/I) 제외 + 간단 체크문자
const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genToken() {
  let t = ''
  for (let i = 0; i < 11; i++) t += AL[Math.floor(Math.random() * AL.length)]
  let sum = 0
  for (let i = 0; i < 11; i++) sum += AL.indexOf(t[i]) * (i + 1)
  return t + AL[sum % AL.length]
}
function tokenValid(t) {
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(t)) return false
  let sum = 0
  for (let i = 0; i < 11; i++) sum += AL.indexOf(t[i]) * (i + 1)
  return AL[sum % AL.length] === t[11]
}

// 마스킹 = 서버 정본(crm.mask_name)과 동형: 첫글자 + (중간 전부 *) + 끝글자. 예) 홍길동→홍*동, 가나다라→가**라.
function mask(name) {
  if (name.length < 3) return name.length === 2 ? name[0] + '*' : name
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
}
function stampOf(id) { return db.stamps.get(id) || 0 }
function stampView(id) {
  const c = stampOf(id)
  return {
    claims_total: c, current_stamps: c % THRESHOLD, threshold: THRESHOLD,
    rewards_earned: Math.floor(c / THRESHOLD), rewards_redeemed: 0,
    rewards_available: Math.floor(c / THRESHOLD), next_reward: 'icecream',
  }
}
function ticketState(t) {
  if (t.voided_at) return 'voided'
  if (t.redeemed_at) return 'redeemed'
  if (t.event_date !== today()) return 'expired' // 당일 23:59 KST 지나면 만료
  return 'issued'
}

// ── Edge 4종 (SPEC §3) ──────────────────────────────────────────────────────
const rpc = {
  // 발권: 일일 유니크(member,type,channel,일자). 충돌=기존 토큰 반환(멱등).
  // ★game 채널(계약 v1.0): 본문 {channel:'game', meta:{score}, assertion}만 — member_id는 assertion.sub.
  //   응답 6종 고정: 200 / 401 assertion_invalid / 401 assertion_expired / 400 date_mismatch /
  //   400 score_below_threshold / 400 member_id_not_allowed.
  async ticket_issue(b) {
    const channel = b.channel
    if (channel !== 'kiosk' && channel !== 'game') return { status: 400, body: { error: 'bad_channel' } }

    let memberId = b.member_id
    if (channel === 'game') {
      if ('member_id' in b) return { status: 400, body: { error: 'member_id_not_allowed' } } // 조용한 무시 금지
      const v = await verifyAssertion(b.assertion, today())
      if (!v.ok) {
        const status = v.code === 'date_mismatch' ? 400 : 401
        return { status, body: { error: v.code } }
      }
      memberId = v.payload.sub
      const score = v.payload.score
      if (!(typeof score === 'number' && score >= 5000)) return { status: 400, body: { error: 'score_below_threshold' } }
    }
    const member = db.members.get(memberId)
    if (!member) return { status: 404, body: { error: 'member_not_found' } }
    b = { ...b, member_id: memberId }
    const eventDate = today()
    for (const t of db.tickets.values()) {
      if (t.member_id === b.member_id && t.event_type === 'popcorn' && t.channel === channel &&
          t.event_date === eventDate && !t.voided_at) {
        return { status: 200, body: { token: t.token, reissued: true, event_date: eventDate } }
      }
    }
    const token = genToken()
    db.tickets.set(token, {
      token, member_id: b.member_id, event_type: 'popcorn', channel,
      event_date: eventDate, issued_at: now().toISOString(),
      issued_meta: b.meta || {}, redeemed_at: null, redeemed_by: null, voided_at: null,
    })
    return { status: 200, body: { token, reissued: false, event_date: eventDate } }
  },

  // 조회: 카운터 화면용(마스킹 표시명·채널·상태·스탬프)
  ticket_lookup(b) {
    if (!tokenValid(String(b.token || ''))) return { status: 400, body: { error: 'bad_token' } }
    const t = db.tickets.get(b.token)
    if (!t) return { status: 404, body: { error: 'not_found' } }
    const m = db.members.get(t.member_id)
    return { status: 200, body: {
      state: ticketState(t), channel: t.channel, event_date: t.event_date,
      display_name: mask(m.name), member_id: t.member_id, stamp: stampView(t.member_id),
    } }
  },

  // 회수: 1회만(이중 스캔 거부) + 만료 거부. 회수 시점에 스탬프 확정.
  ticket_redeem(b) {
    if (!tokenValid(String(b.token || ''))) return { status: 400, body: { error: 'bad_token' } }
    const t = db.tickets.get(b.token)
    if (!t) return { status: 404, body: { error: 'not_found' } }
    const st = ticketState(t)
    if (st === 'redeemed') return { status: 200, body: { ok: false, reason: 'already_redeemed', redeemed_at: t.redeemed_at } }
    if (st === 'expired') return { status: 200, body: { ok: false, reason: 'expired' } }
    if (st === 'voided') return { status: 200, body: { ok: false, reason: 'voided' } }
    t.redeemed_at = now().toISOString()
    t.redeemed_by = b.redeemed_by || null
    db.stamps.set(t.member_id, stampOf(t.member_id) + 1) // ★회수 시점 적립
    const m = db.members.get(t.member_id)
    return { status: 200, body: { ok: true, display_name: mask(m.name), channel: t.channel, stamp: stampView(t.member_id) } }
  },

  // 게임 크로스체크: 전화 → member_id(전화 원문은 게임에 저장 금지 계약)
  member_by_phone(b) {
    const phone = String(b.phone || '').replace(/\D/g, '')
    if (phone.length < 10) return { status: 200, body: { found: false } }
    const id = db.byPhone.get(phone)
    if (!id) return { status: 200, body: { found: false } }
    return { status: 200, body: { found: true, member_id: id, display_name: mask(db.members.get(id).name) } }
  },

  // (게임 내 가입 = 키오스크 intake 승계 — 스텁은 즉시 생성)
  membership_intake(b) {
    const phone = String(b.phone || '').replace(/\D/g, '')
    if (phone.length < 10 || !b.name) return { status: 400, body: { error: 'bad_request' } }
    const exist = db.byPhone.get(phone)
    if (exist) return { status: 200, body: { member_id: exist, created: false } }
    const id = 'm-' + genToken().slice(0, 6).toLowerCase()
    seedMember(id, b.name, phone)
    return { status: 200, body: { member_id: id, created: true } }
  },
}

// ── HTTP ────────────────────────────────────────────────────────────────────
reset()
const server = http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' })
    res.end(JSON.stringify(body))
  }
  if (req.method === 'OPTIONS') return send(200, { ok: true })
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    let body = {}
    try { body = raw ? JSON.parse(raw) : {} } catch (e) { return send(400, { error: 'bad_json' }) }
    const path = req.url.split('?')[0]
    if (path === '/_reset') { reset(); return send(200, { ok: true }) }
    if (path === '/_time') { db.fakeNow = body.now || null; return send(200, { ok: true, now: now().toISOString() }) }
    if (path === '/_seed_member') { seedMember(body.id, body.name, body.phone); return send(200, { ok: true }) }
    const fn = rpc[path.slice(1)]
    if (!fn) return send(404, { error: 'unknown_fn', path })
    Promise.resolve(fn(body))
      .then((out) => send(out.status, out.body))
      .catch((e) => send(500, { error: 'stub_error', message: String(e && e.message) }))
    return undefined
  })
})
server.listen(PORT, '127.0.0.1', () => console.log('[popcorn-stub] listening http://127.0.0.1:' + PORT))
