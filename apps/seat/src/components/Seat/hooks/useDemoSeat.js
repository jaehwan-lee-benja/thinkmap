// 프리뷰 전용 — 로컬 메모리 CRUD(로그인·DB·Realtime 없음). 새로고침하면 초기 데모로 리셋.
// live 훅(useSeatOrders/useStationStatus)과 같은 인터페이스를 흉내내 SeatSystemPage 배선을 그대로 쓴다.
import { useState, useRef, useCallback } from 'react'
import { DEMO_ORDERS, DEMO_STATIONS, withOrderDefaults } from '../config/demoData'

export function useDemoSeat(active) {
  const [orders, setOrders] = useState(() => (active ? DEMO_ORDERS : []))
  const [stations, setStations] = useState(() => (active ? DEMO_STATIONS : []))
  const seq = useRef(100) // 새 주문 order_no 시드

  const patchOrder = useCallback((id, patch) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }, [])

  const createOrder = useCallback((draft = {}) => {
    setOrders((prev) => {
      // '+주문번호만' = queue_no null(비움, 실 DB 는 NULL 허용 + 트리거가 자동부여 안 함). 그 외 자동 순번.
      const auto = prev.length ? Math.max(...prev.map((o) => (o.queue_no > 0 ? o.queue_no : 0))) + 1 : 1
      const queue_no = draft.queue_no === null ? null : (draft.queue_no ?? auto)
      const id = `demo-${queue_no}-${seq.current++}`
      return [...prev, withOrderDefaults({ id, ...draft, queue_no })]
    })
  }, [])

  // 명시 전달(A안): 'seat' = 자리후 확정.
  const commitOrder = useCallback((id, scope) => {
    if (scope !== 'seat') return
    patchOrder(id, { seat_status: 'pending', seat_delivered: true })
  }, [patchOrder])

  // 행 순서 재배열(드래그) — 프리뷰는 배열 순서만 바꾼다(queue_no 는 손대지 않음, 표시 순서).
  const reorder = useCallback((fromIdx, toIdx) => {
    setOrders((prev) => {
      if (fromIdx == null || toIdx == null || fromIdx === toIdx) return prev
      const next = prev.slice()
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }, [])

  // 테이블링(queue_no) 오름차순 정렬 — 드래그로 흐트러진 순서를 번호순으로 되돌린다. 빈 번호는 뒤로.
  const sortByNumber = useCallback(() => {
    setOrders((prev) => [...prev].sort(
      (a, b) => (a.queue_no ?? Infinity) - (b.queue_no ?? Infinity)
    ))
  }, [])

  const patchStation = useCallback((orderId, station, patch) => {
    setStations((prev) => {
      const idx = prev.findIndex((s) => s.order_id === orderId && s.station === station)
      const done = patch.completed ? { completed_at: patch.completed_at || new Date().toISOString() } : {}
      if (idx === -1) return [...prev, { order_id: orderId, station, ...patch, ...done }]
      const next = prev.slice()
      next[idx] = { ...next[idx], ...patch, ...done }
      return next
    })
  }, [])

  return { orders, stations, patchOrder, createOrder, commitOrder, patchStation, reorder, sortByNumber }
}
