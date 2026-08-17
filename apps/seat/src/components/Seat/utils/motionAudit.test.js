// 모션 규범 — ★**수신자 쪽 술어**(2026-08-17). 정본 = saruru-design/docs/MOTION-CANON.md v1.0
//
// 이 시험이 왜 여기 있나: 정본은 「적용 범위 = 화면 산출 **전부**」라고 적혀 있어 자리후도 대상인데,
//   **나에게 온 통지는 0건**이었다. 발신자 의존 규범에서 **침묵은 «안 바뀜»과 «통지 없음» 둘 다와 양립**한다 —
//   수신자가 스스로 재지 않으면 구별이 원리적으로 불가능하다. 그 사이 금지 목록 항목이 살아 있었다(실측 3건).
//   ⇒ 규범을 **읽는 것**에서 **재는 것**으로 옮긴다. 다음에 규범이 갱신되면 여기를 고치면 되고,
//     내가 규범을 어기면 통지를 기다리지 않고 **여기가 빨개진다.**
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { motionViolations, parseKeyframes, scalesOf, bounceCount, overshootPct } from './motionAudit'

const css = readFileSync(fileURLToPath(new URL('../Seat.css', import.meta.url)), 'utf8')

// ★**미해결 목록** — 화이트리스트가 아니라 «줄어들어야 하는 명단»이다.
//   차이: 와일드카드가 아니라 **정확 일치**다. 새 위반이 생기면 red, 고쳐서 사라져도 red(명단에서 지워야 한다).
//   그래서 여기 숨을 수 없다 — 항목마다 **왜 아직 안 고쳤는지·누가 정할 일인지**를 적는다.
//   ⚠이 셋은 «내가 못 고쳐서»가 아니라 **«내가 정할 일이 아니어서»** 남아 있다:
//     축하 연출은 유저가 명시로 요청한 기능이고(2026-08-02 「이모지 대신 실제 입자」),
//     한도에 맞추면 **성격이 눈에 띄게 바뀐다.** 결함 수정이 아니라 **결정**이다 → design·유저 몫으로 올렸다.
const PENDING = [
  '§6-3 오버슈트 18% (한도 6%): @keyframes seat-complete-pop',
  '§6-3 되튐 4회 (한도 1회): @keyframes seat-complete-pop',
  '§6-3 오버슈트 90% (한도 6%): @keyframes seat-check-burst',
  '§7 축하 색 무지개: #FF7BAC #FFD54F #7BE0FF — 정본 팔레트(#2D4B82·#3CB44B) + 무채색만.',
]

describe('Seat.css — MOTION-CANON §6 금지 목록(배포 차단)', () => {
  it('★미해결은 정확히 이 넷뿐 — 늘어도 red, 줄어도 red(명단을 지워야 한다)', () => {
    expect(motionViolations(css)).toEqual(PENDING)
  })

  it('★슬라이드 인은 0 이다 — 유저 상시 지시(「등장은 짧은 페이드 1회」)를 코드가 지킨다', () => {
    // 이 줄이 이번 라운드에 실제로 고친 것이다. 나머지 넷과 달리 여기엔 결정할 것이 없었다.
    // ★«0 건»을 주장하기 전에 **볼 것이 있었는지**를 먼저 단정한다(도구의 0 ≠ 세계의 0).
    //   깨뜨리기 시험에서 잡혔다: 파일 경로를 엉뚱한 곳으로 돌려도 이 시험만 **초록으로 남았다** —
    //   위반이 0 인 게 아니라 **볼 대상이 0** 이었던 것이다(공허 통과).
    expect(Object.keys(parseKeyframes(css))).toContain('seat-toast-in')
    expect(motionViolations(css).filter((w) => w.startsWith('§6-1'))).toEqual([])
  })
})

