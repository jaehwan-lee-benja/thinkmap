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

const GAP_MS = 300      // 이보다 길게 끊기면 «사람»으로 보고 버린다
const MIN_LEN = 12      // 우리 토큰 길이(0018 규격)

export function useScanner(onScan, enabled = true) {
  const bufRef = useRef('')
  const lastRef = useRef(0)
  const cbRef = useRef(onScan)
  cbRef.current = onScan

  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e) => {
      const now = Date.now()
      if (now - lastRef.current > GAP_MS) bufRef.current = ''
      lastRef.current = now
      const code = e.code || ''
      if (code === 'Enter' || code === 'NumpadEnter' || (!code && e.key === 'Enter')) {
        const v = bufRef.current
        bufRef.current = ''
        // ★길이 미달이면 아무것도 하지 않는다 — 직원이 검색창에서 누른 Enter 를 가로채지 않는다.
        if (v.length >= MIN_LEN) { e.preventDefault(); cbRef.current && cbRef.current(v) }
        return
      }
      const ch = charFromKey(e)
      if (ch) bufRef.current = (bufRef.current + ch).slice(0, 32)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled])
}
