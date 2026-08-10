// seatDevGuard 변이 시험 — ★교본 «가드 도입 커밋엔 변이 시험 필수», «반증 시험을 트리에 영구화».
//
// 2026-08-10 감사 ⒝ 지적: `cssAudit` 는 자체 테스트를 받았는데 이 가드는 **커밋 메시지 서술로만** 남아 있었다
// (「함정을 심어 확인했다」). 서술은 다음 세션이 재현할 수 없다 — 여기 영구화한다.
//
// 술어엔 둘을 묻는다(철학 뼈 ③): ⑴틀린 상태에서 **실패하는가** ⑵전건이 비었을 때 **그걸 말하는가**.
// 판정부가 순수 함수라 브라우저·jsdom 없이 시험한다(그 분리 자체가 이 감사의 산물이다).
import { describe, it, expect } from 'vitest'
import { stickyViolations, MAKES_SCROLLPORT, SCROLLS, ALLOWED_SCROLLERS, INTRINSIC_SCROLL_TAGS } from './seatDevGuard'

const S = (over = {}) => ({
  position: 'static', overflowX: 'visible', overflowY: 'visible',
  transform: 'none', filter: 'none', paddingTop: '0px', paddingBottom: '0px', ...over,
})

/** 정상 트리: app > scrollport(패딩0) > screen > table(clip) > sticky 헤더. */
function healthy() {
  return [
    { id: 0, tag: 'div', classes: ['seat-app'], parent: null, style: S() },
    { id: 1, tag: 'main', classes: ['seat-scrollport'], parent: 0, style: S({ overflowY: 'auto', overflowX: 'auto' }) },
    { id: 2, tag: 'div', classes: ['seat-screen'], parent: 1, style: S() },
    { id: 3, tag: 'div', classes: ['seat-table'], parent: 2, style: S({ overflowX: 'clip', overflowY: 'clip' }) },
    { id: 4, tag: 'div', classes: ['seat-row', 'seat-row-head'], parent: 3, style: S({ position: 'sticky' }) },
  ]
}
const patch = (nodes, id, style) => nodes.map((n) => (n.id === id ? { ...n, style: { ...n.style, ...style } } : n))

describe('seatDevGuard — 정상 상태에서는 조용하다', () => {
  it('위반 0', () => {
    expect(stickyViolations(healthy())).toEqual([])
  })

  it('스크롤포트 **밖**의 sticky(상단 앱바)는 이 규율 대상이 아니다', () => {
    // ★판별 fixture(2026-08-10 재감사 ⑴): 밖-sticky 의 **조상에 overflow:hidden 을 둔다.**
    //   전에는 조상이 깨끗해서 `if (!inside) continue` 를 통째로 지워도 통과했다 — 주장은 참인데
    //   시험이 그 주장을 안 보고 있었다(«비판별 주장»). 이제 필터를 지우면 이 시험이 red 가 된다.
    const n = [
      ...healthy(),
      { id: 5, tag: 'div', classes: ['seat-header-wrap'], parent: 0, style: S({ overflowX: 'hidden', overflowY: 'hidden' }) },
      { id: 6, tag: 'header', classes: ['seat-header'], parent: 5, style: S({ position: 'sticky' }) },
    ]
    expect(stickyViolations(n)).toEqual([])
  })

  it('의도된 스크롤 부품(모달 본문·스테이션 트랙)은 허용 목록으로 통과한다', () => {
    // ★실앱에서 **정말로 auto/scroll 인 것만** 시험한다(2026-08-10 재감사 ⑵ — 「화이트리스트는 은신처」).
    //   전에는 목록 4개 전부에 overflowY:'auto' 를 인위로 부여해 돌렸다. 통과는 하지만 **필요성을 증명하지 못한다**
    //   — 실앱에 존재할 수 없는 상태를 만들어 놓고 «면제가 필요하다»고 말하는 셈이었다.
    for (const c of ['seat-modal-body', 'seat-st-track']) {
      const n = [...healthy(), { id: 9, tag: 'div', classes: [c], parent: 0, style: S({ overflowY: 'auto' }) }]
      expect(stickyViolations(n), c).toEqual([])
    }
  })

  it('★죽은 면제는 목록에 두지 않는다 — 지금 필요한 것만 남았다', () => {
    // `seat-side-frame`(실제 overflow:hidden → SCROLLS 에서 먼저 걸러짐)과
    // `pv-center`(.seat-app 밖이라 collectNodes 가 수집조차 안 함)는 **닿을 수 없는 면제**였다.
    // 면제 목록은 «지금 진짜로 필요한 것»만 담는다 — 안 그러면 나중 결함이 그 그늘에 숨는다.
    expect([...ALLOWED_SCROLLERS].sort()).toEqual(['seat-modal-body', 'seat-st-track'])
  })
})

