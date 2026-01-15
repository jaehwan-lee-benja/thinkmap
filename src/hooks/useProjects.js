import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * UUID 생성 함수 (브라우저 호환)
 */
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * 프로젝트 관리 훅
 * @param {Object} session - Supabase 세션
 * @param {Object} options - 옵션
 * @param {string} options.initialProjectId - 초기 프로젝트 ID (Supabase에서 가져온 마지막 프로젝트)
 * @param {Function} options.onProjectChange - 프로젝트 변경 시 콜백 (Supabase 저장용)
 */
export const useProjects = (session, options = {}) => {
  const { initialProjectId = null, onProjectChange } = options
  const [projects, setProjects] = useState([])
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

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

    try {
      setProjectsLoading(true)

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', session.user.id)
        .order('position', { ascending: true })

      if (error) {
        console.error('프로젝트 로드 오류:', error.message)
        return
      }

      if (!data || data.length === 0) {
        // 프로젝트가 없으면 기본 프로젝트 생성
        await createDefaultProject()
      } else {
        setProjects(data)
        // 현재 프로젝트가 설정되지 않았으면 초기값 또는 첫 번째 프로젝트 선택
        if (!currentProjectId && data.length > 0) {
          const targetProject = initialProjectId
            ? data.find(p => p.id === initialProjectId)
            : null
          const targetProjectId = targetProject ? targetProject.id : data[0].id
          setCurrentProjectId(targetProjectId)
          // 초기 로드 시에는 콜백 호출하지 않음 (이미 저장된 값이므로)
          if (!targetProject && onProjectChange) {
            onProjectChange(targetProjectId)
          }
        }
        setInitialized(true)
      }
    } catch (error) {
      console.error('프로젝트 로드 오류:', error.message)
    } finally {
      setProjectsLoading(false)
    }
  }, [session?.user?.id, initialProjectId, currentProjectId, onProjectChange])

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

      if (error) {
        console.error('기본 프로젝트 생성 오류:', error.message)
        return
      }

      setProjects([newProject])
      setCurrentProjectId(newProject.id)
      if (onProjectChange) {
        onProjectChange(newProject.id)
      }
      setInitialized(true)
    } catch (error) {
      console.error('기본 프로젝트 생성 오류:', error.message)
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

      if (error) {
        console.error('프로젝트 생성 오류:', error.message)
        return null
      }

      setProjects([...projects, newProject])
      return newProject
    } catch (error) {
      console.error('프로젝트 생성 오류:', error.message)
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

      if (error) {
        console.error('프로젝트 이름 변경 오류:', error.message)
        return false
      }

      setProjects(projects.map(p =>
        p.id === projectId ? { ...p, name: newName.trim() } : p
      ))
      return true
    } catch (error) {
      console.error('프로젝트 이름 변경 오류:', error.message)
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

      if (error) {
        console.error('프로젝트 삭제 오류:', error.message)
        return false
      }

      const updatedProjects = projects.filter(p => p.id !== projectId)
      setProjects(updatedProjects)

      // 삭제된 프로젝트가 현재 프로젝트였다면 다른 프로젝트로 전환
      if (currentProjectId === projectId && updatedProjects.length > 0) {
        selectProject(updatedProjects[0].id)
      }

      return true
    } catch (error) {
      console.error('프로젝트 삭제 오류:', error.message)
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
      console.error('프로젝트 순서 변경 오류:', error.message)
      return false
    }
  }

  // 세션 변경 시 프로젝트 로드
  useEffect(() => {
    if (session?.user?.id) {
      fetchProjects()
    } else {
      setProjects([])
      setCurrentProjectId(null)
      setProjectsLoading(false)
      setInitialized(false)
    }
  }, [session?.user?.id, initialProjectId])

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
