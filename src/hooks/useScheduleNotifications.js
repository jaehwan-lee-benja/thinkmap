// 캘린더 알림 스케줄러 (활성 탭 한정 — service worker 없이 setTimeout 으로 동작).
//
// 동작:
//   - events 가 갱신될 때마다 (notify_minutes_before 가 있고, 발생 시각이 미래인) 항목들에 대해 setTimeout 큐 생성
//   - 시각이 되면 Notification API 로 표시
//   - 동일 이벤트의 동일 발생시각 중복 알림 방지 (sessionStorage 'schedule.notify.fired')
//
// 한계 — 사용자가 탭을 닫으면 알림 안 옴. 백그라운드 알림은 후속 (service worker / push).

import { useEffect, useRef } from 'react'

const FIRED_KEY = 'schedule.notify.fired'

function getFired() {
  try { return new Set(JSON.parse(sessionStorage.getItem(FIRED_KEY) || '[]')) }
  catch { return new Set() }
}
function markFired(key) {
  try {
    const s = getFired()
    s.add(key)
    // 너무 커지면 앞쪽부터 정리
    const arr = Array.from(s)
    if (arr.length > 500) arr.splice(0, arr.length - 500)
    sessionStorage.setItem(FIRED_KEY, JSON.stringify(arr))
  } catch {}
}

async function ensurePermission() {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const res = await Notification.requestPermission()
  return res === 'granted'
}

function showNotification(title, body) {
  try {
    new Notification(title || '(제목 없음)', { body: body || '', icon: `${import.meta.env.BASE_URL}favicon.ico` })
  } catch (err) { console.warn('Notification 실패:', err) }
}

/**
 * @param events  schedule_events 배열 (현재 fetch 된 것). notify_minutes_before 가 있는 항목만 스케줄.
 * @param enabled boolean — false 면 아예 스케줄 안 함 (설정 OFF)
 */
export function useScheduleNotifications({ events, enabled = true }) {
  const timeoutsRef = useRef([])

  useEffect(() => {
    // 기존 큐 해제
    timeoutsRef.current.forEach(t => clearTimeout(t))
    timeoutsRef.current = []
    if (!enabled || !events) return

    // 권한 요청은 첫 알림 대상이 있을 때만 (UX 부담 줄임)
    const hasNotify = events.some(e => e.notify_minutes_before != null)
    if (!hasNotify) return

    let cancelled = false
    ensurePermission().then(ok => {
      if (cancelled || !ok) return
      const fired = getFired()
      const now = Date.now()
      events.forEach(e => {
        if (e.notify_minutes_before == null) return
        const start = new Date(e.start_at).getTime()
        const fireAt = start - e.notify_minutes_before * 60_000
        // 이미 지났거나 24시간 이후면 스킵
        if (fireAt <= now) return
        if (fireAt - now > 24 * 60 * 60 * 1000) return
        const key = `${e.id}:${e.start_at}`
        if (fired.has(key)) return

        const tid = setTimeout(() => {
          showNotification(
            e.title || '(제목 없음)',
            `${e.notify_minutes_before === 0 ? '지금' : e.notify_minutes_before + '분 전'} — ${new Date(e.start_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
          )
          markFired(key)
        }, fireAt - now)
        timeoutsRef.current.push(tid)
      })
    })

    return () => { cancelled = true }
  }, [JSON.stringify(events?.map(e => `${e.id}:${e.start_at}:${e.notify_minutes_before}`)), enabled])

  useEffect(() => {
    return () => { timeoutsRef.current.forEach(t => clearTimeout(t)); timeoutsRef.current = [] }
  }, [])
}
