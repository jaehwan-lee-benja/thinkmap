import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@thinkmap/core'
import { generateUUID } from '../utils/uuid'
import { logError } from '../utils/supabaseError'

/**
 * 프로젝트 관리 훅
 * @param {Object} session - Supabase 세션
 * @param {Object} options - 옵션
 * @param {string} options.initialProjectId - 초기 프로젝트 ID (Supabase에서 가져온 마지막 프로젝트)
 * @param {Function} options.onProjectChange - 프로젝트 변경 시 콜백 (Supabase 저장용)
 */
export const useProjects = (session, options = {}) => {
  const { initialProjectId = null, onProjectChange, preferencesLoaded = true, isImpersonating = false } = options
  const [projects, setProjects] = useState([])
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const prevUserIdRef = useRef(null)
  // 초기 프로젝트 선택이 필요한지 여부 (stale closure 방지용 ref)
  const needsInitialSelectRef = useRef(true)
  // fetch 무효화용 카운터 (경쟁 조건 방지 — 오래된 응답 무시)
  const fetchCountRef = useRef(0)

  // 프로젝트 선택 (콜백 호출 포함)
  const selectProject = useCallback((projectId) => {
    setCurrentProjectId(projectId)
    if (onProjectChange && projectId) {
      onProjectChange(projectId)
    }
  }, [onProjectChange])

  // 프로젝트 목록 로드
  const fetchProjects = useCallback(async () => {
    if (!session?.user?.id) return

    const myFetchId = ++fetchCountRef.current

    try {
      setProjectsLoading(true)

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', session.user.id)
        .order('position', { ascending: true })

      // 더 최신 fetch가 시작됐으면 이 응답은 무시 (경쟁 조건 방지)
      if (myFetchId !== fetchCountRef.current) return

      if (logError('프로젝트 로드', error)) return

      if (!data || data.length === 0) {
        if (isImpersonating) {
          // 임퍼소네이션 중에는 기본 프로젝트를 생성하지 않음
          setProjects([])
          setInitialized(true)
        } else {
          await createDefaultProject()
        }
      } else {
        setProjects(data)
        // 초기 선택이 필요한 경우에만 (ref로 stale closure 방지)
        if (needsInitialSelectRef.current && data.length > 0) {
          needsInitialSelectRef.current = false
          const targetProject = initialProjectId
            ? data.find(p => p.id === initialProjectId)
            : null
          const targetProjectId = targetProject ? targetProject.id : data[0].id
          setCurrentProjectId(targetProjectId)
          // 저장된 값으로 복원할 때는 콜백 호출하지 않음
          if (!targetProject && onProjectChange) {
            onProjectChange(targetProjectId)
          }
        }
        setInitialized(true)
      }
    } catch (error) {
      logError('프로젝트 로드', error)
    } finally {
      if (myFetchId === fetchCountRef.current) setProjectsLoading(false)
    }
  }, [session?.user?.id, initialProjectId, onProjectChange])

  // 기본 프로젝트 생성
  const createDefaultProject = async () => {
    if (!session?.user?.id) return

    try {
      const newProject = {
        id: generateUUID(),
        user_id: session.user.id,
        name: 'My Project',
        position: 0,
      }

      const { error } = await supabase
        .from('projects')
        .insert([newProject])

      if (logError('기본 프로젝트 생성', error)) return

      setProjects([newProject])
      setCurrentProjectId(newProject.id)
      if (onProjectChange) {
        onProjectChange(newProject.id)
      }
      setInitialized(true)
    } catch (error) {
      logError('기본 프로젝트 생성', error)
    }
  }

  // 새 프로젝트 생성
  const createProject = async (name = 'Untitled Project') => {
    if (!session?.user?.id) return null

    try {
      const newProject = {
        id: generateUUID(),
        user_id: session.user.id,
        name,
        position: projects.length,
      }

      const { error } = await supabase
        .from('projects')
        .insert([newProject])

      if (logError('프로젝트 생성', error)) return null

      setProjects([...projects, newProject])
      return newProject
    } catch (error) {
      logError('프로젝트 생성', error)
      return null
    }
  }

  // 프로젝트 이름 변경
  const renameProject = async (projectId, newName) => {
    if (!session?.user?.id || !newName.trim()) return false

    try {
      const { error } = await supabase
        .from('projects')
        .update({ name: newName.trim(), updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .eq('user_id', session.user.id)

      if (logError('프로젝트 이름 변경', error)) return false

      setProjects(projects.map(p =>
        p.id === projectId ? { ...p, name: newName.trim() } : p
      ))
      return true
    } catch (error) {
      logError('프로젝트 이름 변경', error)
      return false
    }
  }

  // 프로젝트 삭제
  const deleteProject = async (projectId) => {
    if (!session?.user?.id) return false
    if (projects.length <= 1) {
      console.warn('마지막 프로젝트는 삭제할 수 없습니다.')
      return false
    }

    try {
      // CASCADE로 인해 해당 프로젝트의 모든 페이지와 블록도 자동 삭제됨
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', session.user.id)

      if (logError('프로젝트 삭제', error)) return false

      const updatedProjects = projects.filter(p => p.id !== projectId)
      setProjects(updatedProjects)

      // 삭제된 프로젝트가 현재 프로젝트였다면 다른 프로젝트로 전환
      if (currentProjectId === projectId && updatedProjects.length > 0) {
        selectProject(updatedProjects[0].id)
      }

      return true
    } catch (error) {
      logError('프로젝트 삭제', error)
      return false
    }
  }

  // 프로젝트 순서 변경
  const reorderProjects = async (newProjects) => {
    if (!session?.user?.id) return false

    try {
      // 각 프로젝트의 position 업데이트
      const updates = newProjects.map((project, index) => ({
        id: project.id,
        position: index,
        updated_at: new Date().toISOString()
      }))

      for (const update of updates) {
        const { error } = await supabase
          .from('projects')
          .update({ position: update.position, updated_at: update.updated_at })
          .eq('id', update.id)
          .eq('user_id', session.user.id)

        if (error) throw error
      }

      setProjects(newProjects)
      return true
    } catch (error) {
      logError('프로젝트 순서 변경', error)
      return false
    }
  }

  // 세션 변경 시 프로젝트 로드 (환경설정 로드 완료 후에만 실행)
  useEffect(() => {
    if (session?.user?.id) {
      if (!preferencesLoaded) {
        // 환경설정 로딩 중 — 아직 프로젝트 로드하지 않음
        setProjectsLoading(true)
        return
      }
      // 사용자가 변경되면 상태 리셋 (임퍼소네이션 등)
      if (prevUserIdRef.current && prevUserIdRef.current !== session.user.id) {
        setProjects([])
        setCurrentProjectId(null)
        setInitialized(false)
        needsInitialSelectRef.current = true  // 다음 fetch에서 초기 선택 수행
        fetchCountRef.current++               // 진행 중인 fetch 무효화
      }
      prevUserIdRef.current = session.user.id
      fetchProjects()
    } else {
      setProjects([])
      setCurrentProjectId(null)
      setProjectsLoading(false)
      setInitialized(false)
      prevUserIdRef.current = null
      fetchCountRef.current++  // 진행 중인 fetch 무효화
    }
  }, [session?.user?.id, initialProjectId, preferencesLoaded])

  return {
    projects,
    currentProjectId,
    setCurrentProjectId: selectProject,
    projectsLoading,
    fetchProjects,
    createProject,
    renameProject,
    deleteProject,
    reorderProjects,
  }
}
