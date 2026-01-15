import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 사용자 환경설정 관리 훅 (Supabase 동기화)
 * - 마지막 방문 프로젝트/페이지 저장
 * - 모든 기기에서 동기화
 */
export const useUserPreferences = (session) => {
  const [preferences, setPreferences] = useState(null)
  const [preferencesLoading, setPreferencesLoading] = useState(true)

  // 환경설정 로드
  const fetchPreferences = useCallback(async () => {
    if (!session?.user?.id) {
      setPreferences(null)
      setPreferencesLoading(false)
      return
    }

    try {
      setPreferencesLoading(true)

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found (정상적인 경우)
        console.error('환경설정 로드 오류:', error.message)
        return
      }

      if (data) {
        setPreferences(data)
      } else {
        // 환경설정이 없으면 새로 생성
        const newPrefs = await createPreferences()
        setPreferences(newPrefs)
      }
    } catch (error) {
      console.error('환경설정 로드 오류:', error.message)
    } finally {
      setPreferencesLoading(false)
    }
  }, [session?.user?.id])

  // 환경설정 생성
  const createPreferences = async () => {
    if (!session?.user?.id) return null

    try {
      const newPrefs = {
        user_id: session.user.id,
        last_project_id: null,
        last_page_id: null,
      }

      const { data, error } = await supabase
        .from('user_preferences')
        .insert([newPrefs])
        .select()
        .single()

      if (error) {
        console.error('환경설정 생성 오류:', error.message)
        return null
      }

      return data
    } catch (error) {
      console.error('환경설정 생성 오류:', error.message)
      return null
    }
  }

  // 마지막 프로젝트 저장
  const saveLastProject = useCallback(async (projectId) => {
    if (!session?.user?.id) return

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: session.user.id,
          last_project_id: projectId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('마지막 프로젝트 저장 오류:', error.message)
        return
      }

      setPreferences(prev => prev ? { ...prev, last_project_id: projectId } : null)
    } catch (error) {
      console.error('마지막 프로젝트 저장 오류:', error.message)
    }
  }, [session?.user?.id])

  // 마지막 페이지 저장
  const saveLastPage = useCallback(async (pageId) => {
    if (!session?.user?.id) return

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: session.user.id,
          last_page_id: pageId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('마지막 페이지 저장 오류:', error.message)
        return
      }

      setPreferences(prev => prev ? { ...prev, last_page_id: pageId } : null)
    } catch (error) {
      console.error('마지막 페이지 저장 오류:', error.message)
    }
  }, [session?.user?.id])

  // 프로젝트와 페이지 동시 저장 (효율성)
  const saveLastLocation = useCallback(async (projectId, pageId) => {
    if (!session?.user?.id) return

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: session.user.id,
          last_project_id: projectId,
          last_page_id: pageId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        })

      if (error) {
        console.error('마지막 위치 저장 오류:', error.message)
        return
      }

      setPreferences(prev => prev ? {
        ...prev,
        last_project_id: projectId,
        last_page_id: pageId
      } : null)
    } catch (error) {
      console.error('마지막 위치 저장 오류:', error.message)
    }
  }, [session?.user?.id])

  // 세션 변경 시 환경설정 로드
  useEffect(() => {
    fetchPreferences()
  }, [fetchPreferences])

  return {
    preferences,
    preferencesLoading,
    lastProjectId: preferences?.last_project_id || null,
    lastPageId: preferences?.last_page_id || null,
    saveLastProject,
    saveLastPage,
    saveLastLocation,
    fetchPreferences,
  }
}
