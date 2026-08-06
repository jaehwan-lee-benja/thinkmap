// 전역 바코드 스캐너 리스너 — ★**포커스를 뺏지 않는다.**
//
// 왜(2026-08-06 직원 허브 통합): ScanView 는 전용 입력창에 **800ms마다 포커스를 강제**했다.
//   허브에서 그 방식을 쓰면 조회 번호패드·회원 검색창과 **포커스를 두고 싸운다**(직원이 타이핑하다 글자를 뺏긴다).
//   ⇒ 입력창에 매달리지 말고 **window 에서 «스캐너다운 입력»만 골라낸다.**
//
// 스캐너 ↔ 사람 구분 = **타이밍**. HID 스캐너는 12자를 ~50ms 간격으로 쏟고 Enter 로 끝낸다.
//   사람 타이핑은 훨씬 느리다 ⇒ «연속 입력이 끊기면 버퍼를 버린다» 규칙 하나로 사람 타이핑이
//   스캔으로 오인되지 않는다. 그리고 **preventDefault 를 하지 않아** 검색창 타이핑을 방해하지도 않는다.
import { useEffect, useRef } from 'react'
import { charFromKey } from './scanInput'

// ★«버스트 간격» — 스캐너는 문자 간격이 촘촘하고 사람 타이핑은 그렇지 않다.
//   번호패드도 **같은 상수**를 쓴다(NumberPad.js) — 두 곳이 다른 값을 쓰면 한쪽이 먹은 걸 다른 쪽이 못 알아본다.
export const BURST_GAP_MS = 80
const MIN_LEN = 12      // 우리 토큰 길이(0018 규격)
const MAX_BUF = 48

export function useScanner(onScan, enabled = true) {
  const bufRef = useRef([])          // [{ ch, at }] — 문자와 그 시각
  const cbRef = useRef(onScan)
  cbRef.current = onScan

  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e) => {
      const now = Date.now()
      const code = e.code || ''
      if (code === 'Enter' || code === 'NumpadEnter' || (!code && e.key === 'Enter')) {
        const arr = bufRef.current
        bufRef.current = []
        // ★뒤에서부터 «간격이 촘촘하게 이어지는 구간»만 취한다(2026-08-06 교정).
        //   종전엔 «300ms 넘게 끊기면 버퍼를 버린다» 하나였는데, 그러면
        //   **직원이 번호를 타이핑한 직후(300ms 안)에 바코드를 쏘면 타이핑한 숫자가 토큰 앞에 붙어**
        //   «등록되지 않은 티켓»이 떴다(실증). 현장에서는 «쿠폰이 가짜»로 읽혀 손님이 팝콘을 못 받는다.
        //   ⇒ 앞을 자르는 기준을 «시간 경과»가 아니라 **«입력 리듬의 단절»** 로 바꾼다.
        let i = arr.length - 1
        while (i > 0 && arr[i].at - arr[i - 1].at <= BURST_GAP_MS) i -= 1
        const run = arr.slice(i).map((x) => x.ch).join('')
        // ★길이 미달이면 아무것도 하지 않는다 — 직원이 검색창에서 누른 Enter 를 가로채지 않는다.
        if (run.length >= MIN_LEN) { e.preventDefault(); cbRef.current && cbRef.current(run) }
        return
      }
      const ch = charFromKey(e)
      if (ch) {
        bufRef.current.push({ ch, at: now })
        if (bufRef.current.length > MAX_BUF) bufRef.current.shift()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled])
}
