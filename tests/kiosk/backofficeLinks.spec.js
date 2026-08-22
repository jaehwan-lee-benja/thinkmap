// 백오피스 런처 — «목록이 한 곳인가»와 «손님이 열면 무엇을 알게 되나»를 여기서 잰다.
//
// ★이 시험이 지키려는 명제 둘:
//   ⑴목록 정본이 하나다 — 런처와 「홈으로」가 같은 파일을 본다(두 벌이 되면 한쪽만 낡는다).
//   ⑵★런처는 «값»을 담지 않는다 — `?role=` 은 쿼리이지 인증이 아니라 주소를 알면 열린다.
//     그래서 목록의 문면에 회원·매출·토큰 같은 값이 들어가면 그 자체가 유출이다.
import { describe, it, expect } from 'vitest'
import { BACKOFFICE_LINKS, HOME_HREF } from '../../apps/membership/src/components/Kiosk/backofficeLinks.js'

describe('링크 정본', () => {
  it('역할이 중복되지 않는다', () => {
    const roles = BACKOFFICE_LINKS.map((l) => l.role)
    expect(new Set(roles).size).toBe(roles.length)
  })
  it('모든 항목이 이름·설명·주소를 갖는다', () => {
    for (const l of BACKOFFICE_LINKS) {
      expect(l.name, `${l.role} 이름`).toBeTruthy()
      expect(l.desc, `${l.role} 설명`).toBeTruthy()
      expect(l.href, `${l.role} 주소`).toContain(`?role=${l.role}`)
    }
  })
  it('★손님 화면(customer·ticket)은 목록에 없다 — 여기는 직원 동선이다', () => {
    const roles = BACKOFFICE_LINKS.map((l) => l.role)
    expect(roles).not.toContain('customer')
    expect(roles).not.toContain('ticket')
  })
  it('홈 주소가 목록 항목과 겹치지 않는다(홈은 목적지지 항목이 아니다)', () => {
    expect(BACKOFFICE_LINKS.some((l) => l.href === HOME_HREF)).toBe(false)
    expect(HOME_HREF).toContain('?role=home')
  })
})

describe('★손님이 열면 무엇을 알게 되나 — 문면에 «값»이 없다', () => {
  // 대조축: 아래 술어가 실제로 무언가를 잡는지 더미로 확인한다(0 만 나오는 시험은 시험이 아니다).
  const LEAKY = [/\d{3}-\d{3,4}-\d{4}/, /\d{6,}/, /원\b/, /매출/, /회원\s*\d/]
  it('술어가 살아 있다(더미를 잡는다)', () => {
    expect(LEAKY.some((re) => re.test('010-1234-5678'))).toBe(true)
    expect(LEAKY.some((re) => re.test('오늘 매출 120000원'))).toBe(true)
  })
  it('실제 문면에는 하나도 안 걸린다', () => {
    for (const l of BACKOFFICE_LINKS) {
      const text = `${l.name} ${l.desc}`
      for (const re of LEAKY) expect(re.test(text), `«${text}» 가 ${re} 에 걸린다`).toBe(false)
    }
  })
})
