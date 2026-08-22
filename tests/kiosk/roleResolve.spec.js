// 홈 바로가기 «역할 유실» — 이 수정의 참양성을 여기서 잰다.
//
// 지키려는 명제 둘:
//   ⑴**바로가기(standalone)로 열면 마지막 역할이 살아난다** — iOS 가 매니페스트 `start_url`("./")
//     을 저장해 쿼리를 버리기 때문에, 그게 없으면 직원 기기가 매번 고객 화면으로 뜬다.
//   ⑵★**브라우저 탭에서는 절대 되살리지 않는다** — 고객 키오스크가 «예전에 직원으로 열렸다»는
//     이유로 고객 화면을 못 여는 사고가 더 나쁘다. 되살림은 «바로가기»라는 좁은 문에서만.
import { describe, it, expect } from 'vitest'
import { pickRole } from '../../apps/membership/src/components/Kiosk/kioskUtils.js'

describe('URL 이 말하면 URL 이 이긴다', () => {
  for (const r of ['staff', 'editor', 'scan', 'printer', 'ticket', 'customer']) {
    it(`?role=${r} → ${r}(저장값이 달라도)`, () => {
      expect(pickRole(`?role=${r}`, 'printer', true)).toEqual({ role: r, source: 'url' })
    })
  }
  it('모르는 값은 «고객»으로 떨어진다(안전 기본값)', () => {
    expect(pickRole('?role=admin', 'staff', true).role).toBe('customer')
  })
})

describe('★바로가기에서만 되살린다 — 이 수정의 참양성', () => {
  it('standalone + 저장된 staff → staff(현장 증상이 사라지는 지점)', () => {
    expect(pickRole('', 'staff', true)).toEqual({ role: 'staff', source: 'remembered' })
  })
  it('★브라우저 탭(standalone=false)에서는 되살리지 않는다', () => {
    expect(pickRole('', 'staff', false)).toEqual({ role: 'customer', source: 'default' })
  })
  it('저장값이 없으면 고객', () => {
    expect(pickRole('', null, true).role).toBe('customer')
  })
  it('★ticket 은 되살리지 않는다(남의 폰에 역할이 눌러앉으면 안 된다)', () => {
    expect(pickRole('', 'ticket', true).role).toBe('customer')
  })
  it('customer 는 저장 대상이 아니다 — 되살려도 결과가 같아야 한다', () => {
    expect(pickRole('', 'customer', true).role).toBe('customer')
  })
})

describe('전건이 비었을 때 그걸 말하는가 — 술어의 반대편', () => {
  it('쿼리가 다른 키만 있으면 역할 없음으로 본다', () => {
    expect(pickRole('?store=default', 'scan', true)).toEqual({ role: 'scan', source: 'remembered' })
    expect(pickRole('?store=default', null, true).role).toBe('customer')
  })
  it('source 가 세 값 중 하나로만 온다(판정 경로를 숨기지 않는다)', () => {
    const seen = new Set([
      pickRole('?role=staff', null, false).source,
      pickRole('', 'staff', true).source,
      pickRole('', null, false).source,
    ])
    expect([...seen].sort()).toEqual(['default', 'remembered', 'url'])
  })
})
