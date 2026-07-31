// 표 열 폭(리사이즈) 상태 — 가로형(landscape)·세로형(portrait) 각각. 현재 기기별 localStorage. (SEAT-SPEC §11)
// ★ 나중에 계정 귀속(서버) 저장으로 바꿀 때 이 훅의 load/save 만 교체하면 된다(호출부 불변).
import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_COLUMN_WIDTHS, COLUMN_WIDTH_KEYS, COLUMN_WIDTH_MIN, COLUMN_WIDTH_MAX, COLUMN_WIDTHS_KEY,
} from '../config/seatSettings'

const clamp = (px) => Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, Math.round(px)))

const cloneDefault = () => ({
  landscape: { ...DEFAULT_COLUMN_WIDTHS.landscape },
  portrait: { ...DEFAULT_COLUMN_WIDTHS.portrait },
})

// 한 방향(landscape|portrait)의 저장값을 기본값 위에 병합(숫자만, clamp).
function mergeMode(mode, saved) {
  const out = { ...DEFAULT_COLUMN_WIDTHS[mode] }
  for (const k of COLUMN_WIDTH_KEYS) {
    if (typeof saved?.[k] === 'number') out[k] = clamp(saved[k])
  }
  return out
}

function load() {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_KEY)
    if (!raw) return cloneDefault()
    const saved = JSON.parse(raw)
    return {
      landscape: mergeMode('landscape', saved?.landscape),
      portrait: mergeMode('portrait', saved?.portrait),
    }
  } catch {
    return cloneDefault()
  }
}

export function useColumnWidths() {
  const [widths, setWidths] = useState(load)

  useEffect(() => {
    try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths)) } catch { /* noop */ }
  }, [widths])

  // mode = 'landscape' | 'portrait'
  const setWidth = useCallback((mode, key, px) => {
    setWidths((prev) => ({ ...prev, [mode]: { ...prev[mode], [key]: clamp(px) } }))
  }, [])

  const resetWidths = useCallback(() => setWidths(cloneDefault()), [])

  return { widths, setWidth, resetWidths }
}
