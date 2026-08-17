// seatLoadState — ★「읽기 실패가 『주문 없음』으로 착지하지 않는다」를 시험으로 못 박는다.
//
// 이 시험의 성질(교본 «가드 도입 커밋엔 변이 시험 필수»): 세 상태가 **서로 다른 문구**를 내는지까지 본다.
//   상태가 갈리는지만 보면, 나중에 문구를 하나로 합쳐도 초록불이 유지된다 — 그러면 결함이 되돌아온다.
//   결함의 정의 자체가 「세 사실이 같은 화면으로 착지한다」였으므로, 시험도 **문구가 갈리는지**를 봐야 한다.
import { describe, it, expect } from 'vitest'
import { dataLoadState, emptyText } from './seatLoadState'

const READY = '주문이 없습니다.'

describe('dataLoadState — 빈 화면의 근거는 length 가 아니라 «읽기 성공»이다', () => {
  it('읽기 실패 = failed (★이 한 줄이 단일점 ② 그 자체다)', () => {
    expect(dataLoadState({ live: true, errors: [new Error('boom')], loadedAt: null })).toBe('failed')
  })

  it('★성공한 적이 있어도, 그 뒤 실패하면 failed 다 — 낡은 화면을 「최신」으로 착지시키지 않는다', () => {
    expect(dataLoadState({ live: true, errors: [new Error('boom')], loadedAt: 1723000000000 })).toBe('failed')
  })

  it('주문·스테이션 중 **하나만** 실패해도 failed — 부분 성공은 정상이 아니다(한 화면이다)', () => {
    expect(dataLoadState({ live: true, errors: [null, new Error('x')], loadedAt: 1 })).toBe('failed')
    expect(dataLoadState({ live: true, errors: [new Error('x'), null], loadedAt: 1 })).toBe('failed')
  })

  it('아직 한 번도 성공 못 했으면 loading — 「없다」고 말할 근거가 없다', () => {
    expect(dataLoadState({ live: true, errors: [], loadedAt: null })).toBe('loading')
  })

  it('성공했고 실패 없음 = ready — 이때만 「없습니다」라고 말할 수 있다', () => {
    expect(dataLoadState({ live: true, errors: [null, null], loadedAt: 1723000000000 })).toBe('ready')
  })

  it('프리뷰·정적 데모(live=false)는 네트워크가 없다 → 항상 ready', () => {
    // 실패할 읽기가 없는데 「불러오지 못했습니다」를 띄우면 그게 오탐이다. 오탐은 가드를 죽인다.
    expect(dataLoadState({ live: false, errors: [new Error('무시돼야 한다')], loadedAt: null })).toBe('ready')
  })

  it('인자를 덜 줘도 터지지 않는다(호출부가 하나를 빠뜨려도 «성공»으로 착지하진 않는다)', () => {
    expect(dataLoadState({ live: true })).toBe('loading')
  })
})

describe('emptyText — ★세 상태는 서로 다른 문구여야 한다(같아지면 결함이 되돌아온다)', () => {
  const three = ['ready', 'loading', 'failed'].map((s) => emptyText(s, READY))

  it('셋이 전부 다르다', () => {
    expect(new Set(three).size).toBe(3)
  })

  it('failed 는 「없다」고 말하지 않고, 그게 「없음」이 아님을 **명시**한다', () => {
    const t = emptyText('failed', READY)
    expect(t).not.toBe(READY)
    expect(t).toMatch(/불러오지 못했/)
    expect(t).toMatch(/없음.*아닙니다|아닙니다/) // 직원이 「없구나」로 읽고 지나가는 것을 막는 문장
  })

  it('loading 도 「없다」고 말하지 않는다 — 첫 로드 전 한 프레임이 「주문 없음」이면 안 된다', () => {
    expect(emptyText('loading', READY)).not.toBe(READY)
  })

  it('ready 는 호출부가 준 문구를 **그대로** 쓴다 — 자리마다 다른 안내를 이 함수가 삼키지 않는다', () => {
    expect(emptyText('ready', READY)).toBe(READY)
    expect(emptyText('ready', '— 올림 없음 —')).toBe('— 올림 없음 —')
  })

  it('모르는 상태값은 ready 로 떨어진다 — 다만 그건 **문구 기본값**일 뿐이고, 실패 판정은 dataLoadState 몫이다', () => {
    // 이 관대함이 안전한 이유: failed 를 만드는 유일한 입력은 errors 이고, 그건 위 describe 가 지킨다.
    expect(emptyText(undefined, READY)).toBe(READY)
  })
})
