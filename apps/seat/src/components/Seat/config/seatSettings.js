// 자리후 설정 — 기기(태블릿)별 로컬 설정. (SEAT-SPEC §11 · §14)
// ★ 새 설정 추가 = 아래 SEAT_SETTINGS 에 항목 하나 append 하면 끝.
//   SettingsPanel 은 이 배열만 보고 그리므로 UI 코드는 손대지 않는다.
//   type: 'toggle' | 'columns' (현재 지원). 새 타입이 필요하면 SettingsPanel 에 렌더 분기 추가.
export const SETTINGS_STORAGE_KEY = 'seat.settings.v1'

// 표(자리안내·주문서관리)의 열 목록 — 숨김 설정 대상.
// ★ key 는 CSS 클래스 `.seat-cell-<key>` 와 1:1. 열을 새로 만들면 여기에 append 하고
//   Seat.css 의 숨김 규칙(is-hide-<key>)에 한 줄 추가하면 된다. DOM 은 건드리지 않는다.
export const SEAT_COLUMNS = [
  { key: 'no', label: '테이블링' },
  { key: 'order', label: '주문번호' },
  { key: 'status', label: '상태' },
  { key: 'deliver', label: '자리후' },
  { key: 'seat', label: '자리순서' },
  { key: 'opts', label: '야외·포장' }, // 구 '제조옵션' — 화면 표기에서 '제조옵션' 표현 제거(유저 지시 2026-07-31)
  { key: 'raise', label: '올림' },
  { key: 'notes', label: '특이사항' },
  { key: 'confirm', label: '확인' },
]

export const SEAT_SETTINGS = [
  {
    key: 'cameraEnabled',
    type: 'toggle',
    label: '카메라 연동 보기',
    hint: '주문서관리·카이막·커피 화면의 카메라 영역을 표시합니다. 하드웨어 입고 전에는 꺼둡니다.',
    default: false,
  },
  {
    key: 'hiddenColumns',
    type: 'columns',
    label: '표에 보일 열',
    hint: '체크를 끈 열은 이 기기의 표에서 숨깁니다(세로 화면에서 폭이 부족할 때). ‘자리후’를 숨기면 전달 체크박스도 사라지니, 전달을 담당하는 기기에서는 켜 둡니다.',
    options: SEAT_COLUMNS,
    default: [], // 숨긴 열의 key 목록. 빈 배열 = 전부 표시.
  },
]

export const DEFAULT_SETTINGS = Object.fromEntries(SEAT_SETTINGS.map((s) => [s.key, s.default]))

// 저장값이 기본값과 타입이 다르면(구버전·손상) 그 항목만 기본값으로 되돌린다.
function sanitize(raw) {
  const out = { ...DEFAULT_SETTINGS }
  for (const s of SEAT_SETTINGS) {
    const v = raw?.[s.key]
    if (v === undefined) continue // 저장값에 없는 키(= 나중에 추가된 설정) → 기본값 유지
    const ok = Array.isArray(s.default) ? Array.isArray(v) : typeof v === typeof s.default
    if (ok) out[s.key] = v
  }
  return out
}

// 열 숨김 토글 — visible=true 면 목록에서 빼고, false 면 넣는다.
export function toggleHiddenColumn(hidden, key, visible) {
  const list = Array.isArray(hidden) ? hidden : []
  if (visible) return list.filter((k) => k !== key)
  return list.includes(key) ? list : [...list, key]
}

// 숨긴 열 → 루트(.seat-app)에 붙일 클래스 문자열. CSS 가 헤더·데이터행을 함께 숨긴다.
export function hiddenColumnClasses(hidden) {
  return (Array.isArray(hidden) ? hidden : []).map((k) => `is-hide-${k}`).join(' ')
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return sanitize(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* noop */
  }
}
