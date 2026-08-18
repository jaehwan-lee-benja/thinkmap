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

// ★주석을 지운 사본 — «부재»를 재는 술어는 반드시 이쪽을 봐야 한다.
//   근거(2026-08-18 실측, 이 커밋에서 바로 당했다): 물결을 지우고 그 자리에 「여기 있던 `.dp-waves` 를
//   지웠다」는 **주석을 남겼더니** 「dp-waves 가 없다」 시험이 **내 주석을 잡아 red** 가 됐다.
//   ⇒ 감사기가 자기 설명문을 대조군으로 센다. 「있음」은 주석이 있어도 참이지만 **「없음」은 아니다.**
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '')
const jsxCode = jsx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/** CSS 선언에서 숫자 하나 뽑기 — 없으면 null(있다고 착각하지 않게). */
const num = (selector, prop) => {
  const rule = css.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`))
  if (!rule) return null
  const m = rule[0].match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([\\d.]+)`))
  return m ? parseFloat(m[1]) : null
}

describe('응원화면 확정 사양 ↔ 구현 (docs/DISPLAY-SPEC.md)', () => {
  it('★상하 2단(세로 확정) — 상 로고 단 / 하 내용 단이 «둘 다» 있다', () => {
    expect(css).toMatch(/\.dp-col-logo\s*\{/)
    expect(css).toMatch(/\.dp-col-body\s*\{/)
    // 완료 화면과 대기 화면 «양쪽»에 두 단이 다 쓰였는지 — 한쪽만 고치는 게 이 사양의 실제 실패 형태였다
    expect(jsx.match(/dp-col-logo/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(jsx.match(/dp-col-body/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('★«가로»로 되돌아가지 않는다 — 상하 배치가 구조로 고정(2026-08-18 세로 확정)', () => {
    // 종전 좌우 2단의 실물은 «.dp-screen 이 flex + .dp-col-logo 가 폭 고정»이었다.
    // 그 둘이 다시 나타나면 화면은 조용히 가로로 돌아간다 — 눈으로는 «비슷해» 보인다.
    const screen = css.match(/\.dp-screen\s*\{[^}]*\}/)?.[0] ?? ''
    expect(screen, '.dp-screen 규칙이 없다').not.toBe('')
    expect(screen, '.dp-screen 이 가로 flex 로 돌아갔다').not.toMatch(/display:\s*(-webkit-)?(box|flex)/)
    const colLogo = css.match(/\.dp-col-logo\s*\{[^}]*\}/)?.[0] ?? ''
    expect(colLogo, '로고 단이 «폭»을 잡으면 좌우 2단이다').not.toMatch(/flex:\s*0\s+0/)
    // 배치를 조건부로 되돌리는 미디어 쿼리도 금지 — 현장에서 «어느 화면이 맞나»가 흔들린다.
    expect(cssCode, '미디어 쿼리로 배치를 되돌리고 있다').not.toMatch(/@media[^{]*\{[^@]*\.dp-screen\s*\{[^}]*display:\s*(-webkit-)?(box|flex)/)
  })

  it('글씨 크기 — 이름 ~92px · 수치 ~54px · 멘트 ~33px(실기기 확대 요건)', () => {
    expect(num('.dp-name', 'font-size')).toBeGreaterThanOrEqual(80)
    expect(num('.dp-count', 'font-size')).toBeGreaterThanOrEqual(48)
    expect(num('.dp-msg', 'font-size')).toBeGreaterThanOrEqual(30)
  })

  it('★모션 규범 — 콘페티 1.2~2.0s·1회 · 로고 정지', () => {
    const drop = css.match(/animation:\s*dp-drop\s*([\d.]+)s[^;]*/)
    expect(drop, '콘페티 animation 선언이 없다').not.toBeNull()
    expect(parseFloat(drop[1])).toBeGreaterThanOrEqual(1.2)
    expect(parseFloat(drop[1])).toBeLessThanOrEqual(2.0)
    expect(drop[0], '콘페티가 1회가 아니다(infinite 면 배경 소음이 된다)').not.toMatch(/infinite/)
    // 로고 정지 = 로고 규칙에 animation 이 «없어야» 한다
    const logo = css.match(/\.dp-logo\s+img\s*\{[^}]*\}/)
    expect(logo?.[0] ?? '').not.toMatch(/animation/)
  })

  it('★정적 화면 — «상시 움직임 0»(물결 제거, 2026-08-18 유저 지시)', () => {
    // ⑴ 물결이 CSS·JSX 어디에도 없다. ★두 파일을 «다» 본다 — 한쪽만 지우면
    //    규칙만 남거나(죽은 CSS) 클래스만 남는다(그리는데 스타일이 없다). 둘 다 조용한 실패다.
    expect(cssCode, 'CSS 에 물결 규칙이 남아 있다').not.toMatch(/dp-waves|dp-flow/)
    expect(jsxCode, 'JSX 가 아직 물결을 그린다').not.toMatch(/dp-waves/)
    // ⑵ 일반형 — 무한 반복 애니메이션이 **한 건도** 없어야 한다.
    //    이름을 세면 «다음 물결»은 다른 이름으로 들어온다. 그래서 이름이 아니라 «성질»을 잰다.
    expect(cssCode, '상시(infinite) 애니메이션이 있다 — 정적 화면 사양 위반').not.toMatch(/infinite/)
  })

  it('★모션 정본 상한 — 화면 전환 ≤400ms(축하·앰비언트는 예외)', () => {
    const fade = css.match(/animation:\s*dp-fade\s*([\d.]+)s/)
    expect(fade, 'dp-fade 선언이 없다').not.toBeNull()
    expect(parseFloat(fade[1]), '정본 상한 400ms 초과').toBeLessThanOrEqual(0.4)
  })

  it('★슬라이드 인·순차 등장 금지 — 페이드는 컨테이너 «하나»에만', () => {
    expect(css).not.toMatch(/translateX|slideIn|slide-in/i)
    // ★이 술어는 «아무것도 안 재고 있었다»(2026-08-17 발견): CSS 의 animation-delay 를 셌는데
    //   딜레이는 **JSX 인라인**(`animationDelay: c.delay`)에 있다. CSS 개수는 0 이라 상한 1 을
    //   «항상» 통과했다 — 가지가 죽어 있어서 나온 초록이었다. ⇒ 두 파일을 «다» 본다.
    const cssDelays = [...css.matchAll(/animation-delay/g)].length
    const jsxDelays = [...jsx.matchAll(/animationDelay/g)].length
    // 허용되는 딜레이는 «콘페티 장식» 하나뿐이다. 그 외에 생기면 순차 등장이다.
    expect(cssDelays + jsxDelays, '등장에 delay 를 쓰면 순차 등장이 된다(콘페티 1건만 허용)').toBeLessThanOrEqual(1)
    // ★그 1건이 정말 «콘페티»인지까지 확인한다 — 개수만 세면 이름이 바뀌어도 통과한다.
    if (jsxDelays === 1) expect(jsx).toMatch(/CONFETTI[\s\S]{0,400}animationDelay/)
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
