// CRM 보드 위성 셸 — SITE-SPLIT §12 Phase7.
// CRM 운영보드는 **마스터 전용**(재무·경영 지표). 셸이 로그인+마스터를 확인하고 CrmBoardPage 에 session 을 넘긴다.
// crm_metrics·engine-metrics-sync Edge 는 같은 Supabase라 그대로 동작(재배치 불필요).
// ※ PII 통로(FDW A3+B2+C1)는 위성화 후 이 위성 위에 부착 예정(현재 미배선).
import { useAuth } from '@thinkmap/core'
import CrmBoardPage from './components/CrmBoard/CrmBoardPage'

// 모선(Hub) base — 같은 origin 형제 서브경로.
const HUB_BASE = import.meta.env.VITE_HUB_BASE || '/thinkmap/'

export default function CrmBoardApp() {
  const { session, authLoading, isMaster, handleGoogleLogin } = useAuth()

  if (authLoading) return <div className="pv-center">로딩 중…</div>

  if (!session) return (
    <div className="pv-center pv-login">
      <h1>CRM 보드</h1>
      <p>ThinkMap 계정으로 로그인하세요.</p>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
      <a href={HUB_BASE}>← 모선</a>
    </div>
  )

  // 마스터 전용 게이트 — 비마스터는 진입 거부(모선 App.jsx 의 crmboard 분기와 동일 정책).
  if (!isMaster) return (
    <div className="pv-center pv-login">
      <h1>CRM 보드</h1>
      <p>마스터 전용 화면입니다.</p>
      <a href={HUB_BASE}>← 모선</a>
    </div>
  )

  return <CrmBoardPage session={session} />
}
