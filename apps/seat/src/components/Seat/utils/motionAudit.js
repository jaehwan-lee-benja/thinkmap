// 모션 규범 감사기 — ★**수신자 쪽 술어**(2026-08-17, orch 규율 「규범이 발신자 의존이면 수신자 술어를 짝으로」).
//
// 왜 필요한가(실측으로 드러난 형태):
//   `saruru-design/docs/MOTION-CANON.md` 는 **「적용 범위 = 화면 산출 전부」**라고 적혀 있다 — 자리후도 대상이다.
//   그런데 **나에게 온 통지는 0건**이었고, 오늘 곁가지로 알게 됐다. 그 사이 자리후에는
//   **금지 목록(배포 차단) 항목이 3건** 살아 있었다.
//   ★발신자 의존 규범에서 **침묵은 «규범이 안 바뀜»과 «통지가 안 옴» 둘 다와 양립한다.**
//     수신자가 스스로 재는 술어가 없으면 그 둘은 **원리적으로 구별 불가능**하다. 그래서 여기서 잰다.
//
// 무엇을 재나 — MOTION-CANON §6 «금지 목록(배포 차단)» 중 **CSS 로 기계 판정 가능한 것만**:
//   §6-1 슬라이드 인   — 등장 keyframe 의 `translate` (등장은 opacity + 미세 scale 로만)
//   §6-3 바운스 과다   — 오버슈트 6% 초과 또는 되튐 2회 이상
//   §6-8 linear 등장   — 등장/퇴장에 `linear`
//   §7  축하 색       — 무지개 금지(정본 팔레트 + 무채색)
// ※§6-2 딜레이 체인·§6-7 「정보를 모션으로만」 등은 **일부러 기계화하지 않았다** — 화면 맥락이 필요하다.
//   기계가 못 보는 것을 «봤다»고 적으면 그 자체가 거짓 초록이다(그 둘은 사람 칸으로 SPEC 체크리스트에 남긴다).

import { maskCss } from './cssAudit'

/** `@keyframes 이름 { ... }` 을 { 이름: 본문 } 으로. (cssAudit 의 마스킹을 재사용 — 주석 속 중괄호 회피) */
export function parseKeyframes(css) {
  const src = maskCss(css)
  const out = {}
  const re = /@keyframes\s+([A-Za-z0-9_-]+)\s*\{/g
  let m
  while ((m = re.exec(src))) {
    let depth = 1
    let i = re.lastIndex
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    // ★마스킹본에서 잘라낸다 — maskCss 는 길이를 보존하지 않으므로(주석→토큰, at-rule 제거)
    //   원문 인덱스로 자르면 **엉뚱한 구간**이 나온다. 실제로 그렇게 짜서 실앱 위반 2건을 놓쳤다(자체 확인).
    out[m[1]] = src.slice(re.lastIndex, i - 1)
  }
  return out
}

/** keyframe 본문에서 scale 값들을 순서대로 뽑는다. */
export const scalesOf = (body) =>
  [...body.matchAll(/scale\(\s*([0-9.]+)/g)].map((m) => parseFloat(m[1]))

/** 되튐 횟수 = scale 수열이 1 을 가로지르며 방향을 바꾼 횟수(양쪽 끝의 1 은 시작·정착). */
export function bounceCount(scales) {
  const mid = scales.slice(1, -1)          // 시작/정착 제외
  let n = 0
  for (let i = 0; i < mid.length; i++) {
    const prevSide = i === 0 ? 0 : Math.sign(mid[i - 1] - 1)
    const side = Math.sign(mid[i] - 1)
    if (side !== 0 && side !== prevSide) n++
  }
  return n
}

/** 오버슈트(%) = 1 에서 가장 멀리 간 정도. */
export const overshootPct = (scales) =>
  scales.length ? Math.max(...scales.map((s) => Math.abs(s - 1))) * 100 : 0

// 정본 팔레트 + 무채색만 허용(§7). 토큰(var(--…))은 팔레트로 본다 — 토큰 자체가 정본이다.
const RAW_HEX = /#[0-9A-Fa-f]{3,8}/g
const CANON_HEX = new Set(['#2D4B82', '#3CB44B'])           // 네이비 · 그린
const isGrey = (h) => {
  const v = h.replace('#', '')
  if (v.length !== 6) return false
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16))
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8         // 채도 거의 0 = 무채색
}

