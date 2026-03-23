import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

// 마스터 계정 이메일 목록
const MASTER_EMAILS = ['designerbenja@gmail.com']

/**
 * 인증 관련 로직을 관리하는 커스텀 훅
 * @returns {Object} 인증 상태 및 핸들러
 */
export const useAuth = () => {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isMaster, setIsMaster] = useState(false)

  // 마스터 여부 확인
  const checkIsMaster = (session) => {
    const email = session?.user?.email
    return email ? MASTER_EMAILS.includes(email.toLowerCase()) : false
  }

  // 로그인 시 app_users에 자동 등록 + auth_uid 동기화
  const ensureAppUser = async (session) => {
    if (!session?.user?.email) return
    const email = session.user.email.toLowerCase()
    const authUid = session.user.id

    const { data } = await supabase
      .from('app_users')
      .select('id, auth_uid')
      .eq('email', email)
      .single()

    if (!data) {
      await supabase.from('app_users').insert([{
        email,
        auth_uid: authUid,
        role: MASTER_EMAILS.includes(email) ? 'master' : 'user',
        status: 'active',
      }])
    } else if (!data.auth_uid || data.auth_uid !== authUid) {
      // auth_uid가 없거나 변경된 경우 업데이트
      await supabase.from('app_users')
        .update({ auth_uid: authUid })
        .eq('id', data.id)
    }
  }

  // 인증 상태 확인
  useEffect(() => {
    // 현재 세션 가져오기
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsMaster(checkIsMaster(session))
      if (session) ensureAppUser(session)
      setAuthLoading(false)
    })

    // 인증 상태 변경 리스너
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setIsMaster(checkIsMaster(session))
      if (session) ensureAppUser(session)
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

      // redirectUrl을 현재 origin으로 고정
      const redirectUrl = currentOrigin + '/thinkmap/'

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
    handleGoogleLogin,
    handleLogout
  }
}
