// 프리뷰 모드 데모 데이터 — ★**dev 서버에서만** 쓰인다(`?preview=1`). 진입점은 api/membership.js 의 callProxy.
//
// 왜 여기인가: 모든 Edge 호출이 `callProxy` 하나를 지난다. 거기서 갈라두면
//   **네트워크 호출 자체가 일어나지 않는다** — 「발권/원장 API 는 절대 호출하지 않는다」가
//   규칙이 아니라 **구조로** 보장된다(화면마다 조건을 흩뿌리면 언젠가 한 곳이 새어나간다).
//
// 상태는 모듈 스코프에 둔다 — 발권 → 재조회 → 회수까지 **한 번의 새로고침 안에서 이어져야**
//   여정이 성립한다. 새로고침하면 초기화된다(seat 프리뷰와 같은 성질).
//
// 데모 번호 규칙(화면 배너에도 표시):
//   · 끝자리 0 → **미회원**(가입 화면 실습)
//   · 끝자리 9 → 스탬프 9/10 + 아이스크림 수령 가능(직원 «수령» 실습)
//   · 그 외    → 스탬프 3/10(기본 여정)

const DELAY = 420   // 조회 로딩 화면(마스코트 깜박임)도 여정의 일부라 일부러 지연을 준다

// 로컬 날짜(UTC 로 밀리면 «오늘»이 어긋난다). kioskUtils 와 같은 규칙이지만
// api 계층이 UI 모듈을 import 하지 않도록 여기서 최소 구현한다.
function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const state = {
  members: {},      // phone -> member
  tickets: {},      // token -> ticket
  byMember: {},     // member_id -> token(오늘)
}

function maskName(phone) {
  const tail = phone.slice(-4)
  const NAMES = ['김*은', '이*환', '박*민', '정*아', '최*호']
  return NAMES[Number(tail) % NAMES.length]
}

function ensureMember(phone) {
  if (state.members[phone]) return state.members[phone]
  const last = phone.slice(-1)
  const current = last === '9' ? 9 : 3
  const m = {
    member_id: 'pv-' + phone,
    display_name: maskName(phone),
    phone,
    today_event_claimed: false,
    stamp: {
      claims_total: current, current_stamps: current, threshold: 10,
      rewards_earned: last === '9' ? 1 : 0, rewards_redeemed: 0,
      rewards_available: last === '9' ? 1 : 0,
    },
  }
  state.members[phone] = m
  return m
}

function memberById(id) {
  return Object.values(state.members).find((m) => m.member_id === id) || null
}

function newToken() {
  // 12자 ASCII(스캐너 규격) — 프리뷰 표식으로 앞에 PV 를 둔다(실토큰과 눈으로 구분된다).
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = 'PV'
  for (let i = 0; i < 10; i++) s += pool[Math.floor(Math.random() * pool.length)]
  return s
}

function handle(fn, body = {}) {
  const t = today()

  if (fn === 'membership-lookup') {
    const phone = String(body.phone || '')
    if (phone.slice(-1) === '0') return { found: false }
    const m = ensureMember(phone)
    return { found: true, member_id: m.member_id, display_name: m.display_name, today_event_claimed: m.today_event_claimed, stamp: m.stamp }
  }

  if (fn === 'membership-history') {
    return { events: [
      { event_date: '2026-08-04', claimed_at: '2026-08-04T10:12:00+09:00' },
      { event_date: '2026-08-01', claimed_at: '2026-08-01T15:40:00+09:00' },
      { event_date: '2026-07-28', claimed_at: '2026-07-28T11:05:00+09:00' },
    ] }
  }

  if (fn === 'membership-ticket-today') {
    const tok = state.byMember[body.member_id]
    const tk = tok && state.tickets[tok]
    return { tickets: tk && tk.event_date === t ? [tk] : [] }
  }

  if (fn === 'membership-ticket-issue') {
    const m = memberById(body.member_id)
    if (!m) return { ok: false, error: 'not_found' }
    const existing = state.byMember[m.member_id]
    if (existing && state.tickets[existing]?.event_date === t) {
      return { ok: true, token: existing, reissued: true, event_date: t }
    }
    const token = newToken()
    state.tickets[token] = { token, channel: 'kiosk', state: 'issued', event_date: t, member_id: m.member_id, display_name: m.display_name }
    state.byMember[m.member_id] = token
    return { ok: true, token, reissued: false, event_date: t }
  }

  if (fn === 'membership-ticket-lookup') {
    const tk = state.tickets[String(body.token || '').toUpperCase()]
    if (!tk) return { ok: false, error: 'not_found' }
    const m = memberById(tk.member_id)
    return { ok: true, state: tk.state, channel: tk.channel, event_date: tk.event_date, display_name: tk.display_name, stamp: m ? m.stamp : null }
  }

  if (fn === 'membership-ticket-redeem') {
    const tk = state.tickets[String(body.token || '').toUpperCase()]
    if (!tk) return { ok: false, reason: 'not_found' }
    if (tk.state === 'redeemed') return { ok: false, reason: 'already_redeemed' }
    tk.state = 'redeemed'
    const m = memberById(tk.member_id)
    if (m) {
      m.today_event_claimed = true
      const s = m.stamp
      s.claims_total += 1
      s.current_stamps = (s.current_stamps + 1) % s.threshold
      if (s.current_stamps === 0) { s.rewards_earned += 1; s.rewards_available += 1 }
    }
    return { ok: true, display_name: tk.display_name, channel: tk.channel, stamp: m ? m.stamp : null }
  }

  if (fn === 'membership-stamp') {
    const m = memberById(body.member_id)
    return { stamp: m ? m.stamp : null }
  }

  if (fn === 'membership-reward') {
    const m = memberById(body.member_id)
    if (!m || m.stamp.rewards_available < 1) return { ok: false, reason: 'no_reward' }
    m.stamp.rewards_available -= 1
    m.stamp.rewards_redeemed += 1
    return { ok: true, rewards_available: m.stamp.rewards_available }
  }

  if (fn === 'membership-signup') {
    const phone = String(body.phone || '')
    // 가입한 번호는 **그 자리에서 조회되게** 한다 — 프리뷰에서만 그렇다.
    //   (실제로는 canonical 승격이 수동 배치라 «가입 직후 조회 불가」가 미해결 과제다. 혼동 주의.)
    const m = ensureMember(phone.slice(-1) === '0' ? phone.slice(0, -1) + '1' : phone)
    return { ok: true, member_id: m.member_id, created: true }
  }

  if (fn === 'membership-list') {
    const q = String(body.q || '').trim()
    if (q.length < 2) return { members: [] }
    return { members: [
      { member_id: 'pv-1', name: '김○○', phone: '****-5678', status: 'active' },
      { member_id: 'pv-2', name: '이○○', phone: '****-1119', status: 'active' },
      { member_id: 'pv-3', name: '박○○', phone: '****-3330', status: 'inactive' },
    ] }
  }

  if (fn === 'membership-event') return { ok: true, already: false, claimed_at: new Date().toISOString() }

  return { ok: true }
}

export function previewResponse(fn, body) {
  return new Promise((resolve) => { setTimeout(() => resolve(handle(fn, body)), DELAY) })
}
