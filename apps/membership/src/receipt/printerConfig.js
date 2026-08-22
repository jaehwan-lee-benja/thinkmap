// 프린터 «기기 설정» — 영수증 모양(템플릿)과 **분리된** 축.
//
// 왜 분리하는가(2026-08-09 구조 라운드, 유저: 「컷트가 계속 불안정 — 구조적 점검과 리팩토링」):
//   컷 방언·스킴 호출 방식은 **그 기기에 붙은 프린터의 성질**이고, 블록 순서·문구는
//   **매장 공통의 영수증 모양**이다. 종전엔 둘이 같은 템플릿 JSON 안에 섞여 있었다.
//   그 결과 ⑴현장에서 성공한 컷 방언이 «영수증 모양»과 함께 그 기기에만 갇히고
//   ⑵코드에서 모양을 개선해도 저장본이 있는 기기는 옛 판을 계속 썼다(같은 코드, 다른 출력).
//
// ★규율: **정본 기본값은 코드에 있다.** 저장분은 «기본값과 다른 값만» 남기는 명시 오버라이드다.
//   ⇒ 기본값을 코드에서 고치면 저장분이 있는 기기에도 그대로 흘러든다(막는 것은 명시 오버라이드뿐).

export const CONFIG_KEY = 'mk-printer-config'

// 컷 방언 —
//   'feed'    GS V 66 0 : 컷 위치까지 급지 후 부분컷(현대 기종 표준)
//   'full'    GS V 0    : 급지 없는 풀컷(구형 기종이 아는 방언)
//   'partial' GS V 1    : 급지 없는 부분컷
//   'none'    (미전송)  : ★컷을 **우리가 보내지 않는다** — RawBT/드라이버의 자동 컷에 맡긴다.
//     이 선택지가 필요한 이유: RawBT 자체 «Feed after print + auto cut» 이 켜져 있으면
//     우리 컷 + RawBT 컷 = **컷 2회** → 사이에 빈 조각이 따로 잘려 나온다(2026-08-08 현장).
//     컷 주체는 **하나여야 한다**. 종전 코드엔 «맡긴다»를 표현할 방법이 아예 없었다.
export const CUT_MODES = ['feed', 'full', 'partial', 'none']

// 스킴 호출 방식 —
//   'auto'   제스처가 있으면 location.href, 없으면 iframe (2026-08-04부터의 현행 동작 = 기본값)
//   'iframe' 항상 iframe — ★스킴이 처리되지 않아도 오류가 iframe 안에서 죽어 **키오스크 화면이 산다.**
//            (location.href 는 미처리 시 현재 페이지가 오류 화면으로 바뀐다 = 키오스크 파괴)
//   'href'   항상 location.href — iframe 발 외부 스킴이 차단되는 환경의 정공법
// ★기본을 'auto'(현행)로 두는 이유: 방식 전환은 «인쇄가 아예 안 될» 리스크가 있어
//   코드가 혼자 판단할 게 아니다. 현장에서 편집기로 바꿔 실물로 가르고, 로그가 어느 방식이었는지 남긴다.
export const SCHEMES = ['auto', 'iframe', 'href']

export const DEFAULT_CONFIG = { cut: 'feed', scheme: 'auto' }

function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v) }

// 저장분(명시 오버라이드) → 코드 기본값 위에 병합. 모르는 값은 버린다(오타·낡은 값이 조용히 사는 걸 막는다).
export function normalizeConfig(saved) {
  const cfg = { ...DEFAULT_CONFIG }
  if (!isPlainObject(saved)) return cfg
  if (CUT_MODES.indexOf(saved.cut) >= 0) cfg.cut = saved.cut
  if (SCHEMES.indexOf(saved.scheme) >= 0) cfg.scheme = saved.scheme
  return cfg
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return normalizeConfig(JSON.parse(raw))
  } catch (e) { /* noop — 기본값으로 진행. 인쇄가 설정 때문에 막히지 않게. */ }
  return { ...DEFAULT_CONFIG }
}

// 기본값과 **같은 값은 저장하지 않는다** — 저장분이 곧 «이 기기에서 일부러 다르게 둔 것»의 목록이 된다.
export function saveConfig(cfg) {
  const c = normalizeConfig(cfg)
  const diff = {}
  for (const k of Object.keys(DEFAULT_CONFIG)) if (c[k] !== DEFAULT_CONFIG[k]) diff[k] = c[k]
  try {
    if (Object.keys(diff).length === 0) localStorage.removeItem(CONFIG_KEY)
    else localStorage.setItem(CONFIG_KEY, JSON.stringify(diff))
  } catch (e) { /* noop */ }
  return c
}

// 기본값과 다른 항목만(화면 표시·로그용).
export function configOverrides(cfg) {
  const c = normalizeConfig(cfg)
  const out = {}
  for (const k of Object.keys(DEFAULT_CONFIG)) if (c[k] !== DEFAULT_CONFIG[k]) out[k] = c[k]
  return out
}
