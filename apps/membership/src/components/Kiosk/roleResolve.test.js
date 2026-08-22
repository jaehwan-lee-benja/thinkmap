// 역할 판정 시험 — `pickRole` (2026-08-22 `b1d8f75` cherry-pick 후 갱신).
//
// ★이 파일은 08-18 판(`resolveRole`)을 대체한다. 갈아탄 이유를 남긴다:
//   내 08-18 판은 «저장»도 standalone 일 때만 했다. 그런데 iOS 는 «홈 화면에 추가» 시
//   매니페스트 `start_url:"./"` 를 저장해 **쿼리를 통째로 버린다** ⇒ standalone 실행은
//   `?role=` 을 «영영 못 본다» ⇒ ★**내 저장 조건은 원리적으로 만족될 수 없었다.**
//   (그 축은 08-18 보고에 「내가 못 잰 축 ㉠」으로 적어 뒀고, 이번에 값이 나왔다 — 안 보존한다.)
//   ⇒ 교정: **저장은 URL 이 역할을 말할 때 «항상»**(사파리 방문에서 걸린다) ·
//      **복원은 standalone 일 때만**(브라우저 탭에 눌러붙지 않는다). 조건을 «옮긴» 것이다.
//
// ★여기서만 잠그는 축 = **`display`**. 원본 커밋은 응원화면 «이전» 트리에서 왔고 ROLES 에
//   display 가 없었다 — 그대로 가져왔으면 `?role=display` 가 «모르는 값»이 돼
//   **손님 앞 화면이 고객 키오스크로 떨어졌다.**
import { describe, it, expect } from 'vitest'
import { pickRole, ROLES } from './kioskUtils'

describe('역할 판정 — URL · 기억 · standalone', () => {
  it('URL 이 역할을 말하면 항상 그게 이긴다(기억이 URL 을 덮으면 손으로 못 고친다)', () => {
    expect(pickRole('?role=staff', 'display', true)).toEqual({ role: 'staff', source: 'url' })
    expect(pickRole('?role=display', 'staff', false)).toEqual({ role: 'display', source: 'url' })
  })

  it('★★display 가 «모르는 값»이 되지 않는다 — 이게 깨지면 손님 앞 화면이 고객 키오스크가 된다', () => {
    expect(ROLES).toContain('display')
    expect(pickRole('?role=display', null, false).source).toBe('url')      // url-unknown 이면 실패
    expect(pickRole('?role=display', null, false).role).toBe('display')
  })

  it('★홈 바로가기(standalone)면 쿼리가 없어도 기억한 역할로 복원한다 — 이게 현장 #2 다', () => {
    expect(pickRole('', 'staff', true)).toEqual({ role: 'staff', source: 'remembered' })
    expect(pickRole('', 'display', true)).toEqual({ role: 'display', source: 'remembered' })
  })

  it('★★브라우저 탭에서는 «절대» 복원하지 않는다 — 고객이 직원 화면을 보면 그게 더 나쁜 사고다', () => {
    expect(pickRole('', 'staff', false)).toEqual({ role: 'customer', source: 'default' })
    expect(pickRole('', 'display', false).role).toBe('customer')
  })

  it('ticket(손님 폰)은 고정 대상이 아니다 — 남의 기기에 역할이 눌러앉으면 안 된다', () => {
    expect(pickRole('', 'ticket', true)).toEqual({ role: 'customer', source: 'default' })
  })

  it('모르는 역할은 조용히 고객으로(안전 기본값) · 기억이 없어도 고객', () => {
    expect(pickRole('?role=nope', null, true)).toEqual({ role: 'customer', source: 'url-unknown' })
    expect(pickRole('', null, true)).toEqual({ role: 'customer', source: 'default' })
  })
})
