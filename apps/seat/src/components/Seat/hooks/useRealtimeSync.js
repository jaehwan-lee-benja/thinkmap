// 실시간 동기화 — ★세 겹(2026-08-17 자가감사 단일점 ①). (SEAT-SPEC §8.2)
//
// 전에는 **한 겹이었다**: `postgres_changes` 구독 하나 + `.subscribe()` 의 반환을 아무도 보지 않음.
//   구독이 조용히 죽으면(태블릿 절전 복귀·와이파이 전환·서버 순단) 화면은 끊긴 시점의 스냅샷을
//   **최신인 얼굴로** 계속 보여줬다. 주방에서는 「올릴 게 없네」로 읽힌다.
//   단일점 ②(읽기 실패가 「없음」으로 착지)와 **같은 형태**다 — 다른 건 «비었다»가 아니라 «멈췄다»는 것뿐.
//
// 겹:
//   ⑴ Realtime — 즉시(1~2초, R7). 이벤트는 250ms 디바운스로 묶는다(타이핑 중 self-write 폭주 방지).
//   ⑵ 사건 — `visibilitychange`(태블릿을 깨움) · `online`(네트워크 복귀) 때 **즉시 맞춘다**.
//       키오스크 태블릿은 하루에도 몇 번 잠들고, 잠든 사이 구독은 대체로 죽는다.
//   ⑶ 폴링 — POLL_MS 마다 refetch. ★**바닥선**이다: ⑴⑵가 전부 실패해도 화면은 그 시간 이상 낡지 않는다.
//       화면이 꺼져 있으면(hidden) 건너뛴다 — 안 보는 화면을 위해 요청하지 않는다(⑵가 복귀 때 메운다).
// ★겹을 세는 이유는 **어느 한 겹도 믿지 않기 위해서**다.
//
// 두 가지 순서 규율(둘 다 어기면 단일점이 되살아난다):
//   · 리스너·폴링을 **먼저** 걸고 마지막에 구독한다 — 구독 설정이 던져도 ⑵⑶은 살아 있어야 한다.
//   · 상태 판단은 이 파일에 두지 않는다 — `syncTransition`(순수 함수, utils/seatLoadState.js)이 정하고
//     여기서는 그 결과를 **집행만** 한다. 그래야 「겹을 세 개 만들었다」가 서술이 아니라 시험이 된다.
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@thinkmap/core'
import { syncTransition, backoffMs, POLL_MS } from '../utils/seatLoadState'

const DEBOUNCE_MS = 250

/**
 * @param {object} p
 * @param {string} p.channel        채널 이름 접두(예: 'seat_orders') — `${channel}:${businessDate}`
 * @param {string} p.table          구독 테이블
 * @param {string|null} p.businessDate  falsy 면 아무것도 하지 않는다(프리뷰·미리보기)
 * @param {Function} p.refetch      전체 재조회. 신원이 바뀌어도 **재구독하지 않는다**(ref 경유).
 * @returns {{ status: 'off'|'connecting'|'live'|'retrying' }}
 */
export function useRealtimeSync({ channel, table, businessDate, refetch }) {
  const [status, setStatus] = useState('off')
  // refetch 는 businessDate 가 바뀔 때마다 신원이 바뀐다 — ref 로 받아 재구독을 유발하지 않게 한다.
  const refetchRef = useRef(refetch)
  useEffect(() => { refetchRef.current = refetch }, [refetch])

  useEffect(() => {
    if (!businessDate) { setStatus('off'); return undefined }

    let disposed = false
    let ch = null
    let debounce = null
    let retryTimer = null
    let machine = { status: 'off', attempt: 0 } // syncTransition 이 굴리는 상태(이 효과 안에서만 산다)

    const doRefetch = () => { if (!disposed) refetchRef.current?.() }
    const kick = () => { // Realtime 이벤트 → 디바운스된 재조회
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(doRefetch, DEBOUNCE_MS)
    }

    /** 이벤트를 상태 기계에 넣고 **결과를 집행**한다. 판단은 여기 없다. */
    const dispatch = (event) => {
      if (disposed) return
      const prevAttempt = machine.attempt
      const next = syncTransition(machine, event)
      machine = { status: next.status, attempt: next.attempt }
      setStatus(next.status)
      if (next.refetch) doRefetch()
      if (next.reconnect) {
        // 'down' 이면 백오프를 두고, 'wake'(사람이 보고 있다)면 지체 없이.
        scheduleReconnect(event === 'down' ? backoffMs(prevAttempt) : 0)
      }
    }

    const scheduleReconnect = (ms) => {
      if (retryTimer || disposed) return
      retryTimer = setTimeout(() => { retryTimer = null; connect() }, ms)
    }

    // ── ⑶ 폴링(바닥선) — 구독보다 **먼저** 건다.
    const poll = setInterval(() => {
      if (disposed) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      doRefetch()
    }, POLL_MS)

    // ── ⑵ 깨어남·네트워크 복귀
    const onWake = () => {
      if (disposed) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      dispatch('wake')
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onWake)
    if (typeof window !== 'undefined') window.addEventListener('online', onWake)

    // ── ⑴ Realtime
    function connect() {
      if (disposed) return
      if (ch) { supabase.removeChannel(ch); ch = null }
      dispatch('connect')
      try {
        ch = supabase
          .channel(`${channel}:${businessDate}`)
          .on('postgres_changes', { event: '*', schema: 'public', table, filter: `business_date=eq.${businessDate}` }, kick)
          .subscribe((st) => {
            if (st === 'SUBSCRIBED') dispatch('subscribed')
            else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') dispatch('down')
          })
      } catch (e) {
        // 구독 설정이 던져도 ⑵⑶은 계속 돈다 — 여기서 throw 하면 폴링까지 죽는다(= 단일점 부활).
        console.error('useRealtimeSync.connect', e)
        dispatch('down')
      }
    }

    connect()

    return () => {
      disposed = true
      clearInterval(poll)
      if (debounce) clearTimeout(debounce)
      if (retryTimer) clearTimeout(retryTimer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onWake)
      if (typeof window !== 'undefined') window.removeEventListener('online', onWake)
      if (ch) supabase.removeChannel(ch)
    }
  }, [channel, table, businessDate])

  return { status }
}
