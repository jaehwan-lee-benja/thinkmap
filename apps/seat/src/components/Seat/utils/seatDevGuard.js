// sticky 규율 개발용 가드 — ★dev 에서만 돈다(프로덕션 번들에서는 호출부가 통째로 죽는다).
//
// 왜: 2026-08-08 하루에 sticky 결함이 **3연속**으로 났고, 원인이 전부 같은 종류였다.
//   ① 스크롤포트에 패딩이 있어 sticky 정지선이 밀림
//   ② 조상 `.seat-table` 의 `overflow: hidden` 이 «스크롤 불가능한 스크롤포트»를 만들어 자손 sticky 를 재기준화
//   ③ 새 패널(태블링 액자)을 스크롤포트 **안**에 넣을 뻔함
// 셋 다 «화면을 봐야» 알 수 있었고, 실제로 한 건은 **일주일 넘게 죽어 있었다**(아무도 못 알아챘다).
// 이 가드는 그 셋을 **로드 즉시 콘솔에 띄운다**. 문서·주석은 읽어야 작동하지만, 이건 안 읽어도 작동한다.
//
// ※경고만 한다 — 무엇도 고치거나 막지 않는다. 오탐이면 무시하고 지나가면 된다.

const TAG = '[seat:sticky]'

// sticky 를 «재기준화» 하는 조상 = 스크롤포트를 새로 만드는 상자.
//   `clip` 은 스크롤포트를 만들지 않아 안전하다(2026-08-08 실측으로 갈린 지점 — hidden ✕ / clip ○).
const MAKES_SCROLLPORT = (v) => v && v !== 'visible' && v !== 'clip'

export function checkStickyDiscipline(root = document) {
  if (!import.meta.env?.DEV) return []
  const warn = []

  const ports = root.querySelectorAll('.seat-scrollport')
  if (ports.length !== 1) {
    warn.push(`스크롤포트가 ${ports.length}개다 — 자리후의 스크롤 상자는 .seat-scrollport 하나여야 한다.`)
  }
  const port = ports[0]
  if (!port) { report(warn); return warn }

  // ① 스크롤포트의 패딩 — sticky 정지선이 그만큼 밀린다.
  const cs = getComputedStyle(port)
  for (const side of ['Top', 'Bottom']) {
    const v = parseFloat(cs[`padding${side}`]) || 0
    if (v !== 0) warn.push(`스크롤포트에 padding-${side.toLowerCase()}: ${v}px — sticky 정지선이 그만큼 밀린다(패딩은 .seat-screen 이 갖는다).`)
  }

  // ② sticky 요소와 스크롤포트 **사이**에 낀 상자 — 여기서 잘리면 sticky 가 통째로 죽는다.
  for (const el of root.querySelectorAll('.seat-scrollport [style*="sticky"], .seat-scrollport *')) {
    if (getComputedStyle(el).position !== 'sticky') continue
    for (let a = el.parentElement; a && a !== port; a = a.parentElement) {
      const acs = getComputedStyle(a)
      if (MAKES_SCROLLPORT(acs.overflowY) || MAKES_SCROLLPORT(acs.overflowX)) {
        warn.push(`sticky(${cls(el)}) 와 스크롤포트 사이에 overflow 상자(${cls(a)}: ${acs.overflowX}/${acs.overflowY}) 가 있다 — hidden 대신 clip 을 써라.`)
      }
      // transform/filter/contain 조상도 fixed·sticky 의 기준을 바꾼다.
      if (acs.transform !== 'none' || acs.filter !== 'none') {
        warn.push(`sticky(${cls(el)}) 조상 ${cls(a)} 에 transform/filter 가 있다 — 기준 상자가 바뀐다.`)
      }
    }
  }

  report(warn)
  return warn
}

const cls = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`

function report(warn) {
  if (!warn.length) return
  // 한 번에 묶어서 — 여러 줄이 흩어지면 다른 로그에 묻힌다.
  console.warn(`${TAG} 규율 위반 ${warn.length}건\n` + warn.map((w, i) => `  ${i + 1}. ${w}`).join('\n'))
}
