import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 인증 관련 로직을 관리하는 커스텀 훅
 * @returns {Object} 인증 상태 및 핸들러
 */
export const useAuth = () => {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // 인증 상태 확인
  useEffect(() => {
    // 현재 세션 가져오기
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })

    // 인증 상태 변경 리스너
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 로그인 핸들러
  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/todo-note/'
        }
      })
      if (error) throw error
    } catch (error) {
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
    handleGoogleLogin,
    handleLogout
  }
}
