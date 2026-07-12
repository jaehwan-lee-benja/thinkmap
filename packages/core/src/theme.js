// 테마 헬퍼 — 사용자 설정(system|light|dark)을 <html data-theme>로 적용.
// 저장 = localStorage(즉시·같은 origin이라 모선+위성 공유). 크로스디바이스 동기는 앱이 user_preferences로.
// 무-플래시: 각 index.html <head>의 인라인 스크립트가 페인트 전에 아래와 동일 로직으로 data-theme 세팅.
// 상세: docs/THEME-SPEC.md
const STORAGE_KEY = 'thinkmap-theme'
const VALID = ['system', 'light', 'dark']

export function getThemePref() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return VALID.includes(v) ? v : 'system'
  } catch { return 'system' }
}

export function resolveTheme(pref = getThemePref()) {
  if (pref === 'light' || pref === 'dark') return pref
  // system → OS 설정
  return (typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark'
}

export function applyTheme(pref = getThemePref()) {
  const resolved = resolveTheme(pref)
  const el = document.documentElement
  el.dataset.theme = resolved
  el.style.colorScheme = resolved
  return resolved
}

// 설정 변경 + 저장 + 즉시 적용. 반환 = 해석된 실제 테마.
export function setThemePref(pref) {
  const p = VALID.includes(pref) ? pref : 'system'
  try { localStorage.setItem(STORAGE_KEY, p) } catch {}
  return applyTheme(p)
}

// 앱 부팅 시 1회 — 적용 + system 설정일 때 OS 테마 변경 반영.
export function initTheme() {
  applyTheme()
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => { if (getThemePref() === 'system') applyTheme('system') }
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else if (mq.addListener) mq.addListener(onChange)
  }
}
