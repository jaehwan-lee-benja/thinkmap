// 영수증 ESC/POS 바이트 계약 — 정본 명세 docs/RECEIPT-PRINT-SPEC.md §3·§9 의 자동 검증.
//
// 왜 여기 있나: 컷 문제가 네 번 재발했고, 그때마다 «바이트를 다시 떠서» 축을 갈랐다.
//   그 대조를 손으로 하면 다음 사람은 안 한다 ⇒ 계약을 테스트로 못박는다.
// node 환경(document 없음) = 텍스트 폴백 경로. 컷 계약은 래스터 여부와 무관하다.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEMPLATE, TEMPLATE_VERSION, buildEscpos,
  diffFromDefault, mergeWithDefault, templateOverrides,
} from '../../apps/membership/src/receipt/receiptTemplate.js'
import { normalizeConfig, DEFAULT_CONFIG, CUT_MODES } from '../../apps/membership/src/receipt/printerConfig.js'

const DATA = { name: '홍*동', date: '2026-08-09 14:30', token: 'SR7K2M9QX4T2', stamp: '3/10' }
const clone = (o) => JSON.parse(JSON.stringify(o))
const hex = (a) => Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join(' ')

/** 스트림 안의 컷 명령 등장 횟수 — GS V 66 n / GS V 0 / GS V 1 전부 센다. */
function countCuts(b) {
  let n = 0
  for (let i = 0; i + 2 < b.length; i++) {
    if (b[i] !== 0x1d || b[i + 1] !== 0x56) continue
    if (b[i + 2] === 66 || b[i + 2] === 0x41) { n++; i += 3 } else if (b[i + 2] === 0 || b[i + 2] === 1) { n++; i += 2 }
  }
  return n
}
/** 마지막 컷 명령 뒤에 남은 바이트 수(-1 = 컷 없음). */
function tailAfterCut(b) {
  for (let i = b.length - 1; i >= 1; i--) {
    if (b[i - 1] === 0x1d && b[i] === 0x56) {
      const argLen = (b[i + 1] === 66 || b[i + 1] === 0x41) ? 2 : 1
      return b.length - (i + 1 + argLen)
    }
  }
  return -1
}

describe('컷 방언 — 정확한 바이트 · 1회 · 뒤에 0바이트 (SPEC §3.3)', () => {
  for (const [cut, want] of [['feed', '1d 56 42 00'], ['full', '1d 56 00'], ['partial', '1d 56 01']]) {
    it(`cut=${cut} → ${want}`, () => {
      const b = buildEscpos(DEFAULT_TEMPLATE, DATA, { cut })
      expect(hex(b.slice(-want.split(' ').length))).toBe(want)
      expect(countCuts(b), '컷은 정확히 1회').toBe(1)
      expect(tailAfterCut(b), '컷 뒤에 바이트가 남으면 그게 빈 조각이 된다').toBe(0)
    })
  }

  it("cut=none 이면 컷 바이트가 전무하다 — 불변 조항이 «선언»을 덮지 않는다 (SPEC §3.4)", () => {
    const b = buildEscpos(DEFAULT_TEMPLATE, DATA, { cut: 'none' })
    expect(countCuts(b)).toBe(0)
    expect(hex(b), 'GS V 자체가 스트림에 없어야 한다').not.toContain('1d 56')
  })
})

describe('컷 불변 조항 — 있어야 하는 것은 구조가 보장한다 (SPEC §3.4)', () => {
  const noCut = () => {
    const t = clone(DEFAULT_TEMPLATE)
    t.blocks = t.blocks.filter((x) => x.type !== 'cut')
    return t
  }
  it('cut 블록이 없어도 feed 는 컷 1회', () => {
    expect(countCuts(buildEscpos(noCut(), DATA, { cut: 'feed' }))).toBe(1)
  })
  it('cut 블록이 없고 none 이면 컷 0회', () => {
    expect(countCuts(buildEscpos(noCut(), DATA, { cut: 'none' }))).toBe(0)
  })
  it('cut 블록이 2개면 컷도 2회(템플릿이 그렇게 말한 것 — 관측 계약)', () => {
    const t = clone(DEFAULT_TEMPLATE)
    t.blocks.push({ type: 'cut', on: true, align: 'left' })
    expect(countCuts(buildEscpos(t, DATA, { cut: 'feed' }))).toBe(2)
  })
})

