import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@thinkmap/core/styles/variables.css'  // 테마 토큰(단일 소스)
import './components/Kiosk/brand.css'         // ★정본 웹폰트(G마켓산스)·팔레트 — 앱 전역 로드(로그인/로딩 포함 통일)
import './index.css'
import MembershipApp from './MembershipApp.jsx'
import MembershipKiosk from './components/Kiosk/MembershipKiosk.jsx'

import { initTheme } from '@thinkmap/core'
initTheme()

// ★손님 폰 티켓 화면(?role=ticket)은 **인증 앞에서 갈라진다** — 엔트리에서 분기한다.
//   왜: 이 화면을 보는 사람은 **고객**이라 매장 계정이 없다. 로그인 게이트 뒤에 두면 영원히 못 연다
//       (헤드리스 검증에서 실제로 이 벽에 막혔다 — 현장에 나갔으면 "QR 찍으면 로그인 화면"이 될 뻔했다).
//   안전한 이유: 이 화면은 **서버를 부르지 않는다**(데이터는 URL 프래그먼트에 자족적으로 들어 있고
//       조회·쓰기가 0). 인증을 요구할 대상 자체가 없고, 회수는 여전히 직원 게이트에서만 일어난다.
//   ※컴포넌트 안에서 조건부 return 하면 훅 순서가 깨지므로(useAuth 앞) 여기서 가른다.
// ★응원 화면(?role=display)도 같은 이유로 인증 앞에서 가른다 — 1차는 서버를 «안 부른다»(모형+쿼리스트링).
//   2차에서 실데이터를 붙일 때 인증 경로를 다시 판단한다(매장 기기 1회 로그인 vs Edge 익명 계약).
const _q = new URLSearchParams(window.location.search)
const _role = _q.get('role')
// ★응원 화면의 인증은 «모드»에 따라 갈린다(2026-08-16, Realtime 안 ㉠ 채택 반영):
//   · 실판(?role=display)      = **게이트 뒤**. store 계정 1회 로그인 — private 브로드캐스트 구독에
//     매장 세션이 필요하고, 그게 키오스크와 동형이라 새 인가 축을 안 만든다.
//   · 모형(?role=display&state=) = 게이트 앞. 서버를 «안 부르므로» 안전하고, 실기기 시각 검증을
//     로그인으로 막지 않는다. 유저가 지금 이 URL 로 글씨 크기를 보고 있다 — 깨뜨리지 않는다.
const isDisplayMock = _role === 'display' && _q.has('state')
const isTicket = _role === 'ticket' || isDisplayMock

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isTicket ? <MembershipKiosk session={null} /> : <MembershipApp />}
  </StrictMode>,
)

// ★부팅 오버레이(index.html 인라인) 제거 — **첫 화면이 실제로 그려진 뒤에** 걷는다.
//   render() 직후에 바로 지우면 커밋~페인트 사이에 하얀 프레임이 보인다(방어의 취지가 무너진다).
//   rAF 두 번 = «커밋 반영된 프레임이 한 번 그려진 뒤». 함수는 멱등이라 두 번 불려도 안전하다.
function dropBoot() { if (window.__mkBootDone) window.__mkBootDone() }
if (typeof requestAnimationFrame === 'function') {
  requestAnimationFrame(function () { requestAnimationFrame(dropBoot) })
} else {
  setTimeout(dropBoot, 60)
}
