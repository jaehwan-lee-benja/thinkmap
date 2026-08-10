// sticky 규율 개발용 가드 — ★dev 에서만 돈다(프로덕션 번들에서는 호출부가 통째로 죽는다).
//
// 왜: 2026-08-08 하루에 sticky 결함이 **3연속**으로 났고, 원인이 전부 같은 종류였다.
//   ① 스크롤포트에 패딩이 있어 sticky 정지선이 밀림
//   ② 조상 `.seat-table` 의 `overflow: hidden` 이 «스크롤 불가능한 스크롤포트»를 만들어 자손 sticky 를 재기준화
//   ③ 새 패널(태블링 액자)을 스크롤포트 **안**에 넣을 뻔함
// 셋 다 «화면을 봐야» 알 수 있었고, 실제로 한 건은 **일주일 넘게 죽어 있었다**(아무도 못 알아챘다).
// 이 가드는 그 셋을 **로드 즉시 콘솔에 띄운다**. 문서·주석은 읽어야 작동하지만, 이건 안 읽어도 작동한다.
//
// ★구조(2026-08-10 감사 ⒝ 반영): **판정은 순수 함수**(stickyViolations)로 빼고 DOM 은 얇은 수집기만 맡는다.
//   그래야 브라우저·jsdom 없이 **변이 시험**(결함 주입 → 적중)을 트리에 영구화할 수 있다
//   — 교본이 금한 형태가 「반증 시험이 커밋 메시지 서술로만 남는 것」이었다. 시험은 seatDevGuard.test.js.
//
// ※경고만 한다 — 무엇도 고치거나 막지 않는다. 오탐이면 무시하고 지나가면 된다.

const TAG = '[seat:sticky]'

// sticky 를 «재기준화» 하는 조상 = 스크롤포트를 새로 만드는 상자.
//   `clip` 은 스크롤포트를 만들지 않아 안전하다(2026-08-08 실측으로 갈린 지점 — hidden ✕ / clip ○).
export const MAKES_SCROLLPORT = (v) => !!v && v !== 'visible' && v !== 'clip'

// ★«스크롤 상자»와 «자르기»는 다른 명제다(2026-08-10 실측으로 갈렸다).
//   `hidden` 은 sticky **조상**일 때만 위험하고(그건 검사③이 정확히 본다), 그 자체로는 버튼 리플·말줄임 등에
//   지천으로 쓰인다 — 검사①이 이걸 다 세면 실제 앱에서 **39건이 쏟아져** 가드가 무시당한다(실측).
//   그래서 검사①은 «정말로 스크롤하는 상자»(auto/scroll)만 본다. 약속을 좁히되, 좁힌 이유를 여기 적는다.
export const SCROLLS = (v) => v === 'auto' || v === 'scroll'

// 의도적으로 스크롤하는 부품 — sticky 조상이 아니라 무해하다는 **판단**이고, 그 판단을 코드에 적어 둔다
// (다음 세션이 재판정할 수 있게). 여기 없는 스크롤 상자가 생기면 가드가 말한다.
export const ALLOWED_SCROLLERS = ['seat-side-frame', 'seat-modal-body', 'seat-st-track', 'pv-center']
// 스크롤이 **본래 기능**인 폼 컨트롤 — 레이아웃 스크롤포트가 아니다(메모 textarea 는 UA 기본이 overflow:auto).
//   실측: 이걸 빼먹으면 정상 화면에서 메모칸 수만큼 경고가 뜬다(8건). 노이즈는 가드를 죽인다.
export const INTRINSIC_SCROLL_TAGS = ['textarea', 'select', 'input']

const label = (n) => `${n.tag || 'div'}${n.classes.length ? '.' + n.classes.slice(0, 2).join('.') : ''}`

/**
 * ★순수 판정부. nodes = [{ id, tag, classes:[], parent:id|null, style:{...} }] (문서 순서).
 * style = 계산된 값: position·overflowX·overflowY·transform·filter·paddingTop·paddingBottom.
 */
