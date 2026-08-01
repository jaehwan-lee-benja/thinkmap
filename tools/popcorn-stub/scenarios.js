// 팝콘 루프 — 자동 시나리오 러너 (S1~S8, POPCORN-LOOP-SPEC 흐름)
// 실행: node scenarios.js [port]  — 스텁 서버가 그 포트에 떠 있어야 함(기본 8931).
// 전 시나리오 PASS 시 exit 0 / 실패 있으면 exit 1 + 상세. "될 때까지 루프"의 판정기.
const PORT = Number(process.argv[2] || 8931)
const BASE = 'http://127.0.0.1:' + PORT

async function call(fn, body) {
  const r = await fetch(BASE + '/' + fn, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
  return { status: r.status, body: await r.json() }
}

const results = []
function check(sid, name, cond, detail) {
  results.push({ sid, name, pass: !!cond, detail: cond ? '' : JSON.stringify(detail) })
}

async function main() {
  await call('_reset')

  // ── S1. 키오스크 발권 → 영수증 페이로드 ──────────────────────────────────
  const i1 = await call('ticket_issue', { member_id: 'm-hong', channel: 'kiosk' })
  check('S1', '발권 성공+토큰 형식(12자 영숫자·혼동문자 제외)', i1.status === 200 && /^[A-HJ-NP-Z2-9]{12}$/.test(i1.body.token), i1)
  const look1 = await call('ticket_lookup', { token: i1.body.token })
  check('S1', '영수증 페이로드(마스킹명·채널·상태·스탬프)', look1.body.display_name === '홍*동' && look1.body.channel === 'kiosk' && look1.body.state === 'issued' && look1.body.stamp.threshold === 10, look1)
  const re1 = await call('ticket_issue', { member_id: 'm-hong', channel: 'kiosk' })
  check('S1', '재발권 멱등(같은날 같은채널=동일 토큰)', re1.body.token === i1.body.token && re1.body.reissued === true, re1)

  // ── S2. 카운터 스캔 → 회수 → 스탬프 확정 ────────────────────────────────
  const before = look1.body.stamp.current_stamps
  const r2 = await call('ticket_redeem', { token: i1.body.token, redeemed_by: 'counter-1' })
  check('S2', '회수 성공', r2.body.ok === true, r2)
  check('S2', '★스탬프는 회수 시점 적립(+1)', r2.body.stamp.current_stamps === before + 1, { before, after: r2.body.stamp })

  // ── S3. 이중 스캔 거부 ───────────────────────────────────────────────────
  const r3 = await call('ticket_redeem', { token: i1.body.token, redeemed_by: 'counter-1' })
  check('S3', '이중 스캔 거부(already_redeemed)', r3.body.ok === false && r3.body.reason === 'already_redeemed', r3)

  // ── S4. 만료 거부(다음날 KST) ────────────────────────────────────────────
  const i4 = await call('ticket_issue', { member_id: 'm-lee', channel: 'kiosk' })
  await call('_time', { now: new Date(Date.now() + 26 * 3600 * 1000).toISOString() }) // +26h → 다음날
  const r4 = await call('ticket_redeem', { token: i4.body.token })
  check('S4', '만료 티켓 회수 거부(expired)', r4.body.ok === false && r4.body.reason === 'expired', r4)
  await call('_time', { now: null })

  // ── S5. 게임 회원 크로스체크 ─────────────────────────────────────────────
  const p5a = await call('member_by_phone', { phone: '010-1111-2222' })
  check('S5', '기존 회원 전화 → member_id(자동 연결)', p5a.body.found === true && p5a.body.member_id === 'm-hong', p5a)
  const p5b = await call('member_by_phone', { phone: '01099998888' })
  check('S5', '비회원 전화 → found:false', p5b.body.found === false, p5b)
  const j5 = await call('membership_intake', { phone: '01099998888', name: '김신규' })
  check('S5', '게임 내 가입 → member 생성', j5.status === 200 && j5.body.created === true && !!j5.body.member_id, j5)
  const p5c = await call('member_by_phone', { phone: '01099998888' })
  check('S5', '가입 후 크로스체크 성립', p5c.body.found === true && p5c.body.member_id === j5.body.member_id, p5c)

  // ── S6. 5,000점 쿠폰 발행(조건·1일1회) ───────────────────────────────────
  const g6low = await call('ticket_issue', { member_id: 'm-hong', channel: 'game', meta: { score: 4999 } })
  check('S6', '5,000점 미만 거부', g6low.status === 400 && g6low.body.error === 'score_below_threshold', g6low)
  const g6 = await call('ticket_issue', { member_id: 'm-hong', channel: 'game', meta: { score: 5200 } })
  check('S6', '5,000점 이상 쿠폰 발행', g6.status === 200 && !!g6.body.token, g6)
  const g6b = await call('ticket_issue', { member_id: 'm-hong', channel: 'game', meta: { score: 9000 } })
  check('S6', '같은날 game 재발행=동일 토큰(1일1회 멱등)', g6b.body.token === g6.body.token && g6b.body.reissued === true, g6b)

  // ── S7. 쿠폰 회수 ────────────────────────────────────────────────────────
  const r7 = await call('ticket_redeem', { token: g6.body.token, redeemed_by: 'counter-1' })
  check('S7', '게임 쿠폰 회수+스탬프 적립', r7.body.ok === true && r7.body.channel === 'game', r7)

  // ── S8. 하루 2스탬프 상한(kiosk1+game1, 3번째 없음) ──────────────────────
  const s8 = await call('ticket_lookup', { token: g6.body.token })
  check('S8', '오늘 홍길동 스탬프=2(kiosk+game)', s8.body.stamp.current_stamps === 2, s8.body.stamp)
  const k8 = await call('ticket_issue', { member_id: 'm-hong', channel: 'kiosk' })
  check('S8', 'kiosk 3번째 시도=기존 토큰(추가 발권 불가)', k8.body.reissued === true, k8)
  const g8 = await call('ticket_issue', { member_id: 'm-hong', channel: 'game', meta: { score: 8000 } })
  check('S8', 'game 3번째 시도=기존 토큰(추가 발권 불가)', g8.body.reissued === true, g8)
  // 회수도 이중스캔 거부라 스탬프 그대로 → 상한 2 유지
  const r8 = await call('ticket_redeem', { token: k8.body.token })
  const s8b = await call('ticket_lookup', { token: g6.body.token })
  check('S8', '재회수 시도 후에도 스탬프=2(상한 유지)', r8.body.ok === false && s8b.body.stamp.current_stamps === 2, { r8: r8.body, stamp: s8b.body.stamp })

  // ── 결과 ─────────────────────────────────────────────────────────────────
  const fails = results.filter((r) => !r.pass)
  for (const r of results) console.log((r.pass ? 'PASS' : 'FAIL') + '  [' + r.sid + '] ' + r.name + (r.pass ? '' : '  ← ' + r.detail))
  console.log('\n' + (results.length - fails.length) + '/' + results.length + ' PASS' + (fails.length ? '  ★FAIL ' + fails.length : '  — ALL GREEN'))
  process.exit(fails.length ? 1 : 0)
}

main().catch((e) => { console.error('runner error:', e); process.exit(2) })
