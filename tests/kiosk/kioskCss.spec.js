// 키오스크 CSS 회귀 가드 — 규칙 단위.
//
// 이 테스트가 막으려는 두 사고(둘 다 이번 주 실증):
//   ⑴ **죽은 규칙이 다시 쌓인다** — 클래스를 JSX 에서 지우고 CSS 를 안 지운다.
//      죽은 규칙이 쌓이면 다음 사람이 그것을 «살아 있는 문법»으로 읽고 되살린다.
//   ⑵ **콤마 셀렉터 고아화** — 죽은 셀렉터를 지울 때 그 줄이 선언부를 지니고 있어서
//      앞의 콤마 형제들이 다음 규칙에 병합된다. 이름 방향 검사로는 안 잡힌다.
import { describe, it, expect } from 'vitest'
import { readKioskRules, ruleMap, readSourceText, classesIn, parseRules } from './cssRules.js'

const rules = readKioskRules()
const map = ruleMap(rules)
const src = readSourceText()

// 템플릿 문자열로 조립되는 클래스 — 소스에 리터럴로 안 나타나므로 죽은 규칙 판정에서 면제한다.
//
// ★면제는 «울타리»다 — 세운 이유를 문서가 아니라 **테스트가 들고 있어야** 이유가 소멸했을 때 같이 무너진다.
//   그래서 각 항목은 «어떤 표현이 이 이름을 만드는가»를 리터럴로 지니고, 아래 테스트가
//   그 표현이 소스에 아직 있는지 확인한다. 조립 코드가 사라지면 면제도 즉시 무효가 되어
//   그 클래스는 다시 «죽은 규칙» 판정 대상이 된다.
//   (근거 없는 면제를 손으로 나열하면 그 목록 자체가 죽은 규칙의 은신처가 된다 — 교본 지적.)
const DYNAMIC_SOURCES = [
  { prefix: 'mk-role-', values: ['customer', 'staff', 'scan', 'printer', 'editor', 'ticket'], composedBy: 'mk-role-${role}' },
  { prefix: 'mk-evt-step-', values: ['0', '1', '2'], composedBy: 'mk-evt-step-${step}' },
]
const DYNAMIC = new Set(DYNAMIC_SOURCES.flatMap((d) => d.values.map((v) => d.prefix + v)))

describe('Kiosk.css — 죽은 규칙', () => {
  it('CSS 의 모든 mk-* 클래스가 소스에서 참조된다', () => {
    const all = new Set()
    for (const r of rules) classesIn(r.sel).forEach((c) => all.add(c))
    const dead = [...all]
      .filter((c) => c.startsWith('mk-') && !DYNAMIC.has(c) && !src.includes(c))
      .sort()
    expect(dead, `죽은 CSS 클래스 ${dead.length}개 — JSX 에서 지웠으면 CSS 도 지운다`).toEqual([])
  })

  // ★면제의 이유가 아직 살아 있는지 — 울타리는 자기 이유를 들고 있어야 한다.
  for (const d of DYNAMIC_SOURCES) {
    it(`동적 조립 «${d.composedBy}» 이 소스에 아직 있다 — 없으면 ${d.prefix}* 면제는 무효다`, () => {
      expect(src, `${d.composedBy} 를 만드는 코드가 사라졌다 — DYNAMIC_SOURCES 항목을 지워라`).toContain(d.composedBy)
    })
  }
})

// ★고아화 감시 대상 — 죽은 셀렉터와 **같은 콤마 그룹에 살아 있던** 셀렉터들.
//   A 라운드(죽은 규칙 21개 제거)에서 이들이 선언을 잃거나 남의 선언을 흡수하는 것이 유일한 실질 위험이었다.
//   각 항목: [컨텍스트, 셀렉터, 반드시 들어 있어야 하는 선언 조각]
const LIVE_SIBLINGS = [
  ['', '.mk-greeting', 'font-family: var(--mk-font-title)'],
  ['', '.pv-login h1', 'font-family: var(--mk-font-title)'],
  ['', '.mk-signup-head h2', 'font-family: var(--mk-font-title)'],
  ['', '.mk-ml-head h2', 'font-family: var(--mk-font-title)'],
  ['', '.mk-key', 'position: relative'],
  ['', '.mk-pad-submit', 'position: relative'],
  ['', '.mk-signup-submit', 'position: relative'],
  ['', '.mk-claim-btn', 'position: relative'],
  ['', '.mk-key::after', 'content: \'\''],
  ['', '.mk-pad-submit::after', 'content: \'\''],
]

