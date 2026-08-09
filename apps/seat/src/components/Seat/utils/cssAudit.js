// CSS 구조 감사기 — 「규칙 단위」로 CSS 를 읽어 «렌더되지 않아 눈에 안 보이는» 결함을 잡는다.
//
// ★검사 도구를 별도 모듈로 뺀 이유(교본 «가드 자체도 감사 대상» · «검증 도구엔 자체 회귀 테스트»):
//   가드가 조용한 것과 가드가 보고 있는 것은 다른 명제다. 파서에 사각이 있으면 «위반 0» 은 거짓 안심이 된다.
//   그래서 파서를 독립 모듈로 두고 **합성 CSS 로 파서 자체를 시험**한다(cssAudit.test.js).
//
// 파서 사각을 막는 세 가지 처리:
//   ⑴ **주석은 지우지 않고 한 글자 토큰으로 치환**한다 — 이 레포 주석에는 `{`·백틱이 섞여 있어서
//      그냥 지우면 규칙 경계를 오독하고, 그냥 두면 «셀렉터 목록 속 주석»(구획을 삼킨 지문)을 못 본다.
//   ⑵ **블록 없는 at-rule**(`@import …;`)을 먼저 소비한다 — 안 그러면 그 뒤 규칙의 셀렉터에 딸려 들어가
//      at-rule 로 오인돼 **규칙 하나가 통째로 지도에서 사라진다**(교본: :root 지도 누락 실증).
//   ⑶ `@keyframes` 안의 `0%`/`from`/`to` 는 셀렉터가 아니므로 규칙 목록에서 제외한다.

export const COMMENT_MARK = '«주석»' // 셀렉터에 절대 나올 수 없는 토큰

/** 주석을 토큰으로 치환하고 블록 없는 at-rule 을 제거한 «투영본». */
export function maskCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, COMMENT_MARK)
    .replace(/@[a-zA-Z-]+[^;{}]*;/g, '') // ⑵ 블록 없는 at-rule
}

const KEYFRAME_STEP = /^(from|to|-?\d+(\.\d+)?%)$/

/**
 * (셀렉터목록, 선언집합) 규칙 목록. 중첩 @media 안쪽 규칙도 함께 잡힌다.
 * 주석 토큰은 셀렉터에서 걷어낸 형태로 돌려주되, 원문 셀렉터는 rawSelector 로 남긴다.
 */
export function parseRules(css) {
  const masked = maskCss(css)
  return [...masked.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, rawSelector, body]) => {
      const cleaned = rawSelector.split(COMMENT_MARK).join(' ').trim()
      return {
        rawSelector,
        selectors: cleaned.split(',').map((x) => x.trim()).filter(Boolean),
        body: body.split(COMMENT_MARK).join(' ').trim(),
      }
    })
    .filter((r) => r.body)
    .filter((r) => !r.selectors.some((s) => s.startsWith('@')))
    .filter((r) => !r.selectors.every((s) => KEYFRAME_STEP.test(s))) // ⑶ keyframe 스텝
}

/**
 * 셀렉터 목록 **한가운데**에 주석 문단이 끼어 있는 규칙 = 구획을 통째로 삼킨 지문.
 * (2026-08-09 결함: 죽은 클래스를 지울 때 선언부까지 사라져 앞 셀렉터들이 다음 구획을 삼켰다.)
 * 규칙 **앞**에 붙은 설명 주석은 정상이므로 몇 개가 붙어 있든 걷어낸 뒤 본다.
 */
export function findSwallowedSections(css) {
  const leading = new RegExp(`^(\\s*${COMMENT_MARK})+`, 'u')
  return [...maskCss(css).matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map(([, sel]) => sel.replace(leading, '').trim())
    .filter((s) => s.includes(COMMENT_MARK))
    .map((s) => s.split('\n')[0].trim())
}

/** 선언 문자열에서 0 이 아닌 패딩을 쓰는지. (스크롤포트 패딩 금지 검사용) */
export function hasNonZeroPadding(body) {
  return [...body.matchAll(/padding[a-z-]*\s*:\s*([^;]+)/g)]
    .some(([, v]) => v.trim().split(/\s+/).some((n) => n !== '0'))
}
