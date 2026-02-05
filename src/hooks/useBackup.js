import { useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 프로젝트 백업 관리 훅
 * - 프로젝트의 모든 페이지와 콘텐츠를 백업/복원
 * - Supabase에 저장 (어느 기기에서든 접근 가능)
 */
export const useBackup = (session) => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // 백업 목록 가져오기
  const getBackups = useCallback(async (projectId) => {
    if (!session?.user?.id || !projectId) return []

    try {
      const { data, error } = await supabase
        .from('backups')
        .select('id, description, created_at, backup_data')
        .eq('project_id', projectId)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('백업 목록 로드 오류:', error.message)
        return []
      }

      // 형식 변환 (기존 인터페이스 유지)
      return (data || []).map(backup => ({
        id: backup.id,
        createdAt: backup.created_at,
        description: backup.description,
        project: backup.backup_data.project,
        pages: backup.backup_data.pages,
      }))
    } catch (err) {
      console.error('백업 목록 로드 오류:', err)
      return []
    }
  }, [session?.user?.id])

  // 백업 생성
  const createBackup = useCallback(async (project, pages, description = '') => {
    if (!session?.user?.id || !project) {
      setError('세션 또는 프로젝트 정보가 없습니다.')
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      // 각 페이지의 콘텐츠(content_tiptap) 가져오기
      const pagesWithContent = await Promise.all(
        pages.map(async (page) => {
          const { data: pageData, error: pageError } = await supabase
            .from('pages')
            .select('content_tiptap')
            .eq('id', page.id)
            .single()

          if (pageError) {
            console.error(`페이지 ${page.id} 콘텐츠 로드 오류:`, pageError)
          }

          return {
            ...page,
            content_tiptap: pageData?.content_tiptap || null
          }
        })
      )

      // 백업 데이터 생성
      const backupData = {
        project: {
          id: project.id,
          name: project.name,
        },
        pages: pagesWithContent,
        version: '1.0',
      }

      const backupDescription = description || `백업 - ${new Date().toLocaleString('ko-KR')}`

      // Supabase에 저장
      const { data, error } = await supabase
        .from('backups')
        .insert({
          user_id: session.user.id,
          project_id: project.id,
          description: backupDescription,
          backup_data: backupData,
        })
        .select()
        .single()

      if (error) {
        console.error('백업 저장 오류:', error.message)
        setError('백업 저장에 실패했습니다.')
        setIsLoading(false)
        return null
      }

      setIsLoading(false)
      return {
        id: data.id,
        createdAt: data.created_at,
        description: data.description,
        project: backupData.project,
        pages: backupData.pages,
      }
    } catch (err) {
      console.error('백업 생성 오류:', err)
      setError('백업 생성에 실패했습니다.')
      setIsLoading(false)
      return null
    }
  }, [session?.user?.id])

  // 백업에서 복원
  const restoreBackup = useCallback(async (projectId, backupId) => {
    if (!session?.user?.id || !projectId || !backupId) {
      setError('필수 정보가 없습니다.')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      // 백업 데이터 가져오기
      const { data: backupRecord, error: fetchError } = await supabase
        .from('backups')
        .select('backup_data')
        .eq('id', backupId)
        .eq('user_id', session.user.id)
        .single()

      if (fetchError || !backupRecord) {
        console.error('백업 조회 오류:', fetchError)
        setError('백업을 찾을 수 없습니다.')
        setIsLoading(false)
        return false
      }

      const backup = backupRecord.backup_data

      // 1. 기존 페이지 삭제
      const { error: pageDelError } = await supabase
        .from('pages')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', session.user.id)

      if (pageDelError) {
        console.error('기존 페이지 삭제 오류:', pageDelError)
      }

      // 2. 백업된 페이지 복원 (새 ID 생성)
      for (const page of backup.pages) {
        const newPageId = crypto.randomUUID()

        // 페이지 생성 (content_tiptap 포함)
        const { error: pageError } = await supabase
          .from('pages')
          .insert({
            id: newPageId,
            user_id: session.user.id,
            project_id: projectId,
            name: page.name,
            position: page.position,
            content_tiptap: page.content_tiptap || null,
          })

        if (pageError) {
          console.error('페이지 복원 오류:', pageError)
          continue
        }
      }

      setIsLoading(false)
      return true
    } catch (err) {
      console.error('복원 오류:', err)
      setError('복원에 실패했습니다.')
      setIsLoading(false)
      return false
    }
  }, [session?.user?.id])

  // 백업 삭제
  const deleteBackup = useCallback(async (projectId, backupId) => {
    if (!session?.user?.id || !backupId) return false

    try {
      const { error } = await supabase
        .from('backups')
        .delete()
        .eq('id', backupId)
        .eq('user_id', session.user.id)

      if (error) {
        console.error('백업 삭제 오류:', error.message)
        return false
      }

      return true
    } catch (err) {
      console.error('백업 삭제 오류:', err)
      return false
    }
  }, [session?.user?.id])

  // 백업 파일로 내보내기
  const exportBackup = useCallback((backup) => {
    if (!backup) return

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      description: backup.description,
      project: backup.project,
      pages: backup.pages,
    }

    const dataStr = JSON.stringify(exportData, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)

    const fileName = `thinkmap_backup_${backup.project.name}_${new Date(backup.createdAt).toISOString().split('T')[0]}.json`

    const link = document.createElement('a')
    link.setAttribute('href', dataUri)
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  // 파일에서 백업 가져오기
  const importBackup = useCallback((projectId) => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'

      input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) {
          resolve(null)
          return
        }

        try {
          setIsLoading(true)
          const text = await file.text()
          const importedData = JSON.parse(text)

          // 유효성 검사
          if (!importedData.version || !importedData.pages || !importedData.project) {
            setError('유효하지 않은 백업 파일입니다.')
            setIsLoading(false)
            resolve(null)
            return
          }

          // Supabase에 저장
          const { data, error } = await supabase
            .from('backups')
            .insert({
              user_id: session.user.id,
              project_id: projectId,
              description: `가져온 백업: ${importedData.description || '알 수 없음'}`,
              backup_data: {
                project: importedData.project,
                pages: importedData.pages,
                version: importedData.version,
              },
            })
            .select()
            .single()

          if (error) {
            console.error('백업 가져오기 저장 오류:', error.message)
            setError('백업 저장에 실패했습니다.')
            setIsLoading(false)
            resolve(null)
            return
          }

          setIsLoading(false)
          resolve({
            id: data.id,
            createdAt: data.created_at,
            description: data.description,
            project: importedData.project,
            pages: importedData.pages,
          })
        } catch (err) {
          console.error('백업 가져오기 오류:', err)
          setError('백업 파일을 읽는데 실패했습니다.')
          setIsLoading(false)
          resolve(null)
        }
      }

      input.click()
    })
  }, [session?.user?.id])

  return {
    isLoading,
    error,
    getBackups,
    createBackup,
    restoreBackup,
    deleteBackup,
    exportBackup,
    importBackup,
  }
}
