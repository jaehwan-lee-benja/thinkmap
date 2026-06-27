// 자리후 주문 데이터 훅 — fetch + Realtime(postgres_changes) + CRUD. (SEAT-SPEC §8)
// businessDate 가 falsy 면(미리보기 등) 네트워크/구독을 하지 않는다.
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../supabaseClient'

export function useSeatOrders(businessDate) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!businessDate) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('seat_orders')
        .select('*')
        .eq('business_date', businessDate)
        .is('deleted_at', null)
        .order('queue_no', { ascending: true })
      if (error) throw error
      if (mountedRef.current) setOrders(data || [])
    } catch (e) {
      console.error('useSeatOrders.refetch', e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [businessDate])

  useEffect(() => { refetch() }, [refetch])

  // Realtime: 같은 영업일의 변경을 구독 → 모든 역할 화면 1~2초 내 갱신(R7). last-write-wins.
  useEffect(() => {
    if (!businessDate) return
    const channel = supabase
      .channel(`seat_orders:${businessDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seat_orders', filter: `business_date=eq.${businessDate}` },
        () => { if (mountedRef.current) refetch() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [businessDate, refetch])

  // 새 주문 행 생성(queue_no·workspace_id 는 DB 트리거가 부여)
  const createOrder = useCallback(async (draft = {}) => {
    if (!businessDate) return null
    const { data, error } = await supabase
      .from('seat_orders')
      .insert({ business_date: businessDate, ...draft })
      .select()
      .single()
    if (error) { console.error('useSeatOrders.create', error); return null }
    if (mountedRef.current) {
      setOrders((prev) => [...prev, data].sort((a, b) => (a.queue_no || 0) - (b.queue_no || 0)))
    }
    return data
  }, [businessDate])

  // 필드 수정(낙관적 갱신 + 실패 시 재조회)
  const patchOrder = useCallback(async (id, patch) => {
    if (mountedRef.current) setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    const { error } = await supabase.from('seat_orders').update(patch).eq('id', id)
    if (error) { console.error('useSeatOrders.patch', error); refetch() }
  }, [refetch])

  // 명시 전달 버튼(A안): 'seat'=자리후 확정 / 'all'=전체에게 전달(touch→Realtime 재발사)
  const commitOrder = useCallback(async (id, scope) => {
    if (scope === 'seat') return patchOrder(id, { seat_status: 'pending' })
    return patchOrder(id, { updated_at: new Date().toISOString() })
  }, [patchOrder])

  return { orders, loading, refetch, createOrder, patchOrder, commitOrder }
}
