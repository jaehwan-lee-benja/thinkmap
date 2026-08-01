// 멤버십 키오스크(Membership) 위성 셸 — SITE-SPLIT Phase 6.
// ★인증 모델(SPEC §5.1): 매장 태블릿 = "매장 계정"으로 1회 로그인 → 세션 유지.
// ★로그인 인가 게이트(유저결정 2026-07-27): Google 로그인 성공 후 **is_master() OR is_store()** 확인 →
//   미인가 계정은 즉시 signOut + 안내(빈 화면/먹통 아님). 인가 계정만 키오스크 진입.
//   방식=기존 RPC 직접 호출(신규 마이그/Edge 불요 — is_master/is_store 는 프로덕션 존재·authenticated 실행 가능).
//   데이터면 게이트(프록시 Edge)는 그대로 별도 방어선(이건 진입 게이트).
import { useEffect, useState } from 'react'
import { useAuth, supabase } from '@thinkmap/core'
import MembershipKiosk from './components/Kiosk/MembershipKiosk'

export default function MembershipApp() {
  const { session, authLoading, handleGoogleLogin } = useAuth()
  const [authz, setAuthz] = useState('idle') // idle | checking | ok
  const [denied, setDenied] = useState(false)

  // 로그인 성공 → 역할 확인. 미인가면 signOut(→ session null → 로그인 화면 + 거부 안내).
  useEffect(() => {
    if (!session) { setAuthz('idle'); return }
    let alive = true
    setAuthz('checking')
    // allSettled: is_store RPC 가 어떤 이유로 실패해도 is_master 판정은 살린다(오탐 방지).
    Promise.allSettled([supabase.rpc('is_master'), supabase.rpc('is_store')])
      .then(([m, s]) => {
        if (!alive) return
        const isMaster = m.status === 'fulfilled' && m.value?.data === true
        const isStore = s.status === 'fulfilled' && s.value?.data === true
        if (isMaster || isStore) { setAuthz('ok') }
        else { setDenied(true); setAuthz('idle'); supabase.auth.signOut() }
      })
      .catch(() => { if (alive) { setDenied(true); setAuthz('idle'); supabase.auth.signOut() } })
    return () => { alive = false }
  }, [session])

  const login = () => { setDenied(false); handleGoogleLogin() }

  if (authLoading) return <div className="pv-center">로딩 중…</div>

  // 세션 있음 — 인가 확인 중이거나 거부 처리(signOut in flight) 동안은 진입 보류.
  if (session) {
    if (authz === 'ok') return <MembershipKiosk session={session} />
    return <div className="pv-center">계정 확인 중…</div>
  }

  // 세션 없음 — 로그인 화면(+ 미인가 거부 안내).
  return (
    <div className="pv-center pv-login">
      <h1>멤버십 키오스크</h1>
      {denied ? (
        <p className="pv-denied">권한 없는 계정입니다. <b>매장 계정</b>으로 로그인하세요.</p>
      ) : (
        <p>매장 계정으로 로그인하세요.</p>
      )}
      <button onClick={login}>Google로 로그인</button>
    </div>
  )
}