// ── 감사기 자체 시험 — ★「가드 자체도 감사 대상」. 판정이 헛돌면 «위반 0» 은 거짓 안심이다.
describe('motionAudit 자체 시험 — 결함을 주입하면 적중한다', () => {
  const wrap = (name, body) => `@keyframes ${name} {${body}}`

  it('★슬라이드 인을 잡는다(§6-1)', () => {
    const bad = wrap('x', 'from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)}')
    expect(motionViolations(bad).join('\n')).toMatch(/§6-1/)
  })

  it('★정렬용 고정 translate 는 잡지 않는다 — 값이 안 변하면 이동이 아니다(오탐이 가드를 죽인다)', () => {
    const ok = wrap('x', 'from{opacity:0;transform:translate(-50%, 0)} to{opacity:1;transform:translate(-50%, 0)}')
    expect(motionViolations(ok)).toEqual([])
  })

  it('★오버슈트 6% 초과를 잡는다(§6-3) — 축하도 이 한도 안이다', () => {
    expect(motionViolations(wrap('x', '0%{transform:scale(1)}50%{transform:scale(1.18)}100%{transform:scale(1)}')).join('\n'))
      .toMatch(/§6-3 오버슈트 18%/)
  })

  it('한도 안(6%)은 통과한다 — 축하 자체를 금지하는 게 아니다', () => {
    expect(motionViolations(wrap('x', '0%{transform:scale(1)}50%{transform:scale(1.06)}100%{transform:scale(1)}'))).toEqual([])
  })

  it('★되튐 2회 이상을 잡는다(§6-3)', () => {
    const bad = wrap('x', '0%{transform:scale(1)}20%{transform:scale(1.04)}50%{transform:scale(.98)}100%{transform:scale(1)}')
    expect(motionViolations(bad).join('\n')).toMatch(/되튐 2회/)
  })

  it('되튐 1회(위로 한 번 갔다 정착)는 통과한다', () => {
    expect(motionViolations(wrap('x', '0%{transform:scale(1)}50%{transform:scale(1.04)}100%{transform:scale(1)}'))).toEqual([])
  })

  it('★linear 등장을 잡는다(§6-8)', () => {
    expect(motionViolations('.a{animation: foo .3s linear;}').join('\n')).toMatch(/§6-8/)
  })

  it('★축하 무지개색을 잡는다(§7)', () => {
    expect(motionViolations('.seat-confetti i:nth-child(1){background:#FF7BAC}').join('\n')).toMatch(/§7 축하 색/)
  })

  it('정본 팔레트·무채색은 통과한다', () => {
    const ok = '.seat-confetti i:nth-child(1){background:#2D4B82}\n.seat-confetti i:nth-child(2){background:#9E9E9E}'
    expect(motionViolations(ok)).toEqual([])
  })

  it('★§7 색 검사가 실제로 콘페티 색 줄에 «닿는지» 단정한다(양성대조)', () => {
    // 지금 구현은 **줄 단위 스코프**다 — 색 선언이 셀렉터와 다른 줄로 재포맷되면 검사가 조용히 0 이 된다.
    //   그 0 을 «깨끗함»으로 읽으면 정확히 「도구의 0 을 세계의 0 으로 읽는」 사고다.
    //   ⇒ 지금 미해결 명단에 색 위반이 **떠 있다는 사실 자체**가 이 검사의 도달 증거다.
    //     명단에서 색 항목이 사라질 땐 **진짜 고쳐서인지 검사가 눈이 먼 건지** 이 시험이 되묻는다.
    const hits = css.split('\n').filter((l) => l.includes('.seat-confetti') && l.includes('#'))
    expect(hits.length).toBeGreaterThan(0)
  })

  it('★전건이 비면(keyframe 이 없으면) 조용히 통과한다 — 다만 그건 «검사 안 함»이지 «깨끗함»이 아니다', () => {
    // 이 시험은 그 사실을 못 박아 둔다: 위 「위반 0」이 초록인 근거는 아래 parseKeyframes 시험이 함께 서 준다.
    expect(motionViolations('')).toEqual([])
    expect(Object.keys(parseKeyframes(css)).length).toBeGreaterThan(0) // 실제로 볼 것이 있다
  })
})

describe('motionAudit 부품', () => {
  it('parseKeyframes — 중첩 중괄호를 세어 본문을 정확히 끊는다', () => {
    const f = parseKeyframes('@keyframes a{0%{opacity:0}100%{opacity:1}} .x{color:red}')
    expect(Object.keys(f)).toEqual(['a'])
    expect(f.a).toContain('100%')
    expect(f.a).not.toContain('color:red')
  })

  it('scalesOf / overshootPct / bounceCount', () => {
    const s = scalesOf('0%{transform:scale(1)}18%{transform:scale(1.18)}38%{transform:scale(.92)}100%{transform:scale(1)}')
    expect(s).toEqual([1, 1.18, 0.92, 1])
    expect(Math.round(overshootPct(s))).toBe(18)
    expect(bounceCount(s)).toBe(2)
  })
})
