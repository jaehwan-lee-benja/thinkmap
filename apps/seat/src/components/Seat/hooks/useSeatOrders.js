// 자리후 주문 데이터 훅 — fetch + Realtime(postgres_changes) + CRUD. (SEAT-SPEC §8)
// businessDate 가 falsy 면(미리보기 등) 네트워크/구독을 하지 않는다.
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@thinkmap/core'

export function useSeatOrders(businessDate) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)
  // 저장 대기(in-flight write) 중인 행 id → 미결 쓰기 수. 편집 중 행을 refetch clobber 로부터 보호.
  const pendingRef = useRef(new Map())

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
      if (!mountedRef.current) return
      // 저장 대기 중인(=타이핑 방금 끝난) 행은 로컬 낙관값 유지 → 뒷글자 유실 방지.
      // 그 외 행/삽입/삭제는 DB값을 그대로 반영(last-write-wins, 다른 역할 변경 즉시 보임).
      setOrders((prev) => {
        const prevById = new Map(prev.map((o) => [o.id, o]))
        return (data || []).map((row) =>
          pendingRef.current.has(row.id) ? (prevById.get(row.id) || row) : row
        )
      })
    } catch (e) {
      console.error('useSeatOrders.refetch', e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [businessDate])

  useEffect(() => { refetch() }, [refetch])

  // Realtime: 같은 영업일의 변경을 구독 → 모든 역할 화면 1~2초 내 갱신(R7). last-write-wins.
  // 타이핑 중 self-write 이벤트 폭주를 디바운스로 합쳐 refetch 횟수·경합을 줄인다(250ms ≪ R7 1~2s).
  useEffect(() => {
    if (!businessDate) return
    let timer = null
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { if (mountedRef.current) refetch() }, 250)
    }
    const channel = supabase
      .channel(`seat_orders:${businessDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seat_orders', filter: `business_date=eq.${businessDate}` },
        scheduleRefetch
      )
      .subscribe()
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(channel) }
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

  // 필드 수정(낙관적 갱신 + 실패 시 재조회). 저장 대기 마킹으로 편집 중 clobber 보호.
  const patchOrder = useCallback(async (id, patch) => {
    if (mountedRef.current) setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    const p = pendingRef.current
    p.set(id, (p.get(id) || 0) + 1)
    const { error } = await supabase.from('seat_orders').update(patch).eq('id', id)
    const n = (p.get(id) || 1) - 1
    if (n > 0) p.set(id, n); else p.delete(id)
    if (error) { console.error('useSeatOrders.patch', error); refetch() }
  }, [refetch])

  // 명시 전달 버튼(A안): 'seat'=자리후 확정. seat_delivered=true → 주문서관리 게이팅 해제.
  // ('all'=전체에게 전달은 2026-07-31 제거 — updated_at 만 만지는 no-op 이었고, 필드 수정은
  //  이미 Realtime 으로 즉시 전파된다. 명시 전달은 상태를 바꾸는 관문에만 둔다.)
  const commitOrder = useCallback(async (id, scope) => {
    if (scope !== 'seat') return
    return patchOrder(id, { seat_status: 'pending', seat_delivered: true })
  }, [patchOrder])

  return { orders, loading, refetch, createOrder, patchOrder, commitOrder }
}