export function stickyViolations(nodes) {
  const warn = []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const has = (n, c) => n.classes.includes(c)

  // 검사① — «약속하는 명제 = 구현하는 명제»(2026-08-10 감사 ⒞). 전에는 클래스 **이름만** 셌다.
  //   그러면 이름 없이 스크롤 상자가 된 것을 못 본다 — 「스크롤 상자는 하나뿐」이라 말해놓고 이름만 세는 셈이었다.
  //   지금은 **계산된 overflow 로 실제 스크롤 상자(auto/scroll)를 전수** 찾고, 허용 목록 밖이면 말한다.
  //   ※`hidden` 은 여기서 세지 않는다 — 위 SCROLLS 주석 참조(sticky 조상일 때만 위험 → 검사③ 담당).
  for (const n of nodes) {
    if (!SCROLLS(n.style.overflowY) && !SCROLLS(n.style.overflowX)) continue
    if (has(n, 'seat-scrollport')) continue
    if (INTRINSIC_SCROLL_TAGS.includes(n.tag)) continue
    if (ALLOWED_SCROLLERS.some((c) => has(n, c))) continue
    warn.push(`예상 밖 스크롤 상자: ${label(n)} — 자리후 본문 스크롤 상자는 .seat-scrollport 하나여야 한다(의도한 것이면 ALLOWED_SCROLLERS 에 근거와 함께 등록).`)
  }

  const ports = nodes.filter((n) => has(n, 'seat-scrollport'))
  if (ports.length !== 1) {
    // ★전건이 비었을 때 조용히 통과하지 않는다(철학 뼈 ③ — «전건 비었는데 초록불» 방지).
    warn.push(`.seat-scrollport 가 ${ports.length}개다 — 하나여야 한다.`)
  }
  const port = ports[0]
  if (!port) return warn

  // ② 스크롤포트의 패딩 — sticky 정지선이 그만큼 밀린다.
  for (const [key, ko] of [['paddingTop', 'top'], ['paddingBottom', 'bottom']]) {
    const v = parseFloat(port.style[key]) || 0
    if (v !== 0) warn.push(`스크롤포트에 padding-${ko}: ${v}px — sticky 정지선이 그만큼 밀린다(패딩은 .seat-screen 이 갖는다).`)
  }

  // ③ sticky 요소와 스크롤포트 **사이**에 낀 상자 — 여기서 잘리면 sticky 가 통째로 죽는다.
  for (const el of nodes) {
    if (el.style.position !== 'sticky') continue
    // 스크롤포트 **밖**의 sticky(상단 앱바 등)는 이 규율 대상이 아니다.
    let inside = false
    for (let p = byId.get(el.parent); p; p = byId.get(p.parent)) if (p === port) { inside = true; break }
    if (!inside) continue

    for (let a = byId.get(el.parent); a && a !== port; a = byId.get(a.parent)) {
      if (MAKES_SCROLLPORT(a.style.overflowY) || MAKES_SCROLLPORT(a.style.overflowX)) {
        warn.push(`sticky(${label(el)}) 와 스크롤포트 사이에 overflow 상자(${label(a)}: ${a.style.overflowX}/${a.style.overflowY}) 가 있다 — hidden 대신 clip 을 써라.`)
      }
      if ((a.style.transform && a.style.transform !== 'none') || (a.style.filter && a.style.filter !== 'none')) {
        warn.push(`sticky(${label(el)}) 조상 ${label(a)} 에 transform/filter 가 있다 — 기준 상자가 바뀐다.`)
      }
    }
  }
  return warn
}

/** DOM → 판정부 입력. **얇게 유지한다**(여기 로직을 넣으면 시험할 수 없는 자리가 늘어난다). */
export function collectNodes(root = document, getStyle = (el) => getComputedStyle(el)) {
  const app = root.querySelector?.('.seat-app')
  const els = app ? [app, ...app.querySelectorAll('*')] : [...(root.querySelectorAll?.('*') || [])]
  const ids = new Map(els.map((el, i) => [el, i]))
  return els.map((el, i) => {
    const s = getStyle(el)
    return {
      id: i,
      tag: el.tagName ? el.tagName.toLowerCase() : 'div',
      classes: [...(el.classList || [])],
      parent: ids.has(el.parentElement) ? ids.get(el.parentElement) : null,
      style: {
        position: s.position,
        overflowX: s.overflowX,
        overflowY: s.overflowY,
        transform: s.transform,
        filter: s.filter,
        paddingTop: s.paddingTop,
        paddingBottom: s.paddingBottom,
      },
    }
  })
}

export function checkStickyDiscipline(root = document) {
  if (!import.meta.env?.DEV) return []
  const warn = stickyViolations(collectNodes(root))
  if (warn.length) {
    // 한 번에 묶어서 — 여러 줄이 흩어지면 다른 로그에 묻힌다.
    console.warn(`${TAG} 규율 위반 ${warn.length}건\n` + warn.map((w, i) => `  ${i + 1}. ${w}`).join('\n'))
  }
  return warn
}
