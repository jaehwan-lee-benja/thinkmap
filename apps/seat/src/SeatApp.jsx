// 자리후(Seat) 위성 셸 — SITE-SPLIT Phase 4.
// 자리후는 page 독립(seat_orders/seat_station_status = 워크스페이스 스코프, pageId 불필요)이고
// 마스터 전용이 아니다(SEAT-SPEC: 워크스페이스 editor 진입, 4역할). 테넌시·권한은 DB RLS(can_in_workspace)가 강제 →
// 셸은 로그인만 확인하고 SeatSystemPage 에 session 을 넘긴다(모선에서의 기존 동작과 동일). 본 UI는 풀스크린 키오스크.
import { useAuth } from '@thinkmap/core'
import SeatSystemPage from './components/Seat/SeatSystemPage'

// 모선(Hub) base — 같은 origin 형제 서브경로.
const HUB_BASE = import.meta.env.VITE_HUB_BASE || '/thinkmap/'

export default function SeatApp() {
  const { session, authLoading, handleGoogleLogin } = useAuth()

  if (authLoading) return <div className="pv-center">로딩 중…</div>

  if (!session) return (
    <div className="pv-center pv-login">
      <h1>자리후</h1>
      <p>ThinkMap 계정으로 로그인하세요.</p>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
      <a href={HUB_BASE}>← 모선</a>
    </div>
  )

  // 로그인 후 = 풀스크린 키오스크(.seat-app 이 fixed inset:0). 역할 전환·데이터는 SeatSystemPage 내부.
  return <SeatSystemPage session={session} />
}
