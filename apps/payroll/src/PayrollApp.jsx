import { useState, useEffect } from 'react'
import { useAuth, supabase } from '@thinkmap/core'
import PayrollPage from './components/Payroll/PayrollPage'

// 모선(Hub) base — 같은 origin 의 형제 서브경로. "모선으로" 백링크에 사용.
// 위성은 SSO(동일 origin localStorage)로 모선과 세션을 공유한다.
const HUB_BASE = import.meta.env.VITE_HUB_BASE || '/thinkmap/'

export default function PayrollApp() {
  const { session, authLoading, isMaster, handleGoogleLogin, handleLogout } = useAuth()
  const [pageId, setPageId] = useState(null)
  const [payrollPages, setPayrollPages] = useState([])
  const [resolving, setResolving] = useState(true)

  // 급여 페이지(pages.page_type='payroll') 목록 로드 + pageId 결정.
  // ?page=<id> 가 유효하면 우선(모선 런처가 넘긴 컨텍스트), 아니면 첫 급여 페이지.
  useEffect(() => {
    if (!session || !isMaster) { setResolving(false); return }
    let cancelled = false
    setResolving(true)
    ;(async () => {
      const { data } = await supabase
        .from('pages')
        .select('id, name')
        .eq('page_type', 'payroll')
        .is('deleted_at', null)
        .order('name', { ascending: true })
      if (cancelled) return
      const pages = data || []
      setPayrollPages(pages)
      const urlPage = new URLSearchParams(window.location.search).get('page')
      const chosen = urlPage && pages.some(p => p.id === urlPage) ? urlPage : (pages[0]?.id || null)
      setPageId(chosen)
      setResolving(false)
    })()
    return () => { cancelled = true }
  }, [session, isMaster])

  if (authLoading) return <div className="pv-center">로딩 중…</div>

  if (!session) return (
    <div className="pv-center pv-login">
      <h1>급여 관리</h1>
      <p>ThinkMap 계정으로 로그인하세요.</p>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
    </div>
  )

  if (!isMaster) return (
    <div className="pv-center">
      <p>접근 권한이 없습니다. (마스터 전용)</p>
      <a href={HUB_BASE}>← 모선으로</a>
    </div>
  )

  return (
    <div className="pv-root">
      <header className="pv-topbar">
        <a className="pv-back" href={HUB_BASE}>← 모선</a>
        <span className="pv-title">급여 관리</span>
        {payrollPages.length > 1 && (
          <select value={pageId || ''} onChange={(e) => setPageId(e.target.value)}>
            {payrollPages.map((p) => <option key={p.id} value={p.id}>{p.name || '(제목 없음)'}</option>)}
          </select>
        )}
        <button className="pv-logout" onClick={handleLogout}>로그아웃</button>
      </header>
      <main className="pv-main">
        {resolving
          ? <div className="pv-center">급여 페이지 확인 중…</div>
          : pageId
            ? <PayrollPage pageId={pageId} session={session} />
            : <div className="pv-center">
                <p>급여 페이지가 없습니다.</p>
                <a href={HUB_BASE}>모선에서 급여 페이지를 먼저 만들어 주세요 →</a>
              </div>}
      </main>
    </div>
  )
}
