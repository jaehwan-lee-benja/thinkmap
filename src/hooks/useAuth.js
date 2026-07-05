import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 인증 관련 로직을 관리하는 커스텀 훅
 * @returns {Object} 인증 상태 및 핸들러
 */
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
      handleSessionChange(session)
    })

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
      // 현재 URL 정보
      const currentOrigin = window.location.origin
      const currentHostname = window.location.hostname

      // 개발 환경 감지
      const isDevelopment = currentHostname === 'localhost' ||
                           currentHostname.startsWith('192.') ||
                           currentHostname.startsWith('172.')

      // redirectUrl을 현재 origin + 앱 base 로 고정 (위성은 자기 base 로 자동 대응)
      const redirectUrl = currentOrigin + import.meta.env.BASE_URL

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