describe('Kiosk.css — 콤마 형제 고아화 방지', () => {
  for (const [ctx, sel, needle] of LIVE_SIBLINGS) {
    it(`${sel} 가 선언을 유지한다 (${needle})`, () => {
      const decls = map.get(`${ctx}||${sel}`)
      expect(decls, `${sel} 규칙이 사라졌다 — 콤마 그룹에서 형제째로 지워졌는지 확인`).toBeTruthy()
      expect(decls.join(' ; '), `${sel} 가 «${needle}» 을 잃었다`).toContain(needle)
    })
  }
})

describe('Kiosk.css — 구조 불변', () => {
  it('빈 선언 블록이 없다(셀렉터만 남은 규칙 = 고아화 흔적)', () => {
    const empty = rules.filter((r) => r.decls.length === 0).map((r) => `${r.ctx}||${r.sel}`)
    expect(empty, '선언이 빈 규칙 — 삭제가 선언부를 데려갔을 수 있다').toEqual([])
  })

  it('예약칸 토큰이 살아 있다 — 카운트다운 자리(상시 예약)의 근거', () => {
    // 이 토큰이 사라지면 막대가 다시 본문을 덮거나 «이 번호가 맞나요?» 시트가 잘린다(31aa629 경위).
    const slot = map.get('||.mk-idle-slot')
    expect(slot, '.mk-idle-slot 규칙 없음').toBeTruthy()
    expect(slot.join(' ; ')).toContain('var(--mk-idle-slot)')
    expect(map.get('||.mk-role-customer .mk-pick-overlay').join(' ; ')).toContain('bottom: var(--mk-idle-slot)')
  })

  it('★:root 다크 토큰 블록이 규칙 지도에 있다 — 가드의 사각을 막는다', () => {
    // 감사관 2호 실증(2026-08-09): 파서가 `@import ...;` 를 소비하지 못해 바로 뒤 `:root` 블록이
    // 지도에서 통째로 누락돼 있었다. 그 구간에선 삭제·고아화가 나도 다른 가드가 전부 침묵한다.
    const root = map.get('||:root')
    expect(root, ':root 규칙이 지도에 없다 — parseRules 의 at-rule 소비를 확인하라').toBeTruthy()
    const joined = root.join(' ; ')
    for (const tok of ['--md-surface:', '--md-on-surface:', '--md-primary:', '--md-outline:']) {
      expect(joined, `${tok} 토큰이 사라졌다`).toContain(tok)
    }
    expect(root.filter((d) => d.startsWith('--md-')).length, '--md-* 토큰 수가 급감했다').toBeGreaterThanOrEqual(20)
  })

  it('로고가 비율을 지키는 선언을 유지한다 — 눌림 회귀 방지(3fd5ce7 경위)', () => {
    const logo = map.get('||.mk-role-customer .mk-brand-logo')
    expect(logo, '.mk-role-customer .mk-brand-logo 규칙 없음').toBeTruthy()
    const joined = logo.join(' ; ')
    expect(joined, 'object-fit 이 없으면 max-height 가 비율을 깬다').toContain('object-fit: contain')
    expect(joined, 'width 가 고정이면 다시 눌린다').toContain('width: auto')
  })
})

// ★파서 자체의 회귀 시험 — 가드가 «못 보는 구간»을 만들지 않는지.
//   이 블록이 없으면 파서 결함(=그 구간 전체 침묵)을 어떤 CSS 테스트도 잡지 못한다.
//   교훈 출처: 내 프루너의 «주석 + @media 오인»과 이 가드의 «@import 미소비»가 같은 결함이었다.
describe('parseRules — at-rule 처리(가드의 사각 방지)', () => {
  it('블록 없는 at-rule(@import) 뒤의 규칙을 소비한다', () => {
    const m = ruleMap(parseRules("@import './x.css';\n:root { --a: 1; }\n.b { color: red; }"))
    expect([...m.keys()]).toEqual(['||:root', '||.b'])
    expect(m.get('||:root')).toEqual(['--a: 1'])
  })

  it('@import 가 컨텍스트를 열지 않는다', () => {
    expect(parseRules("@import 'a';\n.x { color: red; }")[0].ctx).toBe('')
  })

  it('@media 는 컨텍스트로 유지된다(같은 셀렉터가 컨텍스트별로 갈린다)', () => {
    const m = ruleMap(parseRules('.x { a: 1; }\n@media (min-width: 10px) { .x { a: 2; } }'))
    expect(m.get('||.x')).toEqual(['a: 1'])
    expect(m.get('@media (min-width: 10px)||.x')).toEqual(['a: 2'])
  })

  it('주석이 앞에 붙은 at-rule 도 컨텍스트로 인식한다(오인 시 그 블록이 통째로 누락된다)', () => {
    const m = ruleMap(parseRules('/* 설명 */\n@media print { .p { a: 1; } }'))
    expect(m.get('@media print||.p')).toEqual(['a: 1'])
  })
})
