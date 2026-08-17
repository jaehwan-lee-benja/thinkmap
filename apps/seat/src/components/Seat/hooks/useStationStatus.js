// 스테이션 진행 데이터 훅 — fetch + Realtime + upsert. 카이막/커피 독립(R6). (SEAT-SPEC §8)
// businessDate 가 falsy 면(미리보기 등) 네트워크/구독을 하지 않는다.
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@thinkmap/core'
import { saveErrorMessage } from './useSeatOrders'
import { useRealtimeSync } from './useRealtimeSync'

// (order, station) 행 고유키 — UNIQUE(order_id, station) 대응.
const rowKey = (orderId, station) => `${orderId}:${station}`

export function useStationStatus(businessDate, onError) {
  const [stations, setStations] = useState([])
  // ★주문 훅과 같은 이유·같은 모양(2026-08-17 단일점 ②). 스테이션 화면의 「— 대기 없음 —」도
  //   읽기 실패와 구별되지 않았다 — 카이막/커피 태블릿에서는 이게 «올릴 것이 없다»로 읽힌다.
  const [loadError, setLoadError] = useState(null)
  const [loadedAt, setLoadedAt] = useState(null)
  const mountedRef = useRef(true)
  // 저장 대기 중인 행 키 → 미결 쓰기 수. 편집 중(변동사항 입력) 행을 refetch clobber 로부터 보호.
  const pendingRef = useRef(new Map())

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!businessDate) return
    try {
      const { data, error } = await supabase
        .from('seat_station_status')
        .select('*')
        .eq('business_date', businessDate)
      if (error) throw error
      if (!mountedRef.current) return
      setLoadError(null)
      setLoadedAt(Date.now())
      // 저장 대기 중인 행은 로컬 낙관값 유지, 그 외는 DB값 반영. 아직 커밋 전인 대기 행은 보존.
      setStations((prev) => {
        const prevByKey = new Map(prev.map((s) => [rowKey(s.order_id, s.station), s]))
        const merged = (data || []).map((row) => {
          const k = rowKey(row.order_id, row.station)
          return pendingRef.current.has(k) ? (prevByKey.get(k) || row) : row
        })
        const seen = new Set(merged.map((s) => rowKey(s.order_id, s.station)))
        prev.forEach((s) => {
          const k = rowKey(s.order_id, s.station)
          if (pendingRef.current.has(k) && !seen.has(k)) merged.push(s) // upsert 커밋 전 로컬 행 유실 방지
        })
        return merged
      })
    } catch (e) {
      console.error('useStationStatus.refetch', e)
      if (mountedRef.current) setLoadError(e || new Error('read failed'))
    }
  }, [businessDate])

  useEffect(() => { refetch() }, [refetch])

  // 주문 훅과 **같은 세 겹**(단일점 ①) — 구현을 한 벌로 모았다. 스테이션만 한 겹으로 남으면
  //   카이막/커피 태블릿에서 「올림 없음」이 멈춘 채 굳는다(주방 입장에선 «할 일 없음»으로 읽힌다).
  const { status: syncStatus } = useRealtimeSync({
    channel: 'seat_stations', table: 'seat_station_status', businessDate, refetch,
  })

  // (order, station) 행 upsert — workspace_id 는 DB 트리거가 부모 order 에서 강제.
  // 낙관적 로컬 갱신 + 저장 대기 마킹으로 변동사항 입력 유실을 막는다.
  const patchStation = useCallback(async (orderId, station, patch) => {
    if (!businessDate || !station) return
    const payload = { order_id: orderId, station, business_date: businessDate, ...patch }
    if (patch.completed && !patch.completed_at) payload.completed_at = new Date().toISOString()
    const localPatch = { ...patch, ...(payload.completed_at ? { completed_at: payload.completed_at } : {}) }
    if (mountedRef.current) setStations((prev) => {
      const idx = prev.findIndex((s) => s.order_id === orderId && s.station === station)
      if (idx === -1) return [...prev, payload]
      const next = prev.slice(); next[idx] = { ...next[idx], ...localPatch }; return next
    })
    const p = pendingRef.current
    const k = rowKey(orderId, station)
    p.set(k, (p.get(k) || 0) + 1)
    const { error } = await supabase
      .from('seat_station_status')
      .upsert(payload, { onConflict: 'order_id,station' })
    const n = (p.get(k) || 1) - 1
    if (n > 0) p.set(k, n); else p.delete(k)
    if (error) { console.error('useStationStatus.patch', error); onError?.(saveErrorMessage(error)); refetch() }
  }, [businessDate, refetch, onError])

  return { stations, loadError, loadedAt, syncStatus, refetch, patchStation }
}
