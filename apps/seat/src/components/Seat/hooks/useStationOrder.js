// 스테이션 카드 수동 순서 — ★워크스페이스(매장) 공유. (SEAT-SPEC §11)
//   저장 위치 = seat_workspace_prefs.prefs.stationOrder = { kaymak: [orderId...], coffee: [...] }
//   기존 열 폭과 같은 인프라를 재사용한다(RPC 가 shallow merge 라 columnWidths 를 덮어쓰지 않는다).
//   ★단 stationOrder 키 자체는 통째로 교체되므로, 두 스테이션 맵을 항상 함께 들고 써야 한다.
//   비로그인/프리뷰: 메모리만(서버 접근 없음).
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@thinkmap/core'

const isIdList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')

function sanitize(raw) {
  const out = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) if (isIdList(v)) out[k] = v
  }
  return out
}

export function useStationOrder(session) {
  const [map, setMap] = useState({})
  const loggedIn = !!session?.user?.id
  const skipSaveRef = useRef(true) // 첫 로드(서버값 반영)는 되쓰기하지 않는다

  const reload = useCallback(() => {
    if (!loggedIn) return
    supabase
      .from('seat_workspace_prefs')
      .select('prefs')
      .maybeSingle() // RLS 가 내 워크스페이스 행만 반환
      .then(({ data, error }) => {
        if (error) return
        skipSaveRef.current = true
        setMap(sanitize(data?.prefs?.stationOrder))
      }, () => {}) // 오프라인 등 reject 는 조용히 무시(메모리 순서 유지)
  }, [loggedIn])

  useEffect(() => { reload() }, [reload])

  // 다른 기기(같은 매장)가 순서를 바꾸면 따라온다. ※seat_workspace_prefs 가 Realtime publication 에
  //   등록돼 있어야 동작(migrate-seat-prefs-realtime.sql). 미등록이면 조용히 아무 일도 안 일어난다.
  useEffect(() => {
    if (!loggedIn) return
    const ch = supabase
      .channel('seat_workspace_prefs:order')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seat_workspace_prefs' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loggedIn, reload])

  // 저장 — 맵 전체를 쓴다(stationOrder 키는 통째 교체되므로).
  useEffect(() => {
    if (skipSaveRef.current) { skipSaveRef.current = false; return }
    if (!loggedIn) return
    const t = setTimeout(() => {
      supabase.rpc('seat_save_workspace_prefs', { p_prefs: { stationOrder: map } }).then(() => {}, () => {})
    }, 400)
    return () => clearTimeout(t)
  }, [map, loggedIn])

  // 한 스테이션의 순서를 통째로 교체.
  const setStationOrder = useCallback((stationKey, ids) => {
    if (!stationKey) return
    setMap((prev) => ({ ...prev, [stationKey]: ids }))
  }, [])

  return { stationOrders: map, setStationOrder }
}
