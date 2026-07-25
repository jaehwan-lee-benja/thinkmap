// 멤버십 키오스크(Membership) 위성 셸 — SITE-SPLIT Phase 6.
// ★인증 모델(SPEC §5.1, 지휘자 확정 2026-07-24): 매장 태블릿 = "매장 계정"으로 1회 로그인 → 세션 유지.
//   직원은 재로그인 없이 계속 빠르게 사용(같은 origin SSO). 회원 조회(PII)는 이 로그인 뒤에서만 가능하고,
//   실제 권한 게이트(is_master() OR is_store())는 thinkmap 프록시 Edge가 강제한다 — 셸은 "로그인 필요"만 확인.
//   회원 데이터·이벤트·가입은 crm 소유(Edge 계약, src/api/membership.js) — 이 위성은 소비자.
import { useAuth } from '@thinkmap/core'
import MembershipKiosk from './components/Kiosk/MembershipKiosk'

export default function MembershipApp() {
  const { session, authLoading, handleGoogleLogin } = useAuth()

  if (authLoading) return <div className="pv-center">로딩 중…</div>

  // 모선 복귀 링크 제거 — 매장 고정 단말이라 모선 이동 불필요(유저결정 2026-07-25).
  if (!session) return (
    <div className="pv-center pv-login">
      <h1>멤버십 키오스크</h1>
      <p>매장 계정으로 로그인하세요.</p>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
    </div>
  )

  // 로그인 후 = 풀스크린 키오스크(.mk-app 이 fixed inset:0). 모드 전환·데이터는 MembershipKiosk 내부.
  return <MembershipKiosk session={session} />
}
