// 로그인 복귀 주소 — 절대 base 회귀 시험.
//
// ★왜: 키오스크가 자산을 Storage 에서 받으려 base 를 «절대 URL» 로 굽는다. 그때 옛 식
//   `origin + BASE_URL` 은 두 URL 을 이어붙여 기형 주소를 만들고 **구글 복귀가 깨진다**
//   (유저 3기기 동일 재현 = 결정적 결함). 조용히 깨지는 축이라 못을 박는다.
// ★자체시험이 «본 경로와 같은 코드»를 친다 — useAuth 가 이 함수를 실제로 호출한다.
import { describe, it, expect } from 'vitest'
import { computeRedirectUrl } from './useAuth.js'

describe('로그인 복귀 주소 계산', () => {
  it('★절대 base = 자산 위치다 — 문서 위치(pathname)로 돌아온다', () => {
    expect(computeRedirectUrl('https://host', 'https://sqisnt.supabase.co/functions/v1/kiosk/', '/functions/v1/kiosk'))
      .toBe('https://host/functions/v1/kiosk')
  })
  it('★상대 base 는 «한 바이트도» 안 달라진다(기존 위성 전부)', () => {
    expect(computeRedirectUrl('https://x.github.io', '/thinkmap/membership/', '/thinkmap/membership/'))
      .toBe('https://x.github.io/thinkmap/membership/')
    expect(computeRedirectUrl('https://x.github.io', '/thinkmap/', '/thinkmap/')).toBe('https://x.github.io/thinkmap/')
  })
  it('프로토콜 상대(//host/…)도 절대로 본다', () => {
    expect(computeRedirectUrl('https://host', '//cdn.example/kiosk/', '/p')).toBe('https://host/p')
  })
})
