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
// =============================================================================
import http from 'node:http'

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

function mask(name) { return name.length >= 2 ? name[0] + '*' + name.slice(2) : name }
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
  ticket_issue(b) {
    const member = db.members.get(b.member_id)
    if (!member) return { status: 404, body: { error: 'member_not_found' } }
    const channel = b.channel
    if (channel !== 'kiosk' && channel !== 'game') return { status: 400, body: { error: 'bad_channel' } }
    if (channel === 'game') {
      const score = b.meta && b.meta.score
      if (!(typeof score === 'number' && score >= 5000)) return { status: 400, body: { error: 'score_below_threshold' } }
    }
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
    const out = fn(body)
    return send(out.status, out.body)
  })
})
server.listen(PORT, '127.0.0.1', () => console.log('[popcorn-stub] listening http://127.0.0.1:' + PORT))
