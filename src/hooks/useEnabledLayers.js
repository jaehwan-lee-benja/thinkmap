import { useCallback, useState } from 'react'

// 캘린더 레이어 표시 토글 — localStorage 영속.
// CALENDAR-SPEC §8: RLS 는 "접근 가능한 모든 것"을 열고, UI 레이어 토글은 "지금 무엇을 볼지"만 정한다.
// schedule 레이어는 캘린더의 1차 레이어라 항상 ON(토글 대상에서 제외). 나머지(daily, 향후 weather/sales)만 토글.

const KEY = 'calendar.enabled_layers'
const DEFAULTS = { daily: true }

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function useEnabledLayers() {
  const [enabledLayers, setEnabledLayers] = useState(load)

  const toggleLayer = useCallback((id) => {
    setEnabledLayers(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }, [])

  return { enabledLayers, toggleLayer }
}
