// 스테이션 진행 데이터 훅 — fetch + Realtime + upsert. 카이막/커피 독립(R6). (SEAT-SPEC §8)
// businessDate 가 falsy 면(미리보기 등) 네트워크/구독을 하지 않는다.
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../supabaseClient'

export function useStationStatus(businessDate) {
  const [stations, setStations] = useState([])
  const mountedRef = useRef(true)

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
      if (mountedRef.current) setStations(data || [])
    } catch (e) {
      console.error('useStationStatus.refetch', e)
    }
  }, [businessDate])

  useEffect(() => { refetch() }, [refetch])

  useEffect(() => {
    if (!businessDate) return
    const channel = supabase
      .channel(`seat_stations:${businessDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seat_station_status', filter: `business_date=eq.${businessDate}` },
        () => { if (mountedRef.current) refetch() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [businessDate, refetch])

  // (order, station) 행 upsert — workspace_id 는 DB 트리거가 부모 order 에서 강제.
  const patchStation = useCallback(async (orderId, station, patch) => {
    if (!businessDate || !station) return
    const payload = { order_id: orderId, station, business_date: businessDate, ...patch }
    if (patch.completed && !patch.completed_at) payload.completed_at = new Date().toISOString()
    const { error } = await supabase
      .from('seat_station_status')
      .upsert(payload, { onConflict: 'order_id,station' })
    if (error) { console.error('useStationStatus.patch', error); refetch() }
  }, [businessDate, refetch])

  return { stations, refetch, patchStation }
}
