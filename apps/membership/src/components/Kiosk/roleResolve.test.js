// «기기 고정 역할» 판정 시험 — `resolveRole` (2026-08-18 현장 실측에서 도입).
//
// ★무엇을 잠그나: 회원님 실측 — **홈 아이콘을 닫았다 다시 열어도 키오스크 화면 그대로**.
//   iOS 홈화면 웹앱이 «시작 주소»가 아니라 **마지막 상태**를 복원하기 때문이고, 한 번이라도
//   `?role=` 없는 주소에 착지하면 그 기기는 영영 거기서 시작한다. 그 눌러붙음을 푸는 장치다.
//
// ★이 시험이 지키는 «두 방향»(어느 하나만 지키면 다른 쪽이 사고다):
//   ⑴ 전용 기기(홈 아이콘)에서는 주소가 없어도 역할이 **남아야** 한다.
//   ⑵ 일반 브라우저에서는 **절대 안 남아야** 한다 — 회원님이 폰으로 한 번 열어 본 것이 눌러붙으면
//      그건 고침이 아니라 새 결함이다.
import { describe, it, expect } from 'vitest'
import { resolveRole } from './kioskUtils'

describe('역할 판정 — 주소 · 기기 고정 · standalone', () => {
  it('주소가 역할을 말하면 «항상» 그게 이긴다(고정값이 주소를 덮으면 손으로 못 고친다)', () => {
    expect(resolveRole('display', 'staff', true).role).toBe('display')
    expect(resolveRole('staff', 'display', false).role).toBe('staff')
  })

  it('★홈 아이콘(standalone) 실행이면 역할을 기기에 고정한다', () => {
    expect(resolveRole('display', null, true).pin).toBe('display')
    expect(resolveRole('staff', null, true).pin).toBe('staff')
  })

  it('★★일반 브라우저에서는 고정하지 않는다 — 한 번 열어 본 것이 눌러붙으면 안 된다', () => {
    expect(resolveRole('display', null, false).pin).toBe(null)
    // 그리고 브라우저에서는 고정값이 있어도 «쓰지» 않는다
    expect(resolveRole(null, 'display', false).role).toBe('customer')
  })

  it('★주소에 role 이 없어도 홈 아이콘이면 고정된 역할로 복원한다(이게 ⑸ 시나리오다)', () => {
    expect(resolveRole(null, 'display', true).role).toBe('display')
    expect(resolveRole(null, 'display', true).pin).toBe(null)   // 이미 고정돼 있으니 다시 안 쓴다
  })

  it('★`?role=customer` 는 «명시적 해제»다 — 되돌릴 수 없는 고정은 고정이 아니라 고장이다', () => {
    const r = resolveRole('customer', 'display', true)
    expect(r.role).toBe('customer')
    expect(r.pin).toBe('')          // '' = 고정 지우기
  })

  it('모르는 역할·깨진 고정값은 조용히 기본값으로(엉뚱한 화면을 띄우지 않는다)', () => {
    expect(resolveRole('nope', null, true).role).toBe('customer')
    expect(resolveRole(null, 'nope', true).role).toBe('customer')
    expect(resolveRole(null, null, true).role).toBe('customer')
    expect(resolveRole(null, null, true).pin).toBe(null)
  })
})
