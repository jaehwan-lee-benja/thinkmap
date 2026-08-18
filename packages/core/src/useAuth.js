import { useState, useEffect } from 'react'
import { BASE_URL } from './basePath.js'
import { supabase } from './supabaseClient.js'

/**
 * 인증 관련 로직을 관리하는 커스텀 훅
 * @returns {Object} 인증 상태 및 핸들러
 */
// ★로그인 왕복에서 «원래 주소»를 지키는 장치(2026-08-16 유저 실황 버그).
//   증상: `/membership/?role=display` 에서 로그인하면 왕복 후 `?role=display` 가 사라져
//   **직원/고객 화면에 착지**한다. 원인은 redirectTo 가 `origin + BASE_URL` 로 «고정»이라
//   쿼리를 통째로 버리는 것 — OAuth 공급자가 잃는 게 아니라 우리가 안 실어 보낸다.
//
// ★redirectTo 에 쿼리를 붙이지 않고 «저장소 왕복»으로 푼 이유: redirectTo 를 바꾸면
//   Supabase 리다이렉트 허용목록 매칭에 걸릴 수 있고, 그 실패는 «Site URL 로 폴백»이라
//   조용하다. 저장소 경로는 공급자 설정을 하나도 안 건드린다.
const AUTH_RETURN_KEY = 'tm.auth.returnSearch'

// ★★`sessionStorage` → `localStorage` (2026-08-18 현장 재현에서 역산).
//   `sessionStorage` 는 **탭(브라우징 컨텍스트) 단위**다. 그런데 iOS 에서 홈 화면에 추가한
//   standalone 웹앱이 구글 로그인으로 나갔다가 돌아올 때 **돌아오는 곳이 같은 컨텍스트라는 보장이 없다**
//   (사파리로 튕겨 착지하는 경로가 있다). 그러면 스태시는 **원리적으로 안 보이고**, 우리는
//   「고쳤는데 현장에서 안 된다」를 얻는다 — 실제로 그 형태였다.
//   ⇒ 저장소를 **오리진 단위(localStorage)**로 올린다. 대신 «오래 사는» 값이 되므로 **TTL 을 같이 넣는다**:
//     탭 수명이 해 주던 «자동 만료»를 잃었으니 그 몫을 시간이 대신한다.
//   ※TTL 10분 = 「로그인 왕복 하나」의 넉넉한 상한. 그보다 오래된 스태시는 왕복의 산물이 아니다.
const AUTH_RETURN_TTL_MS = 10 * 60 * 1000

/**
 * 왕복 후 되돌아갈 주소를 «계산만» 한다(부수효과 없음 — 그래서 시험할 수 있다).
 * @param currentSearch 지금 주소의 search
 * @param stashed       저장된 값(구형: 문자열 그대로 / 신형: `{s,t}` JSON)
 * @param now           현재 시각(ms) — 주입해서 시험한다
 * @returns 이동할 search 문자열, 또는 이동하지 않아야 하면 null
 */
export function computeReturnSearch(currentSearch, stashed, now = Date.now()) {
  if (stashed == null || stashed === '') return null   // 쿼리를 안 쓰던 앱은 완전 no-op
  let search = stashed
  if (stashed.charAt(0) === '{') {
    // 신형(JSON). ★파싱 실패는 «무시»한다 — 남의 키와 충돌하거나 값이 깨졌을 때
    //   엉뚱한 곳으로 보내느니 아무 일도 안 하는 편이 안전하다.
    let parsed = null
    try { parsed = JSON.parse(stashed) } catch { return null }
    if (!parsed || typeof parsed.s !== 'string') return null
    if (typeof parsed.t === 'number' && now - parsed.t > AUTH_RETURN_TTL_MS) return null  // 만료
    search = parsed.s
  }
  if (search === '') return null
  if (currentSearch === search) return null            // 이미 제자리 — 다시 이동하면 무한 루프
  return search
}

/**
 * 복귀 주소 계산 — ★순수 함수로 뺀다(자체시험이 «본 경로와 같은 코드»를 치게).
 * base 가 절대 URL 이면 그건 «자산 위치»다 — 문서 위치(pathname)로 돌아와야 한다.
 * @returns 복귀 주소
 */
export function computeRedirectUrl(origin, base, pathname) {
  const abs = /^(https?:)?\/\//i.test(String(base || ''))
  return abs ? origin + pathname : origin + base
}

function stashReturnSearch() {
  try {
    const s = window.location.search
    // ★빈 경우 «지운다» — 안 지우면 지난 로그인의 찌꺼기가 다음 평범한 로그인을 엉뚱한 데로 보낸다.
    if (s) window.localStorage.setItem(AUTH_RETURN_KEY, JSON.stringify({ s, t: Date.now() }))
    else window.localStorage.removeItem(AUTH_RETURN_KEY)
    // 구형 자리(sessionStorage)에 남아 있던 값은 같이 치운다 — 두 자리가 서로 다른 답을 들고 있으면
    // 「고쳤는데 가끔 엉뚱하다」가 된다. 이관은 «두 자리를 남기지 않는» 것까지가 이관이다.
    window.sessionStorage.removeItem(AUTH_RETURN_KEY)
  } catch { /* 저장소 차단 환경 — 기존 동작(쿼리 소실)으로 조용히 폴백 */ }
}

