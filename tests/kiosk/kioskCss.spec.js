// 키오스크 CSS 회귀 가드 — 규칙 단위.
//
// 이 테스트가 막으려는 두 사고(둘 다 이번 주 실증):
//   ⑴ **죽은 규칙이 다시 쌓인다** — 클래스를 JSX 에서 지우고 CSS 를 안 지운다.
//      죽은 규칙이 쌓이면 다음 사람이 그것을 «살아 있는 문법»으로 읽고 되살린다.
//   ⑵ **콤마 셀렉터 고아화** — 죽은 셀렉터를 지울 때 그 줄이 선언부를 지니고 있어서
//      앞의 콤마 형제들이 다음 규칙에 병합된다. 이름 방향 검사로는 안 잡힌다.
import { describe, it, expect } from 'vitest'
import { readKioskRules, ruleMap, readSourceText, classesIn } from './cssRules.js'

const rules = readKioskRules()
const map = ruleMap(rules)
const src = readSourceText()

// 템플릿 문자열로 조립되는 클래스 — 소스에 리터럴로 안 나타난다(오탐 방지 화이트리스트).
// ★새 항목을 넣을 땐 «조립하는 코드 위치»를 같이 적는다. 근거 없는 면제는 죽은 규칙의 은신처가 된다.
const DYNAMIC = new Set([
  'mk-role-customer',   // MembershipKiosk.jsx: `mk-role-${role}`
  'mk-role-staff',
  'mk-role-scan',
  'mk-role-printer',
  'mk-role-editor',
  'mk-role-ticket',
  'mk-evt-step-0',      // EventTicketCard.jsx: `mk-evt-step-${step}`
  'mk-evt-step-1',
  'mk-evt-step-2',
])

describe('Kiosk.css — 죽은 규칙', () => {
  it('CSS 의 모든 mk-* 클래스가 소스에서 참조된다', () => {
    const all = new Set()
    for (const r of rules) classesIn(r.sel).forEach((c) => all.add(c))
    const dead = [...all]
      .filter((c) => c.startsWith('mk-') && !DYNAMIC.has(c) && !src.includes(c))
      .sort()
    expect(dead, `죽은 CSS 클래스 ${dead.length}개 — JSX 에서 지웠으면 CSS 도 지운다`).toEqual([])
  })
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

  it('로고가 비율을 지키는 선언을 유지한다 — 눌림 회귀 방지(3fd5ce7 경위)', () => {
    const logo = map.get('||.mk-role-customer .mk-brand-logo')
    expect(logo, '.mk-role-customer .mk-brand-logo 규칙 없음').toBeTruthy()
    const joined = logo.join(' ; ')
    expect(joined, 'object-fit 이 없으면 max-height 가 비율을 깬다').toContain('object-fit: contain')
    expect(joined, 'width 가 고정이면 다시 눌린다').toContain('width: auto')
  })
})
