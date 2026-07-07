import { useAuth } from '@thinkmap/core'
import InventoryPage from './components/Inventory/InventoryPage'

// 모선(Hub) base — 같은 origin 형제 서브경로. "← 모선" 백링크(SSO 자동).
const HUB_BASE = import.meta.env.VITE_HUB_BASE || '/thinkmap/'

// 재고 위성 셸.
// - 재고는 마스터 전용이 아님(로그인 사용자 노출; 세부 권한 게이트는 향후 RLS 결합).
// - 재고 데이터는 page_id 스코프가 아니라 전역·날짜 기준(inventory_products/inventory_days) → pageId 불필요.
export default function InventoryApp() {
  const { session, authLoading, handleGoogleLogin, handleLogout } = useAuth()

  if (authLoading) return <div className="pv-center">로딩 중…</div>

  if (!session) return (
    <div className="pv-center pv-login">
      <h1>재고 관리</h1>
      <p>ThinkMap 계정으로 로그인하세요.</p>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
    </div>
  )

  return (
    <div className="pv-root">
      <header className="pv-topbar">
        <a className="pv-back" href={HUB_BASE}>← 모선</a>
        <span className="pv-title">재고 관리</span>
        <button className="pv-logout" onClick={handleLogout}>로그아웃</button>
      </header>
      <main className="pv-main">
        <InventoryPage session={session} />
      </main>
    </div>
  )
}
