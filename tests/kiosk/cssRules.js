// CSS 를 **규칙 단위**로 뜨는 파서 — `(컨텍스트, 셀렉터) → 선언집합`.
//
// 왜 규칙 단위인가(리팩토링 독트린, 자리후 라운드 실증):
//   «이 클래스가 아직 쓰이나»(이름 방향)로는 **선언부 소실·규칙 흡수**를 못 잡는다.
//   죽은 셀렉터를 지울 때 그 줄이 선언 블록(`{…}`)을 지니고 있으면, 앞의 콤마로 끝난
//   **형제 셀렉터들이 다음 규칙에 병합**돼 조용히 스타일이 바뀐다(실증: 자리후 e131115 이중 dim).
//   ⇒ 검증은 «셀렉터 → 선언집합» 을 전후로 대조해야 한다.
import fs from 'node:fs'
import path from 'node:path'

export const KIOSK_CSS = path.resolve(
  import.meta.dirname, '../../apps/membership/src/components/Kiosk/Kiosk.css',
)
const SRC_DIR = path.resolve(import.meta.dirname, '../../apps/membership/src')
const INDEX_HTML = path.resolve(import.meta.dirname, '../../apps/membership/index.html')

/**
 * 규칙 목록. @media/@supports 는 «컨텍스트»로 유지한다 —
 * 같은 셀렉터가 컨텍스트별로 다른 선언을 갖는 것이 정상이므로 키에 포함해야 한다.
 * @returns {Array<{ctx:string, sel:string, decls:string[]}>}
 */
export function parseRules(cssText) {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '')   // 주석 제거(선언에 영향 없음)
  const rules = []
  const ctx = []
  let head = ''
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    // ★블록 없는 at-rule(`@import`·`@charset`·`@namespace`)은 «;» 로 끝난다 — 여기서 소비해야 한다.
    //   안 하면 그 문장이 head 에 남아, 다음 규칙의 `{` 을 만날 때 head 가 `@` 로 시작해
    //   **at-rule 컨텍스트 오픈으로 오인**되고 그 규칙 블록이 지도에서 통째로 사라진다.
    //   실증(감사관 2호, 2026-08-09): `@import './brand.css';` 때문에 바로 뒤 `:root { --md-* … }`
    //   다크 토큰 블록 **전체가 규칙 지도에서 누락**돼 있었다 — 33개 가드가 그 구간에 침묵했다.
    //   ★내가 프루너에서 잡은 «at-rule 오인»과 같은 결함이 영구 가드 쪽에 남아 있던 것이다.
    if (c === ';' && head.trim().startsWith('@')) { head = ''; continue }
    if (c === '{') {
      const h = head.trim()
      head = ''
      if (h.startsWith('@')) { ctx.push(h.replace(/\s+/g, ' ')); continue }
      // 선언 블록 수집(중첩 대비 depth)
      let depth = 1
      let body = ''
      while (++i < css.length) {
        if (css[i] === '{') depth++
        else if (css[i] === '}') { depth--; if (depth === 0) break }
        body += css[i]
      }
      rules.push({
        ctx: ctx.join(' | '),
        sel: h.replace(/\s+/g, ' '),
        decls: body.split(';').map((d) => d.trim().replace(/\s+/g, ' ')).filter(Boolean),
      })
    } else if (c === '}') { ctx.pop(); head = '' } else head += c
  }
  return rules
}

/** 셀렉터 그룹(`a, b`)을 쪼개 «단일 셀렉터 → 선언집합» 지도로. 형제 고아화가 여기서 드러난다. */
export function ruleMap(rules) {
  const map = new Map()
  for (const r of rules) {
    for (const one of r.sel.split(',').map((s) => s.trim()).filter(Boolean)) {
      const key = `${r.ctx}||${one}`
      const prev = map.get(key) || []
      map.set(key, prev.concat(r.decls))
    }
  }
  return map
}

export function readKioskRules() {
  return parseRules(fs.readFileSync(KIOSK_CSS, 'utf8'))
}

/** 소스 전체 텍스트(클래스 문자열 참조 판정용). */
export function readSourceText() {
  const files = []
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (/\.(jsx?|html)$/.test(f)) files.push(p)
    }
  }
  walk(SRC_DIR)
  files.push(INDEX_HTML)
  return files.map((p) => fs.readFileSync(p, 'utf8')).join('\n')
}

export function classesIn(sel) {
  return Array.from(new Set((sel.match(/\.[A-Za-z0-9_-]+/g) || []).map((s) => s.slice(1))))
}
