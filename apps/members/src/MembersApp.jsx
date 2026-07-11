// 멤버(Members) 위성 셸 — SITE-SPLIT Phase 5.
// 멤버 관리(인사 마스터)는 마스터 전용(MEMBER-SPEC §7.1) · page 독립(멤버 데이터는 member_* 테이블).
// 분할 전엔 모선 사이드바 isMaster 게이트 뒤 + App 의 !isMaster 거부에 있었으나, 위성 독립 URL엔
// 그 게이트가 없으므로 payroll 위성과 동일하게 셸 단에서 막는다.
// member 도메인 공유모듈(useMembers/sortMembers/rosterPresets)은 @thinkmap/core 에서 온다(모선 roster 와 공유).
import { useAuth } from '@thinkmap/core'
import MembersPage from './components/Members/MembersPage'

const HUB_BASE = import.meta.env.VITE_HUB_BASE || '/thinkmap/'

export default function MembersApp() {
  const { session, authLoading, isMaster, handleGoogleLogin, handleLogout } = useAuth()

  if (authLoading) return <div className="pv-center">로딩 중…</div>

  if (!session) return (
    <div className="pv-center pv-login">
      <h1>멤버 관리</h1>
      <p>ThinkMap 계정으로 로그인하세요.</p>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
    </div>
  )

  if (!isMaster) return (
    <div className="pv-center">
      <p>접근 권한이 없습니다. (마스터 전용)</p>
      <a className="pv-back" href={HUB_BASE}>← 모선으로</a>
    </div>
  )

  return (
    <div className="pv-root">
      <header className="pv-topbar">
        <a className="pv-back" href={HUB_BASE}>← 모선</a>
        <span className="pv-title">멤버 관리</span>
        <button className="pv-logout" onClick={handleLogout}>로그아웃</button>
      </header>
      <main className="pv-main">
        <MembersPage session={session} isMaster={isMaster} />
      </main>
    </div>
  )
}