/**
 * @param {string} css
 * @param {{particles?: string[], confettiSelector?: string}} opts
 *   particles = **물리 입자** keyframe 이름. §7 이 「중력·회전·항력 있는 물리 낙하」를 명시하므로
 *     입자는 §6-1(이동 금지)·§6-3(스케일 한도)의 대상이 아니다 — 이동과 흩어짐이 그 어휘의 본질이다.
 *     ★이 예외를 안 두면 감사기가 «정본이 시킨 것»을 위반이라 부른다. 그건 오탐이고, 오탐은 가드를 죽인다
 *       (「시끄럽다 ≠ 더럽다」 — 도구의 빨간불도 판정이 아니라 재료다, 2026-08-17 crm 실측).
 *     입자에도 §7 은 그대로 적용된다(색·1회·정착) — 아래 색 검사가 그 몫이다.
 * @returns {string[]} 위반 문구(빈 배열 = 통과)
 */
export function motionViolations(css, opts = {}) {
  const warn = []
  const frames = parseKeyframes(css)

  const particles = opts.particles || ['seat-confetti-fly']
  for (const [name, body] of Object.entries(frames)) {
    if (particles.includes(name)) continue   // §7 물리 입자 — 위 주석 참조
    // §6-1 — 등장/퇴장 keyframe 의 이동. `translate(-50%…)` 같은 **정렬용 고정 오프셋**은 이동이 아니다:
    //   수열 전체에서 값이 **변하는** 축만 이동으로 본다.
    const translates = [...body.matchAll(/translate(?:X|Y)?\(([^)]*)\)/g)].map((m) => m[1].trim())
    if (translates.length > 1 && new Set(translates).size > 1) {
      warn.push(`§6-1 슬라이드 인: @keyframes ${name} 이 translate 로 움직인다(${translates.join(' → ')}) — 등장은 opacity + 미세 scale 로만.`)
    }

    // §6-3 — 오버슈트 6% 초과 / 되튐 2회 이상. ★축하도 이 한도 안이다(규범 명시).
    const scales = scalesOf(body)
    if (scales.length > 1) {
      const os = overshootPct(scales)
      const bounces = bounceCount(scales)
      // 부동소수 여유 — 1.06 이 6.000000000000005% 로 나와 «한도 6%»가 자기 자신을 잡는다(자체시험에서 잡힘).
      if (os > 6.0001) warn.push(`§6-3 오버슈트 ${os.toFixed(0)}% (한도 6%): @keyframes ${name}`)
      if (bounces >= 2) warn.push(`§6-3 되튐 ${bounces}회 (한도 1회): @keyframes ${name}`)
    }
  }

  // §6-8 — 등장/퇴장에 linear.
  for (const m of css.matchAll(/animation:[^;]*\blinear\b[^;]*/g)) {
    warn.push(`§6-8 linear 이징으로 등장/퇴장: ${m[0].slice(0, 60)}`)
  }

  // §7 — 축하 색은 정본 팔레트 + 무채색(무지개 금지).
  const sel = opts.confettiSelector || '.seat-confetti'
  const scope = css.split('\n').filter((l) => l.includes(sel)).join('\n')
  const bad = [...scope.matchAll(RAW_HEX)].map((m) => m[0])
    .filter((h) => !CANON_HEX.has(h.toUpperCase()) && !isGrey(h))
  if (bad.length) {
    warn.push(`§7 축하 색 무지개: ${[...new Set(bad)].join(' ')} — 정본 팔레트(#2D4B82·#3CB44B) + 무채색만.`)
  }
  return warn
}
