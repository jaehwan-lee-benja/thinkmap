// 자리후 주문 데이터 훅 — fetch + Realtime(postgres_changes) + CRUD. (SEAT-SPEC §8)
// businessDate 가 falsy 면(미리보기 등) 네트워크/구독을 하지 않는다.
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@thinkmap/core'
import { deliverPatch } from '../utils/seatRules'

// 저장 실패 사유 → 직원용 문구(주방에서 멀리서도 읽히게 짧게). UNIQUE 충돌 등 원인별.
export function saveErrorMessage(error) {
  if (error?.code === '23505') return '이미 쓰는 번호입니다'
  if (error?.code === '42501' || error?.code === 'PGRST301') return '권한이 없어 저장 안 됨'
  return '저장 실패 — 다시 시도하세요'
}

export function useSeatOrders(businessDate, onError) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  // ★읽기 실패를 「주문 없음」과 구별하기 위한 두 값(2026-08-17 자가감사 단일점 ②). utils/seatLoadState.js 참조.
  //   loadError = 마지막 읽기가 실패했는가 / loadedAt = 마지막으로 **성공**한 시각(없으면 한 번도 못 읽었다).
  //   둘 다 없으면 화면은 빈 배열만 보고 「주문이 없습니다」라고 말한다 — 고장이 정상 얼굴로 착지한다.
  const [loadError, setLoadError] = useState(null)
  const [loadedAt, setLoadedAt] = useState(null)
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
        .order('created_at', { ascending: true }) // 기본 = 만들어진 순서(번호 없는 줄도 생성순으로 쌓임). 번호순은 '번호 맞춰 정렬' 버튼.
      if (error) throw error
      if (!mountedRef.current) return
      setLoadError(null)
      setLoadedAt(Date.now())
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
      // ★콘솔로 끝내지 않는다 — 주방 태블릿의 콘솔을 보는 사람은 없다. 화면이 말해야 한다.
      //   기존 데이터(loadedAt)가 있으면 그건 그대로 두고 «낡았다»만 알린다(빈 화면으로 되돌리지 않는다).
      if (mountedRef.current) setLoadError(e || new Error('read failed'))
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
    if (error) { console.error('useSeatOrders.create', error); onError?.(saveErrorMessage(error)); return null }
    if (mountedRef.current) {
      // 생성 순서 유지 — 새 주문은 맨 아래에 쌓인다(refetch 의 created_at asc 와 동일).
      setOrders((prev) => [...prev, data])
    }
    return data
  }, [businessDate, onError])

  // 필드 수정(낙관적 갱신 + 실패 시 재조회). 저장 대기 마킹으로 편집 중 clobber 보호.
  const patchOrder = useCallback(async (id, patch) => {
    if (mountedRef.current) setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    const p = pendingRef.current
    p.set(id, (p.get(id) || 0) + 1)
    const { error } = await supabase.from('seat_orders').update(patch).eq('id', id)
    const n = (p.get(id) || 1) - 1
    if (n > 0) {
      p.set(id, n)
    } else {
      // ★완료 후 짧은 유예 동안 보호 유지 — 마지막 글자 직후 도착한 self-write Realtime refetch 가
      //   낙관값(마지막 글자)을 이전 서버값으로 덮어써 '끝 글자 지워짐'이 생기던 것을 막는다.
      p.set(id, 0) // Map key 존재 = has(id) true → refetch 가 이 행을 보호
      setTimeout(() => { if (p.get(id) === 0) p.delete(id) }, 600)
    }
    if (error) { console.error('useSeatOrders.patch', error); onError?.(saveErrorMessage(error)); refetch() }
  }, [refetch, onError])

  // 줄 삭제 = soft delete(deleted_at). refetch 는 deleted_at IS NULL 만 가져와 화면에서 사라진다(DB 복구 가능).
  const deleteOrder = useCallback(async (id) => {
    if (mountedRef.current) setOrders((prev) => prev.filter((o) => o.id !== id)) // 낙관적 제거
    const { error } = await supabase.from('seat_orders').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { console.error('useSeatOrders.delete', error); onError?.(saveErrorMessage(error)); refetch() }
  }, [refetch, onError])

  // 오늘자 초기화 = 오늘 영업일의 살아있는 주문을 전부 soft delete(deleted_at 한 타임스탬프로 묶음).
  //   ★같은 타임스탬프를 되돌리기 키로 반환 → undoResetToday(ts) 가 정확히 그 묶음만 복구한다
  //   (초기화 직후 새로 만든 주문이나 이전에 지운 줄은 건드리지 않는다).
  const resetToday = useCallback(async () => {
    if (!businessDate) return null
    const stamp = new Date().toISOString()
    const ids = orders.map((o) => o.id)
    if (ids.length === 0) return null
    if (mountedRef.current) setOrders([]) // 낙관적 비움
    const { error } = await supabase
      .from('seat_orders')
      .update({ deleted_at: stamp })
      .eq('business_date', businessDate)
      .is('deleted_at', null)
    if (error) { console.error('useSeatOrders.resetToday', error); onError?.(saveErrorMessage(error)); refetch(); return null }
    return stamp
  }, [businessDate, orders, refetch, onError])

  // 초기화 되돌리기 — 그 타임스탬프로 지워진 행만 살린다.
  const undoResetToday = useCallback(async (stamp) => {
    if (!businessDate || !stamp) return
    const { error } = await supabase
      .from('seat_orders')
      .update({ deleted_at: null })
      .eq('business_date', businessDate)
      .eq('deleted_at', stamp)
    if (error) { console.error('useSeatOrders.undoResetToday', error); onError?.(saveErrorMessage(error)) }
    refetch()
  }, [businessDate, refetch, onError])

  // 명시 전달 버튼(A안): 'seat'=자리후 확정. seat_delivered=true → 주문서관리 게이팅 해제.
  // ('all'=전체에게 전달은 2026-07-31 제거 — updated_at 만 만지는 no-op 이었고, 필드 수정은
  //  이미 Realtime 으로 즉시 전파된다. 명시 전달은 상태를 바꾸는 관문에만 둔다.)
  //   extra = 전달과 함께 확정되는 필드(예: deliver_mode='maybe_store' — 포장도고려 전달, R11).
  const commitOrder = useCallback(async (id, scope, extra = {}) => {
    if (scope !== 'seat') return
    // delivered_at = 통계용 전달 시각(주문→전달 / 전달→올림 구간).
    return patchOrder(id, { ...deliverPatch(), ...extra })
  }, [patchOrder])

  return { orders, loading, loadError, loadedAt, refetch, createOrder, patchOrder, commitOrder, deleteOrder, resetToday, undoResetToday }
}
