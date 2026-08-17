// 응원화면 «확정 사양 ↔ 구현» 대조 — `docs/DISPLAY-SPEC.md` 를 잠금으로 만드는 자리.
//
// ★왜 필요한가: 유저 확정 사양 「좌우 2단」이 내 인박스에 안 와서 세로 1단으로 배포했고,
//   하루 뒤 유저가 적발했다. 더 아픈 건 그다음 실측이다 — 그 사양은 **내가 볼 수 있는 어떤 채널에도
//   없었다**(to-orch·to-conductor 전문 검색 0건). ⇒ 수신자 술어로는 **원리적으로** 못 잡는 종류였다.
//   그래서 처방을 도구에서 «자리»로 바꿨다: 확정 사양은 DISPLAY-SPEC.md 에 착지하고,
//   **이 시험이 그 문서와 구현이 갈라지는 순간 red 로 만든다.**
//   ⇒ 문서만 고치면 red · 구현만 고쳐도 red. 둘이 «같은 커밋에서» 움직이게 강제한다.
//
// ★값이 아니라 «사양»을 잰다: 픽셀 하나 바뀌었다고 깨지면 아무도 안 고치고 시험을 지운다.
//   그래서 범위(≥/≤)와 «존재»로 잰다 — 사양서가 「~92px」처럼 근사로 적힌 것과 같은 눈금이다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('./display.css', import.meta.url)), 'utf8')
const jsx = readFileSync(fileURLToPath(new URL('./DisplayView.jsx', import.meta.url)), 'utf8')

/** CSS 선언에서 숫자 하나 뽑기 — 없으면 null(있다고 착각하지 않게). */
const num = (selector, prop) => {
  const rule = css.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`))
  if (!rule) return null
  const m = rule[0].match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([\\d.]+)`))
  return m ? parseFloat(m[1]) : null
}

describe('응원화면 확정 사양 ↔ 구현 (docs/DISPLAY-SPEC.md)', () => {
  it('★좌우 2단 — 좌 로고 단 / 우 내용 단이 «둘 다» 있다', () => {
    expect(css).toMatch(/\.dp-col-logo\s*\{/)
    expect(css).toMatch(/\.dp-col-body\s*\{/)
    // 완료 화면과 대기 화면 «양쪽»에 두 단이 다 쓰였는지 — 한쪽만 고치는 게 이 사양의 실제 실패 형태였다
    expect(jsx.match(/dp-col-logo/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(jsx.match(/dp-col-body/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('글씨 크기 — 이름 ~92px · 수치 ~54px · 멘트 ~33px(실기기 확대 요건)', () => {
    expect(num('.dp-name', 'font-size')).toBeGreaterThanOrEqual(80)
    expect(num('.dp-count', 'font-size')).toBeGreaterThanOrEqual(48)
    expect(num('.dp-msg', 'font-size')).toBeGreaterThanOrEqual(30)
  })

  it('★모션 규범 — 콘페티 1.2~2.0s·1회 · 물결 12s · 로고 정지', () => {
    const drop = css.match(/animation:\s*dp-drop\s*([\d.]+)s[^;]*/)
    expect(drop, '콘페티 animation 선언이 없다').not.toBeNull()
    expect(parseFloat(drop[1])).toBeGreaterThanOrEqual(1.2)
    expect(parseFloat(drop[1])).toBeLessThanOrEqual(2.0)
    expect(drop[0], '콘페티가 1회가 아니다(infinite 면 배경 소음이 된다)').not.toMatch(/infinite/)
    expect(css).toMatch(/animation:\s*dp-flow\s*12s/)
    // 로고 정지 = 로고 규칙에 animation 이 «없어야» 한다
    const logo = css.match(/\.dp-logo\s+img\s*\{[^}]*\}/)
    expect(logo?.[0] ?? '').not.toMatch(/animation/)
  })

  it('★슬라이드 인·순차 등장 금지 — 페이드는 컨테이너 «하나»에만', () => {
    expect(css).not.toMatch(/translateX|slideIn|slide-in/i)
    // 자식마다 delay 를 주면 그게 순차 등장이다. 콘페티(장식)만 예외.
    const delays = [...css.matchAll(/animation-delay/g)]
    expect(delays.length, '등장에 animation-delay 를 쓰면 순차 등장이 된다').toBeLessThanOrEqual(1)
  })

  it('★터치 잠금 — CSS 와 JS 양쪽(CSS 만으로는 iOS12 핀치를 못 막는다)', () => {
    expect(css).toMatch(/touch-action:\s*none/)
    expect(css).toMatch(/user-select:\s*none/)
    expect(jsx).toMatch(/gesturestart/)          // 웹킷 전용 — 핀치
    expect(jsx).toMatch(/passive:\s*false/)      // 없으면 preventDefault 가 «무시»된다
    expect(jsx).toMatch(/popstate/)              // 뒤로가기
  })

  it('★null 두 갈래 — 연차는 «줄 생략», 혜택은 «-»(0 을 찍지 않는다)', () => {
    expect(jsx).toMatch(/hasYears/)              // 연차 3필드 null → 줄 자체를 안 그린다
    expect(jsx).toMatch(/rewards_available == null/)
    expect(jsx).toMatch(/months_with_us \+ 1/)   // 「N개월째」는 +1
  })

  it('★iOS12 — 부팅 경로에 Promise.allSettled 가 없다(검은 화면의 실범인)', () => {
    expect(jsx).not.toMatch(/Promise\.allSettled/)
  })
})
