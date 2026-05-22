// 7색 프리셋에 사용자 정의 라벨 부여. localStorage 영속화.
//
// 키: 'schedule.color_labels'
// 값: { '#3b82f6': 'Work', '#10b981': 'Personal', ... }
//
// 빈 라벨 = 라벨 없음 (색 자체로만 표시).

import { useCallback, useState } from 'react'

const STORAGE_KEY = 'schedule.color_labels'

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}
function write(map) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)) } catch {}
}

export function useColorLabels() {
  const [labels, setLabels] = useState(() => read())

  const setLabel = useCallback((color, label) => {
    setLabels(prev => {
      const next = { ...prev, [color]: label || '' }
      // 빈 값은 키 제거 (저장 공간 최소화)
      if (!label) delete next[color]
      write(next)
      return next
    })
  }, [])

  return { labels, setLabel }
}