describe('seatDevGuard — 결함을 주입하면 적중한다(변이 시험)', () => {
  it('★조상 overflow:hidden — 2026-08-08 «표 헤더 sticky 사망»의 재현', () => {
    const w = stickyViolations(patch(healthy(), 3, { overflowX: 'hidden', overflowY: 'hidden' }))
    expect(w.join('\n')).toMatch(/overflow 상자/)
    expect(w.join('\n')).toContain('seat-table')
  })

  it('overflow: clip 은 잡지 않는다 — 이게 hidden 과 갈리는 지점이다', () => {
    expect(stickyViolations(patch(healthy(), 3, { overflowX: 'clip', overflowY: 'clip' }))).toEqual([])
  })

  it('★스크롤포트 패딩 — 「상단탭이 아래로 내려와 있다」 신고의 원인', () => {
    expect(stickyViolations(patch(healthy(), 1, { paddingTop: '16px' })).join('\n')).toMatch(/padding-top: 16px/)
    expect(stickyViolations(patch(healthy(), 1, { paddingBottom: '8px' })).join('\n')).toMatch(/padding-bottom: 8px/)
  })

  it('★조상 transform — sticky 기준 상자가 바뀐다', () => {
    expect(stickyViolations(patch(healthy(), 3, { transform: 'translateZ(0)' })).join('\n')).toMatch(/transform/)
    expect(stickyViolations(patch(healthy(), 3, { filter: 'blur(1px)' })).join('\n')).toMatch(/transform\/filter/)
  })

  it('★이름 없는 스크롤 상자 — 「약속하는 명제 = 구현하는 명제」(감사 ⒞)', () => {
    const n = [...healthy(), { id: 9, tag: 'div', classes: ['somewhere-else'], parent: 0, style: S({ overflowY: 'auto' }) }]
    expect(stickyViolations(n).join('\n')).toMatch(/예상 밖 스크롤 상자/)
  })

  it('★스크롤포트가 둘이면 잡는다', () => {
    const n = [...healthy(), { id: 9, tag: 'main', classes: ['seat-scrollport'], parent: 0, style: S({ overflowY: 'auto' }) }]
    expect(stickyViolations(n).join('\n')).toMatch(/\.seat-scrollport 가 2개다/)
  })

  it('★전건이 비면(스크롤포트가 없으면) 조용히 통과하지 않고 그걸 말한다', () => {
    // 철학 뼈 ③ — «전건 비었는데 초록불» 방지. 여기가 이 시험의 핵심이다.
    const n = [{ id: 0, tag: 'div', classes: ['seat-app'], parent: null, style: S() }]
    expect(stickyViolations(n).join('\n')).toMatch(/\.seat-scrollport 가 0개다/)
  })

  it('빈 입력에도 침묵하지 않는다', () => {
    expect(stickyViolations([]).join('\n')).toMatch(/0개다/)
  })
})

describe('★검사①(스크롤 상자)과 검사③(sticky 조상)은 다른 명제다', () => {
  it('overflow:hidden 인 잎 요소는 검사①이 세지 않는다 — 버튼 리플·말줄임에 지천이라 세면 가드가 무시당한다', () => {
    const n = [...healthy(), { id: 9, tag: 'button', classes: ['seat-role-tab'], parent: 0, style: S({ overflowX: 'hidden', overflowY: 'hidden' }) }]
    expect(stickyViolations(n)).toEqual([])
  })

  it('폼 컨트롤(메모 textarea 등)은 스크롤이 본래 기능이라 세지 않는다 — 안 빼면 정상 화면에 8건이 뜬다(실측)', () => {
    for (const tag of INTRINSIC_SCROLL_TAGS) {
      const n = [...healthy(), { id: 9, tag, classes: ['seat-input'], parent: 2, style: S({ overflowY: 'auto' }) }]
      expect(stickyViolations(n), tag).toEqual([])
    }
  })

  it('하지만 그 hidden 이 sticky 와 스크롤포트 **사이**에 있으면 검사③이 잡는다', () => {
    expect(stickyViolations(patch(healthy(), 3, { overflowX: 'hidden', overflowY: 'hidden' })).join('\n')).toMatch(/overflow 상자/)
  })

  it.each([['auto', true], ['scroll', true], ['hidden', false], ['clip', false], ['visible', false]])(
    'SCROLLS(%s) = %s', (v, expected) => { expect(SCROLLS(v)).toBe(expected) })
})

describe('MAKES_SCROLLPORT — hidden ✕ / clip ○ 가 이 규율의 갈림점', () => {
  it.each([
    ['visible', false], ['clip', false], ['hidden', true], ['auto', true], ['scroll', true], ['', false], [undefined, false],
  ])('%s → %s', (v, expected) => {
    expect(MAKES_SCROLLPORT(v)).toBe(expected)
  })
})
