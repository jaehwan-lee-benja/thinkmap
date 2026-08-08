// 무조작 자동 복귀 — 키오스크 방치 시 첫 화면으로(개인 조회결과·입력 잔류 방지).
//   기본 120초 무조작 → 마지막 15초 경고 카운트다운 → window 'mk-idle-reset' 이벤트 발화
//   (CustomerView 가 받아 상태 리셋 = 첫 화면. 리로드 아님 — 네트워크/자산 재로드 없음).
//   시간 조정: URL ?idle=초 (0=끔). 터치/키/포인터 어느 입력이든 타이머 리셋.
//   구형 WebView 호환: 최신 문법·API 없이 작성(이벤트 리스너+setInterval).
import { useState, useEffect } from 'react'

const WARN_SEC = 15

function readIdleSec(fallback) {
  try {
    const m = /[?&]idle=(\d+)/.exec(window.location.search)
    if (m) return parseInt(m[1], 10)   // URL 지정이 있으면 그게 최우선(현장 조정용)
  } catch (e) { /* noop */ }
  return fallback
}

export const IDLE_RESET_EVENT = 'mk-idle-reset'

// ★armed=false 면 **타이머를 아예 무장하지 않는다**(2026-08-06 결함: 첫 화면인데도 «몇 초 후
//   첫 화면으로 갑니다»가 떴다 — 되돌릴 것이 없는 화면에서 카운트다운은 손님을 불안하게만 한다).
//   «무엇이 홈인가»의 판단은 상태를 아는 쪽(CustomerView)이 한다 — 여기서 추측하지 않는다.
// ★sec/warn 을 프롭으로 뺀다(2026-08-08): 화면마다 «적당한 시간»이 다르다.
//   조회 결과 = 10초(유저 지시 — 남의 정보가 떠 있는 화면이라 짧아야 한다)
//   가입 폼    = 120초(타이핑 중에 날아가면 안 된다)
//   ⚠하나로 묶으면 반드시 한쪽이 망가진다 — 그래서 상위가 정한다.
export default function IdleReset({ enabled, armed = true, sec = 120, warn = WARN_SEC }) {
  const [remain, setRemain] = useState(-1) // -1=경고 아님, 0~WARN_SEC=카운트다운

  useEffect(() => {
    if (!enabled || !armed) { setRemain(-1); return undefined }
    const idleSec = readIdleSec(sec)
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
      } else if (left <= warn) {
        setRemain(left)
      } else {
        setRemain(-1)
      }
    }, 1000)

    return function () {
      clearInterval(t)
      for (let i = 0; i < evs.length; i++) window.removeEventListener(evs[i], bump, true)
    }
  }, [enabled, armed, sec, warn])

  if (remain < 0) return null
  // ★즉시 복귀 버튼(유저 지시 2026-08-08: 「10초 영역 좋아. 거기에 처음으로 버튼도 넣어줘」).
  //   ★타임아웃과 **같은 경로**로 보낸다(이벤트 발화) — 리셋 로직이 두 벌이 되면 한쪽만 낡는다.
  //   ⚠이 막대는 `position: fixed; bottom:0` 이라 **카드 안의 [처음으로]를 가린다.**
  //     그래서 이 버튼이 «중복»이 아니라 **가려진 것의 대체**다.
  const goHome = () => {
    try { window.dispatchEvent(new Event(IDLE_RESET_EVENT)) } catch (e) {
      const ev = document.createEvent('Event'); ev.initEvent(IDLE_RESET_EVENT, false, false)
      window.dispatchEvent(ev)
    }
  }
  return (
    <div className="mk-idle-warn" aria-live="polite">
      <span className="mk-idle-num">{remain}</span>
      <span className="mk-idle-txt">초 후 처음 화면으로 돌아갑니다<br />계속 보시려면 화면을 터치하세요.</span>
      <button type="button" className="mk-idle-home" onClick={goHome}>처음으로</button>
    </div>
  )
}