function restoreReturnSearch() {
  let stashed = null
  try {
    stashed = window.localStorage.getItem(AUTH_RETURN_KEY)
    // ★구형 자리 폴백 — 이 배포 «직전에» 로그인을 시작한 왕복이 하나 떠 있을 수 있다.
    //   배포 경계를 넘는 왕복이 조용히 실패하지 않게 한 판만 받아 준다.
    if (stashed == null) stashed = window.sessionStorage.getItem(AUTH_RETURN_KEY)
    // ★이동 «전에» 지운다(루프 차단). 두 자리 다 지운다.
    window.localStorage.removeItem(AUTH_RETURN_KEY)
    window.sessionStorage.removeItem(AUTH_RETURN_KEY)
  } catch { return }
  const target = computeReturnSearch(window.location.search, stashed)
  if (!target) return
  // ★replaceState 가 아니라 실제 이동이다: 역할 분기(main.jsx)가 «모듈 로드 시점»에 URL 을 읽으므로
  //   주소만 바꿔치기하면 화면은 이미 잘못 그려진 뒤다. 한 번 더 로드해야 전부 다시 읽는다.
  //   세션은 이미 저장돼 있어 재로그인은 없다.
  window.location.replace(window.location.pathname + target)
}

export const useAuth = () => {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isMaster, setIsMaster] = useState(false)
  const [userStatus, setUserStatus] = useState(null) // 'active' | 'pending' | 'inactive' | 'invited' | null

  // DB에서 역할 + 상태 확인
  const checkUserInfo = async (session) => {
    if (!session?.user?.email) return { isMaster: false, status: null }
    try {
      const { data } = await supabase
        .from('app_users')
        .select('role, status')
        .eq('email', session.user.email.toLowerCase())
        .single()
      return {
        isMaster: data?.role === 'master',
        status: data?.status || null,
      }
    } catch (e) { /* ignore */ }
    return { isMaster: false, status: null }
  }

  // 로그인 시 app_users에 자동 등록 + auth_uid 동기화
  const ensureAppUser = async (session) => {
    if (!session?.user?.email) return
    const email = session.user.email.toLowerCase()
    const authUid = session.user.id

    const { data } = await supabase
      .from('app_users')
      .select('id, auth_uid, status')
      .eq('email', email)
      .single()

    if (!data) {
      // 신규 가입: pending 상태로 생성 (마스터 승인 필요)
      await supabase.from('app_users').insert([{
        email,
        auth_uid: authUid,
        role: 'user',
        status: 'pending',
      }])
    } else if (!data.auth_uid || data.auth_uid !== authUid) {
      await supabase.from('app_users')
        .update({ auth_uid: authUid })
        .eq('id', data.id)
    }
  }

  // 세션 변경 시 사용자 정보 로드
  const handleSessionChange = async (session) => {
    if (session) {
      ensureAppUser(session).catch(() => {})
      const info = await checkUserInfo(session).catch(() => ({ isMaster: false, status: null }))
      setIsMaster(info.isMaster)
      setUserStatus(info.status)
    } else {
      setIsMaster(false)
      setUserStatus(null)
    }
  }

  // 인증 상태 확인
  useEffect(() => {
    // ★getSession 실패(저장 토큰 만료·손상·갱신 실패) 시에도 authLoading 을 반드시 해제한다.
    //   .finally 없으면 실패 시 setAuthLoading(false) 미호출 → "로딩 중…" 무한(공유 core 버그).
    //   실패 경로는 세션 없음(null)으로 폴백 = 로그인 화면. 엄격히 additive(성공 경로 무변경).
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        handleSessionChange(session)
        // ★세션이 «있을 때만» 복원한다. 실패했는데 이동하면 아직 교환 안 된 ?code 를 버리게 된다.
        if (session) restoreReturnSearch()
      })
      .catch(() => {
        setSession(null)
        handleSessionChange(null)
      })
      .finally(() => setAuthLoading(false))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      handleSessionChange(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 로그인 핸들러
  const handleGoogleLogin = async () => {
    try {
      stashReturnSearch()   // ★리다이렉트 «전»에 남긴다 — 떠난 뒤엔 남길 기회가 없다
      // 현재 URL 정보
      const currentOrigin = window.location.origin
      const currentHostname = window.location.hostname

      // 개발 환경 감지
      const isDevelopment = currentHostname === 'localhost' ||
                           currentHostname.startsWith('192.') ||
                           currentHostname.startsWith('172.')

      // redirectUrl을 현재 origin + 앱 base 로 고정 (위성은 자기 base 로 자동 대응)
      // ★긴급 교정(2026-08-08 membership 재현 · 2026-08-18 반입) — **BASE_URL 이 절대 URL 인 빌드가 있다.**
      //   키오스크는 자산을 Supabase Storage 에서 받으려 `base` 를 절대 URL 로 굽는다(`APP_BASE`).
      //   그때 종전 식은 `https://host` + `https://sqisnt…/kiosk/` 로 **두 URL 이 이어붙은 기형 문자열**이
      //   되고 redirect_to 가 무효라 **구글 계정 선택 뒤 복귀가 깨진다**(유저 3기기 동일 = 결정적 결함).
      //   ⇒ base 가 절대면 그건 **자산 위치**이지 문서 위치가 아니다. 돌아올 곳은 **지금 이 문서**다.
      //   ※상대 base(모선·기존 위성 전부)에서는 결과가 **한 바이트도 안 달라진다** — 그 분기만 더한다.
      //   ※쿼리 보존은 별 축이다 — 이 파일의 `stashReturnSearch`/`restoreReturnSearch` 가 담당한다.
      const redirectUrl = computeRedirectUrl(currentOrigin, BASE_URL, window.location.pathname)

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            prompt: 'select_account'
          }
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('❌ 로그인 오류:', error)
      alert('로그인 오류: ' + error.message)
    }
  }

  // 로그아웃 핸들러
  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      alert('로그아웃 오류: ' + error.message)
    }
  }

  return {
    session,
    authLoading,
    isMaster,
    userStatus,
    handleGoogleLogin,
    handleLogout
  }
}
