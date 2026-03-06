import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

/**
 * 관리자 임퍼소네이션 (다른 계정으로 활동) 관리 훅
 *
 * - 임퍼소네이션 시작/종료
 * - 마지막 임퍼소네이션 상태 자동 복원 (다른 기기 포함)
 * - effectiveSession: 임퍼소네이션 중이면 해당 계정 ID/email로 교체된 세션
 */
export const useImpersonation = (session, isMaster, prefs) => {
  const {
    preferencesLoading,
    lastImpersonatedUserId,
    lastImpersonatedUserEmail,
    saveLastImpersonation,
    clearLastImpersonation,
  } = prefs

  const [impersonatedUser, setImpersonatedUser] = useState(null)

  // stable ref — handleProjectChange 등 콜백에서 stale closure 없이 참조
  const isImpersonatingRef = useRef(false)
  useEffect(() => { isImpersonatingRef.current = !!impersonatedUser }, [impersonatedUser])

  // 임퍼소네이션 중일 때 user.id / email을 해당 계정으로 교체
  const effectiveSession = useMemo(() => {
    if (!session || !impersonatedUser) return session
    return {
      ...session,
      user: { ...session.user, id: impersonatedUser.id, email: impersonatedUser.email },
    }
  }, [session, impersonatedUser])

  // 저장된 임퍼소네이션 자동 복원 (페이지 재접속 / 다른 기기)
  useEffect(() => {
    if (
      !preferencesLoading &&
      isMaster &&
      lastImpersonatedUserId &&
      lastImpersonatedUserEmail &&
      !impersonatedUser
    ) {
      setImpersonatedUser({ id: lastImpersonatedUserId, email: lastImpersonatedUserEmail })
    }
  }, [preferencesLoading, isMaster, lastImpersonatedUserId, lastImpersonatedUserEmail, impersonatedUser])

  const startImpersonation = useCallback((userId, userEmail) => {
    saveLastImpersonation(userId, userEmail)
    setImpersonatedUser({ id: userId, email: userEmail })
  }, [saveLastImpersonation])

  const stopImpersonation = useCallback(async () => {
    await clearLastImpersonation()
    setImpersonatedUser(null)
  }, [clearLastImpersonation])

  return {
    impersonatedUser,
    isImpersonatingRef,   // stable ref for callbacks
    effectiveSession,
    isImpersonating: !!impersonatedUser,
    startImpersonation,
    stopImpersonation,
  }
}
