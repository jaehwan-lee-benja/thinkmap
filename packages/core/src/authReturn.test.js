// 로그인 왕복의 «원래 주소 복원» 회귀 시험.
//
// ★왜 시험이 필요한가: 이 로직은 실패해도 화면이 안 깨진다 — 그냥 «엉뚱한 화면에 착지»할 뿐이다.
//   그리고 그 착지가 하필 직원 화면이면 손님 앞 태블릿에 내부 화면이 뜬다. 조용한 실패라 못을 박는다.
//   특히 두 가지가 위험하다:
//     ⑴ 무한 루프 — 복원 대상과 현재가 같은데도 이동하면 페이지가 영원히 리로드된다
//     ⑵ 무고한 앱 오염 — 쿼리를 안 쓰는 위성 8개와 모선이 이 코드를 «공유»한다
import { describe, it, expect } from 'vitest'
import { computeReturnSearch } from './useAuth.js'

describe('로그인 왕복 후 복원 대상 계산', () => {
  it('★쿼리를 안 쓰던 앱은 아무 일도 안 일어난다(공유 코드라 이게 제일 중요)', () => {
    expect(computeReturnSearch('', null)).toBe(null)
    expect(computeReturnSearch('', '')).toBe(null)
    expect(computeReturnSearch('?code=abc', null)).toBe(null)
  })

  it('★role 이 있던 주소로 되돌아간다 — OAuth 가 붙인 ?code 를 밀어내고', () => {
    expect(computeReturnSearch('?code=abc123', '?role=display')).toBe('?role=display')
    expect(computeReturnSearch('', '?role=display')).toBe('?role=display')
  })

  it('★이미 제자리면 이동하지 않는다(이게 없으면 무한 리로드)', () => {
    expect(computeReturnSearch('?role=display', '?role=display')).toBe(null)
  })

  it('여러 파라미터도 통째로 보존한다', () => {
    const q = '?role=display&store=saruru&state=done'
    expect(computeReturnSearch('?code=x', q)).toBe(q)
  })
})

// ★신형 저장 형태(localStorage + TTL) — 2026-08-18 현장 재현에서 도입.
//   sessionStorage 는 «탭 단위»라 iOS 홈화면 웹앱의 로그인 왕복이 다른 컨텍스트로 착지하면
//   스태시가 원리적으로 안 보인다. 오리진 단위로 올리는 대신 «탭 수명»이 해 주던 만료를 TTL 로 대신한다.
describe('신형 스태시(JSON + TTL)', () => {
  const T0 = 1_700_000_000_000
  const wrap = (s, t = T0) => JSON.stringify({ s, t })

  it('★TTL 안이면 복원한다', () => {
    expect(computeReturnSearch('?code=x', wrap('?role=display'), T0 + 60_000)).toBe('?role=display')
  })

  it('★TTL 을 넘긴 스태시는 «없는 것»으로 친다 — 어제 것이 오늘 로그인을 납치하지 않게', () => {
    expect(computeReturnSearch('?code=x', wrap('?role=display'), T0 + 11 * 60_000)).toBe(null)
    // 경계 바로 안쪽은 살아 있어야 한다(경계를 «닫힌 쪽»으로 재는지 확인 — 판별력)
    expect(computeReturnSearch('?code=x', wrap('?role=display'), T0 + 10 * 60_000)).toBe('?role=display')
  })

  it('★구형 문자열도 그대로 읽는다 — 배포 경계를 넘는 왕복이 하나 떠 있다', () => {
    expect(computeReturnSearch('?code=x', '?role=staff', T0)).toBe('?role=staff')
  })

  it('★깨진 값·남의 값은 «아무 일도 안 한다»(엉뚱한 데로 보내느니 no-op)', () => {
    expect(computeReturnSearch('?code=x', '{not json', T0)).toBe(null)
    expect(computeReturnSearch('?code=x', '{"other":1}', T0)).toBe(null)
    expect(computeReturnSearch('?code=x', wrap(''), T0)).toBe(null)
  })

  it('신형에서도 «이미 제자리»면 이동하지 않는다(무한 리로드 차단)', () => {
    expect(computeReturnSearch('?role=display', wrap('?role=display'), T0)).toBe(null)
  })
})