describe('컷 바이트 누출 — 글자 수가 방언을 특정한다 (SPEC §3.3.1)', () => {
  // 0x56 = 'V'. 프린터가 방언을 모르면 GS 를 무시하고 인자를 문자로 흘려 찍는다.
  const leak = (bytes) => {
    for (let i = bytes.length - 1; i >= 0; i--) {
      if (bytes[i] !== 0x1d) continue
      let s = ''
      for (let j = i + 1; j < bytes.length && bytes[j] >= 0x20 && bytes[j] <= 0x7e; j++) s += String.fromCharCode(bytes[j])
      return s
    }
    return null
  }
  it('feed → VB 두 글자', () => expect(leak(buildEscpos(DEFAULT_TEMPLATE, DATA, { cut: 'feed' }))).toBe('VB'))
  it('full → V 한 글자', () => expect(leak(buildEscpos(DEFAULT_TEMPLATE, DATA, { cut: 'full' }))).toBe('V'))
  it('partial → V 한 글자', () => expect(leak(buildEscpos(DEFAULT_TEMPLATE, DATA, { cut: 'partial' }))).toBe('V'))
  it('none → 마지막 GS 누출이 컷이 아니다(스트림 끝에 GS V 가 없다)', () => {
    expect(leak(buildEscpos(DEFAULT_TEMPLATE, DATA, { cut: 'none' }))).not.toBe('V')
  })
})

describe('옛 저장본 호환 — tpl.cutMode 존중, cfg 우선', () => {
  const withCutMode = (m) => { const t = clone(DEFAULT_TEMPLATE); t.cutMode = m; return t }
  it('cfg 가 없으면 옛 tpl.cutMode 를 쓴다', () => {
    expect(hex(buildEscpos(withCutMode('full'), DATA).slice(-3))).toBe('1d 56 00')
  })
  it('cfg 가 옛 cutMode 를 이긴다', () => {
    expect(hex(buildEscpos(withCutMode('full'), DATA, { cut: 'partial' }).slice(-3))).toBe('1d 56 01')
  })
})

describe('저장 = 명시 오버라이드만 (SPEC §4.1)', () => {
  it('기본값 그대로면 version 만 저장된다', () => {
    expect(Object.keys(diffFromDefault(clone(DEFAULT_TEMPLATE)))).toEqual(['version'])
  })
  it('width 만 바꾸면 blocks 는 저장되지 않는다', () => {
    const t = clone(DEFAULT_TEMPLATE); t.width = 58
    const d = diffFromDefault(t)
    expect(d.width).toBe(58)
    expect(d.blocks).toBeUndefined()
    expect(templateOverrides(d)).toEqual(['width'])
  })
  it('★병합 시 blocks 는 코드 기본값을 쓴다 — 코드 개선이 저장본 있는 기기로 흘러든다', () => {
    const t = clone(DEFAULT_TEMPLATE); t.width = 58
    const merged = mergeWithDefault(diffFromDefault(t))
    expect(merged.blocks).toEqual(DEFAULT_TEMPLATE.blocks)
    expect(merged.width).toBe(58)
  })
  it('옛 v2 통째 저장본은 내용을 존중하고 버전을 올리며 cut 블록을 주입한다', () => {
    const v2 = clone(DEFAULT_TEMPLATE)
    v2.version = 2
    v2.blocks = v2.blocks.filter((x) => x.type !== 'cut')
    v2.blocks[1].text = '현장 수정본'
    const m = mergeWithDefault(v2)
    expect(m.blocks[1].text).toBe('현장 수정본')
    expect(m.blocks.some((x) => x.type === 'cut')).toBe(true)
    expect(m.version).toBe(TEMPLATE_VERSION)
  })
})

describe('프린터 설정 정규화 (SPEC §4.2)', () => {
  it('모르는 값은 조용히 기본값으로 떨어진다', () => {
    expect(normalizeConfig({ cut: 'zzz' }).cut).toBe(DEFAULT_CONFIG.cut)
    expect(normalizeConfig({ scheme: 'x' }).scheme).toBe(DEFAULT_CONFIG.scheme)
  })
  it('none 은 허용되는 컷 방언이다', () => {
    expect(CUT_MODES).toContain('none')
    expect(normalizeConfig({ cut: 'none' }).cut).toBe('none')
  })
})
