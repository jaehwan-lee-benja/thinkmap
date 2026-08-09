// ★검사 도구 자체의 회귀 테스트 — 교본 «가드 자체도 감사 대상», «가드 도입 커밋엔 변이 시험 필수».
//
// 여기서 증명하려는 것은 두 가지다:
//   ⑴ 파서가 **사각 없이** 규칙을 잡는가(블록 없는 at-rule · 중첩 @media · 주석 속 중괄호 · keyframe 스텝)
//   ⑵ 결함을 **인위로 주입**했을 때 적중하는가(변이 시험) — 조용한 가드가 «보고 있다»는 증거.
import { describe, it, expect } from 'vitest'
import { parseRules, findSwallowedSections, hasNonZeroPadding, maskCss } from './cssAudit'

describe('cssAudit 파서 — 사각 점검', () => {
  it('블록 없는 at-rule 이 뒤 규칙을 삼키지 않는다(:root 지도 누락 실증)', () => {
    const css = '@charset "utf-8";\n@import url(x.css);\n:root { --a: 1; }\n.b { color: red; }'
    const sels = parseRules(css).map((r) => r.selectors.join(','))
    expect(sels).toEqual([':root', '.b'])
  })

  it('중첩 @media 안쪽 규칙을 잡고, at-rule 자체는 규칙으로 세지 않는다', () => {
    const css = '.a { color: red; }\n@media (max-width: 100px) {\n  .b { color: blue; }\n}'
    expect(parseRules(css).map((r) => r.selectors.join(','))).toEqual(['.a', '.b'])
  })

  it('주석 속 중괄호·백틱이 규칙 경계를 오독하게 하지 않는다', () => {
    const css = '/* 설명: `{ pointer-events: none; }` 처럼 중괄호가 들어있다 */\n.a { color: red; }'
    const rules = parseRules(css)
    expect(rules).toHaveLength(1)
    expect(rules[0].selectors).toEqual(['.a'])
    expect(rules[0].body).toBe('color: red;')
  })

  it('@keyframes 의 0%/from/to 는 셀렉터가 아니므로 제외한다', () => {
    const css = '@keyframes k { from { opacity: 0 } 50% { opacity: .5 } to { opacity: 1 } }\n.a { color: red; }'
    expect(parseRules(css).map((r) => r.selectors.join(','))).toEqual(['.a'])
  })

  it('선언부가 빈 규칙은 세지 않는다', () => {
    expect(parseRules('.a { }\n.b { color: red; }').map((r) => r.selectors.join(','))).toEqual(['.b'])
  })

  it('maskCss 는 주석을 «지우지 않고» 자리를 남긴다(삼킴 탐지에 필요)', () => {
    expect(maskCss('/* x */.a{}')).not.toContain('/*')
    expect(maskCss('/* x */.a{}')).toContain('.a{}')
  })
})

describe('cssAudit 변이 시험 — 결함을 주입하면 적중하는가', () => {
  // 2026-08-09 실제 결함의 축소 재현: 콤마 목록의 **마지막 줄**(선언부를 진 줄)이 지워진 모습.
  const BROKEN = `
.mode-a .x { opacity: .5; }
.mode-a .y,
.mode-a .z,
/* 다음 구획 설명 */
.mode-b .p,
.mode-b .q { opacity: .4; pointer-events: none; }
`
  const FIXED = `
.mode-a .x { opacity: .5; }
.mode-a .y,
.mode-a .z { pointer-events: none; }
/* 다음 구획 설명 */
.mode-b .p,
.mode-b .q { opacity: .4; pointer-events: none; }
`

  it('★고아화(구획 삼킴)를 잡는다 — 그리고 고친 판에서는 조용하다', () => {
    expect(findSwallowedSections(BROKEN)).not.toEqual([])
    expect(findSwallowedSections(FIXED)).toEqual([])
  })

  it('★서로 다른 모드가 한 규칙에 섞인 것을 잡는다', () => {
    const mixedOf = (css) => parseRules(css).filter((r) =>
      r.selectors.some((s) => s.includes('.mode-a')) && r.selectors.some((s) => s.includes('.mode-b')))
    expect(mixedOf(BROKEN)).toHaveLength(1)
    expect(mixedOf(FIXED)).toHaveLength(0)
  })

  it('★흡수된 규칙이 원치 않는 선언(이중 dim)을 받은 것을 잡는다', () => {
    const yRule = (css) => parseRules(css).find((r) => r.selectors.includes('.mode-a .y'))
    expect(yRule(BROKEN).body).toContain('opacity')   // 결함: opacity 를 덤으로 받았다
    expect(yRule(FIXED).body).not.toContain('opacity')
  })

  it('패딩 검사 — 0 은 통과, 0 아닌 값·복합값은 잡는다', () => {
    expect(hasNonZeroPadding('padding: 0;')).toBe(false)
    expect(hasNonZeroPadding('padding: 0 0 0 0;')).toBe(false)
    expect(hasNonZeroPadding('padding-top: 16px;')).toBe(true)
    expect(hasNonZeroPadding('padding: 0 16px;')).toBe(true)
    expect(hasNonZeroPadding('margin: 8px;')).toBe(false)
  })
})
