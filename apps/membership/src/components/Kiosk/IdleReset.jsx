// 무조작 자동 복귀 — 키오스크 방치 시 첫 화면으로(개인 조회결과·입력 잔류 방지).
//   기본 120초 무조작 → 마지막 15초 경고 카운트다운 → window 'mk-idle-reset' 이벤트 발화
//   (CustomerView 가 받아 상태 리셋 = 첫 화면. 리로드 아님 — 네트워크/자산 재로드 없음).
//   시간 조정: URL ?idle=초 (0=끔). 터치/키/포인터 어느 입력이든 타이머 리셋.
//   구형 WebView 호환: 최신 문법·API 없이 작성(이벤트 리스너+setInterval).
import { useState, useEffect } from 'react'

const WARN_SEC = 15

function readIdleSec() {
  try {
    const m = /[?&]idle=(\d+)/.exec(window.location.search)
    if (m) return parseInt(m[1], 10)
  } catch (e) { /* noop */ }
  return 120 // 기본 120초(유저 선택값 대기 — 90~120 제안 중 안전측)
}

export const IDLE_RESET_EVENT = 'mk-idle-reset'

// ★armed=false 면 **타이머를 아예 무장하지 않는다**(2026-08-06 결함: 첫 화면인데도 «몇 초 후
//   첫 화면으로 갑니다»가 떴다 — 되돌릴 것이 없는 화면에서 카운트다운은 손님을 불안하게만 한다).
//   «무엇이 홈인가»의 판단은 상태를 아는 쪽(CustomerView)이 한다 — 여기서 추측하지 않는다.
export default function IdleReset({ enabled, armed = true }) {
  const [remain, setRemain] = useState(-1) // -1=경고 아님, 0~WARN_SEC=카운트다운

  useEffect(() => {
    if (!enabled || !armed) { setRemain(-1); return undefined }
    const idleSec = readIdleSec()
    if (!idleSec) return undefined

    let last = Date.now()
    const bump = function () { last = Date.now() }
    const evs = ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'input']
    for (let i = 0; i < evs.length; i++) window.addEventListener(evs[i], bump, true)

    const t = setInterval(function () {
      const idle = Math.floor((Date.now() - last) / 1000)
      const left = idleSec - idle
      if (left <= 0) {
        last = Date.now()
        setRemain(-1)
        try { window.dispatchEvent(new Event(IDLE_RESET_EVENT)) } catch (e) {
          // 구형(Event 생성자 미지원) 폴백
          const ev = document.createEvent('Event'); ev.initEvent(IDLE_RESET_EVENT, false, false)
          window.dispatchEvent(ev)
        }
      } else if (left <= WARN_SEC) {
        setRemain(left)
      } else {
        setRemain(-1)
      }
    }, 1000)

    return function () {
      clearInterval(t)
      for (let i = 0; i < evs.length; i++) window.removeEventListener(evs[i], bump, true)
    }
  }, [enabled, armed])

  if (remain < 0) return null
  return (
    <div className="mk-idle-warn" aria-live="polite">
      {remain}초 후 처음 화면으로 돌아갑니다 — 계속하시려면 화면을 터치하세요.
    </div>
  )
}
