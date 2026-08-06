// 가상 스캔(프리뷰 전용) — 유저 요청 2026-08-06: 「지금은 스캐너가 없으니, 가상의 버튼 하나 만들어줘.」
//
// ★핵심: 결과를 **직접 주입하지 않는다.** 스캐너와 **똑같이 keydown 을 쏜다**(문자 간격 ~0ms + Enter).
//   `doLookup(token)` 을 바로 부르면 편하지만, 그러면 정작 검증하고 싶은 구간
//   (charFromKey · useScanner 의 타이밍 판별 · 번호패드 버스트 가드)을 **통째로 건너뛴다**.
//   즉 이 버튼은 «데모»이자 동시에 **스캔 배선의 실행 테스트**다.
//
// ⚠︎이 모듈은 **동적 import 로만** 불린다(호출부가 `import.meta.env.DEV && PREVIEW` 안에서 import).
//   그래서 프로덕션 번들에 들어가지 않는다.

// previewData 가 심어 둔 고정 토큰과 같은 값(문자열 중복은 감수한다 —
// 여기서 previewData 를 import 하면 UI 가 데이터 목업에 정적 의존하게 된다).
const DEMO = { issued: 'PVDEMOISSUED', redeemed: 'PVDEMOREDEEM', unknown: 'PVDEMOBADTOK' }

// 순환 시나리오 — 한 번 누를 때마다 다음 결과로 넘어간다.
//   `live` = 지금 화면에 발권된 토큰이 있으면 그걸 쓴다(직원이 방금 발권한 걸 그대로 회수해 보는 흐름).
const SEQ = [
  { token: 'live', label: '유효 — 제공 가능' },
  { token: DEMO.redeemed, label: '이미 회수됨' },
  { token: DEMO.unknown, label: '등록되지 않은 티켓' },
  { token: '9' + DEMO.issued.slice(1), label: '숫자로 시작하는 토큰(번호칸 오염 점검)' },
]
let idx = 0

function codeFor(ch) {
  if (ch >= '0' && ch <= '9') return 'Digit' + ch
  return 'Key' + ch
}

// 실제 HID 스캐너처럼 «끊김 없이» 쏜다 — 동기 루프라 간격이 0ms 다.
export function fireVirtualScan(liveToken) {
  const step = SEQ[idx % SEQ.length]
  idx += 1
  const token = step.token === 'live' ? (liveToken || DEMO.issued) : step.token
  for (const ch of token) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, code: codeFor(ch), bubbles: true, cancelable: true }))
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  return { token, label: step.label, next: SEQ[idx % SEQ.length].label }
}
