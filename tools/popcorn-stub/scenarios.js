// 팝콘 루프 — 자동 시나리오 러너 (S1~S8, POPCORN-LOOP-SPEC 흐름)
// 실행: node scenarios.js [port]  — 스텁 서버가 그 포트에 떠 있어야 함(기본 8931).
// 전 시나리오 PASS 시 exit 0 / 실패 있으면 exit 1 + 상세. "될 때까지 루프"의 판정기.
const PORT = Number(process.argv[2] || 8931)
const BASE = 'http://127.0.0.1:' + PORT
import { signAssertion } from './dev-sign.js'

// KST 오늘(스텁 today()와 동형)
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

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
  // 마스킹 = 서버 정본(crm.mask_name) 동형: 4자 "가나다라"→"가**라"
  await call('_seed_member', { id: 'm-4char', name: '가나다라', phone: '01055556666' })
  const p5d = await call('member_by_phone', { phone: '01055556666' })
  check('S5', '마스킹 서버정본 동형(가나다라→가**라)', p5d.body.display_name === '가**라', p5d)

  // ── S6. 5,000점 쿠폰 발행(조건·1일1회) ───────────────────────────────────
  const aLow = await signAssertion({ memberId: 'm-hong', score: 4999, eventDate: kstToday() })
  const g6low = await call('ticket_issue', { channel: 'game', assertion: aLow })
  check('S6', '5,000점 미만 거부(서명은 유효)', g6low.status === 400 && g6low.body.error === 'score_below_threshold', g6low)
  const aOk = await signAssertion({ memberId: 'm-hong', score: 5200, eventDate: kstToday() })
  const g6 = await call('ticket_issue', { channel: 'game', assertion: aOk })
  check('S6', '5,000점 이상 쿠폰 발행(assertion sub=member)', g6.status === 200 && !!g6.body.token, g6)
  const aOk2 = await signAssertion({ memberId: 'm-hong', score: 9000, eventDate: kstToday() })
  const g6b = await call('ticket_issue', { channel: 'game', assertion: aOk2 })
  check('S6', '같은날 game 재발행=동일 토큰(1일1회 멱등)', g6b.body.token === g6.body.token && g6b.body.reissued === true, g6b)

  // ── S7. 쿠폰 회수 ────────────────────────────────────────────────────────
  const r7 = await call('ticket_redeem', { token: g6.body.token, redeemed_by: 'counter-1' })
  check('S7', '게임 쿠폰 회수+스탬프 적립', r7.body.ok === true && r7.body.channel === 'game', r7)

  // ── S8. 하루 2스탬프 상한(kiosk1+game1, 3번째 없음) ──────────────────────
  const s8 = await call('ticket_lookup', { token: g6.body.token })
  check('S8', '오늘 홍길동 스탬프=2(kiosk+game)', s8.body.stamp.current_stamps === 2, s8.body.stamp)
  const k8 = await call('ticket_issue', { member_id: 'm-hong', channel: 'kiosk' })
  check('S8', 'kiosk 3번째 시도=기존 토큰(추가 발권 불가)', k8.body.reissued === true, k8)
  const a8 = await signAssertion({ memberId: 'm-hong', score: 8000, eventDate: kstToday() })
  const g8 = await call('ticket_issue', { channel: 'game', assertion: a8 })
  check('S8', 'game 3번째 시도=기존 토큰(추가 발권 불가)', g8.body.reissued === true, g8)
  // 회수도 이중스캔 거부라 스탬프 그대로 → 상한 2 유지
  const r8 = await call('ticket_redeem', { token: k8.body.token })
  const s8b = await call('ticket_lookup', { token: g6.body.token })
  check('S8', '재회수 시도 후에도 스탬프=2(상한 유지)', r8.body.ok === false && s8b.body.stamp.current_stamps === 2, { r8: r8.body, stamp: s8b.body.stamp })

  // ── S10. 영수증 템플릿 → ESC/POS 생성기(프리뷰=실인쇄 공유 소스) ─────────
  const { DEFAULT_TEMPLATE, validateTemplate, buildEscpos, previewSequence } =
    await import('../../apps/membership/src/receipt/receiptTemplate.js')
  const data10 = { name: '홍*동', date: '2026-08-01 14:30', token: i1.body.token, stamp: '2/10' }
  const bytes = buildEscpos(DEFAULT_TEMPLATE, data10)
  check('S10', 'ESC/POS 페이로드 생성(init+CODE128 GS k 73 포함)',
    bytes[0] === 0x1b && bytes[1] === 0x40 && Array.from(bytes).some((b, i) => b === 0x1d && bytes[i + 1] === 0x6b && bytes[i + 2] === 73),
    { len: bytes.length })
  const seq10 = previewSequence(DEFAULT_TEMPLATE, data10)
  check('S10', '프리뷰 시퀀스에 바코드·QR 블록 존재(생성기 공유)',
    seq10.some((s) => s.kind === 'barcode' && s.token === data10.token) && seq10.some((s) => s.kind === 'qr'), seq10.map((s) => s.kind))
  // 템플릿 변경(문구 수정+블록 이동) → 재생성 정상
  const tpl10 = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE))
  tpl10.width = 58
  tpl10.blocks[1].text = '사르르 팝콘 교환권'
  const moved = tpl10.blocks.splice(7, 1)[0]; tpl10.blocks.splice(3, 0, moved) // QR 위로 이동
  const bytes2 = buildEscpos(tpl10, data10)
  // 길이 아닌 내용 비교(문구가 우연히 같은 바이트수일 수 있음 — 루프1 FAIL 교훈)
  const differs = bytes2.length !== bytes.length || Array.from(bytes2).some((b, i) => b !== bytes[i])
  check('S10', '템플릿 변경(58mm·문구·순서) 후 재생성 반영', bytes2.length > 0 && differs, { a: bytes.length, b: bytes2.length })
  // ★필수 블록(토큰 바코드) off → 저장 거부
  const bad10 = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE))
  bad10.blocks.find((b) => b.type === 'barcode').on = false
  const v10 = validateTemplate(bad10)
  let threw = false
  try { buildEscpos(bad10, data10) } catch (e) { threw = true }
  check('S10', '★토큰 바코드 누락 시 저장/생성 거부', v10.ok === false && threw, v10)

  // ── S11. game assertion 계약 6종(확정 v1.0 — fail-closed) ────────────────
  const aGood = await signAssertion({ memberId: 'm-lee', score: 6000, eventDate: kstToday() })
  const s11ok = await call('ticket_issue', { channel: 'game', assertion: aGood })
  check('S11', '유효 서명 → 200 발권', s11ok.status === 200 && !!s11ok.body.token, s11ok)
  const aExp = await signAssertion({ memberId: 'm-lee', score: 6000, eventDate: kstToday(), now: Date.now() - 120000 })
  const s11exp = await call('ticket_issue', { channel: 'game', assertion: aExp })
  check('S11', '만료(exp+90s 초과) → 401 assertion_expired', s11exp.status === 401 && s11exp.body.error === 'assertion_expired', s11exp)
  // alg:none 위조(서명 제거)
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const noneJws = b64u({ alg: 'none', kid: 'dev-1' }) + '.' + b64u({ sub: 'm-lee', score: 9999, event_date: kstToday(), exp: Math.floor(Date.now()/1000)+60 }) + '.'
  const s11none = await call('ticket_issue', { channel: 'game', assertion: noneJws })
  check('S11', 'alg:none 위조 → 401 assertion_invalid', s11none.status === 401 && s11none.body.error === 'assertion_invalid', s11none)
  const aBadKid = await signAssertion({ memberId: 'm-lee', score: 6000, eventDate: kstToday(), kid: 'prod-2099' })
  const s11kid = await call('ticket_issue', { channel: 'game', assertion: aBadKid })
  check('S11', '미등록 kid → 401 assertion_invalid', s11kid.status === 401 && s11kid.body.error === 'assertion_invalid', s11kid)
  const aWrongDate = await signAssertion({ memberId: 'm-lee', score: 6000, eventDate: '2020-01-01' })
  const s11date = await call('ticket_issue', { channel: 'game', assertion: aWrongDate })
  check('S11', 'event_date 불일치 → 400 date_mismatch', s11date.status === 400 && s11date.body.error === 'date_mismatch', s11date)
  const s11mid = await call('ticket_issue', { channel: 'game', member_id: 'm-lee', assertion: aGood })
  check('S11', '★game 본문 member_id → 400 member_id_not_allowed', s11mid.status === 400 && s11mid.body.error === 'member_id_not_allowed', s11mid)

  // ── 결과 ─────────────────────────────────────────────────────────────────
  const fails = results.filter((r) => !r.pass)
  for (const r of results) console.log((r.pass ? 'PASS' : 'FAIL') + '  [' + r.sid + '] ' + r.name + (r.pass ? '' : '  ← ' + r.detail))
  console.log('\n' + (results.length - fails.length) + '/' + results.length + ' PASS' + (fails.length ? '  ★FAIL ' + fails.length : '  — ALL GREEN'))
  process.exit(fails.length ? 1 : 0)
}

main().catch((e) => { console.error('runner error:', e); process.exit(2) })
