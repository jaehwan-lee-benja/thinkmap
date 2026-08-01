// 표 열 폭(리사이즈) — 워크스페이스(매장) 귀속 서버 저장 + localStorage 폴백. (SEAT-SPEC §11)
//   로그인: seat_workspace_prefs.prefs.columnWidths (그 매장 워크스페이스 행) — 매장 내 어느 계정/기기든 같은 기준치.
//   비로그인/프리뷰: localStorage 만(서버 접근 없음).
//   전략: 초기값 = localStorage(즉시 렌더) → 로그인이면 서버값으로 덮어씀 → 변경 시 localStorage 항상 + 서버 디바운스 저장.
//   저장은 RPC(seat_save_workspace_prefs) — 앱은 workspace_id 를 모르고 서버가 current_workspace() 로 결정.
//   ★서버 실패(테이블/함수 없음·오프라인)는 조용히 무시하고 localStorage 로 계속 동작(에러 표면화 없음).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@thinkmap/core'
import {
  DEFAULT_COLUMN_WIDTHS, COLUMN_WIDTH_KEYS, COLUMN_WIDTH_MIN, COLUMN_WIDTH_MAX, COLUMN_WIDTHS_KEY,
} from '../config/seatSettings'

const clamp = (px) => Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, Math.round(px)))

const cloneDefault = () => ({
  landscape: { ...DEFAULT_COLUMN_WIDTHS.landscape },
  portrait: { ...DEFAULT_COLUMN_WIDTHS.portrait },
})

function mergeMode(mode, saved) {
  const out = { ...DEFAULT_COLUMN_WIDTHS[mode] }
  for (const k of COLUMN_WIDTH_KEYS) {
    if (typeof saved?.[k] === 'number') out[k] = clamp(saved[k])
  }
  return out
}

// 임의 저장값({landscape,portrait} 형태)을 기본값 위에 안전 병합.
function sanitize(saved) {
  return {
    landscape: mergeMode('landscape', saved?.landscape),
    portrait: mergeMode('portrait', saved?.portrait),
  }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_KEY)
    if (!raw) return cloneDefault()
    return sanitize(JSON.parse(raw))
  } catch {
    return cloneDefault()
  }
}

export function useColumnWidths(session) {
  const [widths, setWidths] = useState(loadLocal)
  const loggedIn = !!session?.user?.id

  // 로그인 시: 서버(그 매장 워크스페이스 행)에서 읽어 덮어쓴다(있을 때만). 실패는 무시(localStorage 유지).
  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    supabase
      .from('seat_workspace_prefs')
      .select('prefs')
      .maybeSingle() // RLS 가 내 워크스페이스 행만 반환
      .then(({ data, error }) => {
        if (cancelled || error || !data?.prefs?.columnWidths) return
        setWidths(sanitize(data.prefs.columnWidths))
      })
    return () => { cancelled = true }
  }, [loggedIn])

  // 저장: localStorage 항상 + (로그인) 서버 디바운스 RPC(current_workspace() 로 upsert).
  useEffect(() => {
    try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths)) } catch { /* noop */ }
    if (!loggedIn) return
    const t = setTimeout(() => {
      supabase
        .rpc('seat_save_workspace_prefs', { p_prefs: { columnWidths: widths } })
        .then(() => {}, () => {}) // 실패 무시(localStorage 로 계속 동작)
    }, 500)
    return () => clearTimeout(t)
  }, [widths, loggedIn])

  // mode = 'landscape' | 'portrait'
  const setWidth = useCallback((mode, key, px) => {
    setWidths((prev) => ({ ...prev, [mode]: { ...prev[mode], [key]: clamp(px) } }))
  }, [])

  const resetWidths = useCallback(() => setWidths(cloneDefault()), [])

  return { widths, setWidth, resetWidths }
}
