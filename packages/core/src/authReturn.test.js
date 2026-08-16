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
