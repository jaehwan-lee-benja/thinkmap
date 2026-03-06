import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export const useUserPreferences = (session) => {
  const [prefs, setPrefs] = useState(null)
  const [preferencesLoading, setPreferencesLoading] = useState(true)
  const userId = session?.user?.id

  // 환경설정 로드
  useEffect(() => {
    if (!userId) {
      setPrefs(null)
      setPreferencesLoading(false)
      return
    }

    let cancelled = false
    setPreferencesLoading(true)

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', userId)
          .single()

        if (cancelled) return

        if (error && error.code !== 'PGRST116') {
          console.error('환경설정 로드 오류:', error.message)
          return
        }

        if (data) {
          setPrefs(data)
        } else {
          const { data: created } = await supabase
            .from('user_preferences')
            .insert([{ user_id: userId }])
            .select()
            .single()
          if (!cancelled && created) setPrefs(created)
        }
      } catch (e) {
        if (!cancelled) console.error('환경설정 로드 오류:', e.message)
      } finally {
        if (!cancelled) setPreferencesLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [userId])

  // 공통 저장 헬퍼 (모든 save 함수가 이것을 사용)
  const save = useCallback(async (fields) => {
    if (!userId) return
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, updated_at: new Date().toISOString(), ...fields }, { onConflict: 'user_id' })
    if (error) { console.error('환경설정 저장 오류:', error.message); return }
    setPrefs(prev => prev ? { ...prev, ...fields } : null)
  }, [userId])

  // 일반 탐색
  const saveLastProject = useCallback((id) => save({ last_project_id: id }), [save])
  const saveLastPage = useCallback((id) => save({ last_page_id: id }), [save])
  const saveExpandedPages = useCallback((pages) => save({ expanded_pages: pages }), [save])

  // 임퍼소네이션 (마스터 전용)
  const saveLastImpersonation = useCallback(
    (uid, email) => save({ last_impersonated_user_id: uid, last_impersonated_user_email: email }),
    [save]
  )
  const saveLastImpersonatedProject = useCallback((id) => save({ last_impersonated_project_id: id }), [save])
  const saveLastImpersonatedPage = useCallback((id) => save({ last_impersonated_page_id: id }), [save])
  const clearLastImpersonation = useCallback(() => save({
    last_impersonated_user_id: null,
    last_impersonated_user_email: null,
    last_impersonated_project_id: null,
    last_impersonated_page_id: null,
  }), [save])

  return {
    preferencesLoading,
    // 일반
    lastProjectId: prefs?.last_project_id ?? null,
    lastPageId: prefs?.last_page_id ?? null,
    expandedPages: prefs?.expanded_pages ?? {},
    saveLastProject,
    saveLastPage,
    saveExpandedPages,
    // 임퍼소네이션
    lastImpersonatedUserId: prefs?.last_impersonated_user_id ?? null,
    lastImpersonatedUserEmail: prefs?.last_impersonated_user_email ?? null,
    lastImpersonatedProjectId: prefs?.last_impersonated_project_id ?? null,
    lastImpersonatedPageId: prefs?.last_impersonated_page_id ?? null,
    saveLastImpersonation,
    saveLastImpersonatedProject,
    saveLastImpersonatedPage,
    clearLastImpersonation,
  }
}
