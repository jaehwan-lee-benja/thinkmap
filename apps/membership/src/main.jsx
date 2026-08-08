import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@thinkmap/core/styles/variables.css'  // 테마 토큰(단일 소스)
import './components/Kiosk/brand.css'         // ★정본 웹폰트(G마켓산스)·팔레트 — 앱 전역 로드(로그인/로딩 포함 통일)
import './index.css'
import MembershipApp from './MembershipApp.jsx'
import MembershipKiosk from './components/Kiosk/MembershipKiosk.jsx'
import BuildStamp from './components/Kiosk/BuildStamp.jsx'

import { initTheme } from '@thinkmap/core'
initTheme()

// ★손님 폰 티켓 화면(?role=ticket)은 **인증 앞에서 갈라진다** — 엔트리에서 분기한다.
//   왜: 이 화면을 보는 사람은 **고객**이라 매장 계정이 없다. 로그인 게이트 뒤에 두면 영원히 못 연다
//       (헤드리스 검증에서 실제로 이 벽에 막혔다 — 현장에 나갔으면 "QR 찍으면 로그인 화면"이 될 뻔했다).
//   안전한 이유: 이 화면은 **서버를 부르지 않는다**(데이터는 URL 프래그먼트에 자족적으로 들어 있고
//       조회·쓰기가 0). 인증을 요구할 대상 자체가 없고, 회수는 여전히 직원 게이트에서만 일어난다.
//   ※컴포넌트 안에서 조건부 return 하면 훅 순서가 깨지므로(useAuth 앞) 여기서 가른다.
// ★로그인 왕복에서 `?role=`·`?store=` 를 지켜낸다(2026-08-08).
//   OAuth 복귀 주소에는 쿼리를 못 싣는다 — Supabase 허용목록 매칭이 주소 단위라 쿼리가 붙으면
//   등록 안 된 주소로 취급될 수 있다. 그래서 **떠나기 전에 저장하고 돌아와서 되돌린다.**
//   ⚠︎반드시 **첫 렌더 전**에 해야 한다 — role 을 읽는 쪽(readRoleAndStore)이 렌더 중에 읽는다.
//   (Storage/Edge 서빙으로 옮기며 이 결함이 더 자주 드러난다: 직원이 `?role=staff` 를 북마크한다.)
try {
  const KEY = 'mk-return-search'
  const saved = sessionStorage.getItem(KEY)
  if (saved && !window.location.search) {
    sessionStorage.removeItem(KEY)
    window.history.replaceState(null, '', window.location.pathname + saved + window.location.hash)
  } else if (saved) {
    sessionStorage.removeItem(KEY)   // 쿼리가 살아 있으면 저장분은 버린다(중복 적용 방지)
  }
} catch (e) { /* sessionStorage 불가 환경 — 복원만 포기하고 정상 진행 */ }

const isTicket = new URLSearchParams(window.location.search).get('role') === 'ticket'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isTicket ? <MembershipKiosk session={null} /> : <MembershipApp />}
    {/* ★여기 두면 **로그인 화면·대기 화면·티켓 화면까지 전부** 덮는다 — «지금 화면이 어느 버전인가»는
        키오스크 안에서만 궁금한 게 아니다(로그인 단계에서 구버전에 걸려 있던 적이 있다). */}
    <BuildStamp />
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
