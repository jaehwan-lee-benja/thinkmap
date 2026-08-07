// 멤버십 키오스크(Membership) 위성 셸 — SITE-SPLIT Phase 6.
// ★인증 모델(SPEC §5.1): 매장 태블릿 = "매장 계정"으로 1회 로그인 → 세션 유지.
// ★로그인 인가 게이트(유저결정 2026-07-27): Google 로그인 성공 후 **is_master() OR is_store()** 확인 →
//   미인가 계정은 즉시 signOut + 안내(빈 화면/먹통 아님). 인가 계정만 키오스크 진입.
//   방식=기존 RPC 직접 호출(신규 마이그/Edge 불요 — is_master/is_store 는 프로덕션 존재·authenticated 실행 가능).
//   데이터면 게이트(프록시 Edge)는 그대로 별도 방어선(이건 진입 게이트).
import { useEffect, useState } from 'react'
import { useAuth, supabase } from '@thinkmap/core'
import MembershipKiosk from './components/Kiosk/MembershipKiosk'
import { PREVIEW } from './api/membership'

// 프리뷰용 가짜 세션 — 아래 진입 게이트가 세션 «존재»만 보므로 최소 형태면 충분하다.
//   토큰은 문자열일 뿐 아무 데도 쓰이지 않는다(프리뷰에선 네트워크 호출 자체가 없다).
const PREVIEW_SESSION = { user: { id: 'preview', email: 'preview@local' } }

// ★대기 표시(2026-08-08) — 번들은 왔는데 **세션 확인이 늦는** 구간도 하얀 화면과 똑같이 보인다
//   (index.html 부팅 오버레이는 이미 걷힌 뒤다). 그래서 같은 문법으로 한 번 더 방어한다:
//   점 세 개 + 15초 넘으면 «네트워크가 느립니다». 저속 회선에서 «고장인가»를 묻지 않게 하는 게 목적.
const SLOW_MS = 15000
function Waiting({ text }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="pv-center pv-wait" role="status" aria-live="polite">
      <div className="pv-wait-dots" aria-hidden="true"><i /><i /><i /></div>
      <div>{text}</div>
      {slow && <div className="pv-wait-slow">네트워크가 느립니다 — 잠시만요</div>}
    </div>
  )
}

export default function MembershipApp() {
  const { session, authLoading, handleGoogleLogin } = useAuth()
  const [authz, setAuthz] = useState('idle') // idle | checking | ok
  const [denied, setDenied] = useState(false)

  // 로그인 성공 → 역할 확인. 미인가면 signOut(→ session null → 로그인 화면 + 거부 안내).
  // ★2026-08-04 교정 2건(현장 치명):
  //   ① **네트워크 순단을 «권한 없음»으로 오판해 매장 태블릿이 스스로 로그아웃**했다.
  //      postgrest 는 fetch 실패도 resolve 하므로 `data!==true` 하나로 거부를 단정하면 안 된다.
  //      ⇒ **명시적으로 false 가 온 경우에만** 거부. 오류·미확정이면 **세션을 유지**한다(매장이 죽지 않게).
  //   ② deps 가 `[session]` 이라 **토큰 갱신·절전 복귀 때마다 authz 가 checking 으로 되돌아가**
  //      키오스크가 통째로 언마운트됐다(입력 폼·인쇄 대기목록 초기화). ⇒ 사용자 id 기준으로만 재검사.
  const userId = session?.user?.id || null
  useEffect(() => {
    if (!userId) { setAuthz('idle'); return }
    let alive = true
    setAuthz((prev) => (prev === 'ok' ? 'ok' : 'checking'))
    Promise.allSettled([supabase.rpc('is_master'), supabase.rpc('is_store')])
      .then(([m, s]) => {
        if (!alive) return
        const mOk = m.status === 'fulfilled' && !m.value?.error
        const sOk = s.status === 'fulfilled' && !s.value?.error
        const isMaster = mOk && m.value?.data === true
        const isStore = sOk && s.value?.data === true
        if (isMaster || isStore) { setAuthz('ok'); return }
        // ★둘 중 하나라도 «응답을 못 받았으면» 거부가 아니다 — 통신 문제일 수 있다.
        if (!mOk || !sOk) { setAuthz((prev) => (prev === 'ok' ? 'ok' : 'idle')); return }
        // 둘 다 정상 응답 + 둘 다 false = 진짜 미인가
        setDenied(true); setAuthz('idle'); supabase.auth.signOut()
      })
      .catch(() => { if (alive) setAuthz((prev) => (prev === 'ok' ? 'ok' : 'idle')) })  // 예외=통신 문제로 본다
    return () => { alive = false }
  }, [userId])

  const login = () => { setDenied(false); handleGoogleLogin() }

  // ★프리뷰(`?preview=1`) — 로그인·인가 게이트 우회. **dev 서버에서만**(PREVIEW 정의부 참조).
  //   훅(useAuth·useEffect)은 위에서 이미 호출됐다 — 조기 return 이 훅 순서를 깨지 않는다(seat 과 같은 배치).
  //   데모 데이터는 api/previewData.js, 인쇄는 no-op(receipt/print.js).
  if (PREVIEW) {
    return (<>
      <div className="mk-preview-bar">
        미리보기 — 실제 데이터·발권 없음 · 끝자리 <b>0</b>=미회원 · <b>9</b>=아이스크림 수령가능 · 그 외=스탬프 3/10
      </div>
      <MembershipKiosk session={PREVIEW_SESSION} />
    </>)
  }

  if (authLoading) return <Waiting text="불러오는 중…" />

  // 세션 있음 — 인가 확인 중이거나 거부 처리(signOut in flight) 동안은 진입 보류.
  if (session) {
    if (authz === 'ok') return <MembershipKiosk session={session} />
    return <Waiting text="계정 확인 중…" />
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
