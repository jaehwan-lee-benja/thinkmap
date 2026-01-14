import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 공유 관리 훅
 */
export const useSharing = (session) => {
  const [shares, setShares] = useState([])
  const [sharedWithMe, setSharedWithMe] = useState({ projects: [], pages: [] })
  const [sharingLoading, setSharingLoading] = useState(false)

  // 내가 공유한 항목 목록 로드
  const fetchMyShares = useCallback(async () => {
    if (!session?.user?.id) return

    try {
      const { data, error } = await supabase
        .from('shares')
        .select('*')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('공유 목록 로드 오류:', error.message)
        return
      }

      setShares(data || [])
    } catch (error) {
      console.error('공유 목록 로드 오류:', error.message)
    }
  }, [session?.user?.id])

  // 나에게 공유된 항목 목록 로드
  const fetchSharedWithMe = useCallback(async () => {
    if (!session?.user?.id) return

    try {
      // 나에게 공유된 shares 조회
      const { data: sharesData, error: sharesError } = await supabase
        .from('shares')
        .select('*')
        .eq('shared_with_user_id', session.user.id)

      if (sharesError) {
        console.error('공유받은 항목 로드 오류:', sharesError.message)
        return
      }

      if (!sharesData || sharesData.length === 0) {
        setSharedWithMe({ projects: [], pages: [] })
        return
      }

      // 프로젝트와 페이지 ID 분류
      const projectIds = sharesData
        .filter(s => s.resource_type === 'project')
        .map(s => s.resource_id)
      const pageIds = sharesData
        .filter(s => s.resource_type === 'page')
        .map(s => s.resource_id)

      // 공유받은 프로젝트 조회
      let sharedProjects = []
      if (projectIds.length > 0) {
        const { data: projectsData } = await supabase
          .from('projects')
          .select('*')
          .in('id', projectIds)

        sharedProjects = (projectsData || []).map(p => ({
          ...p,
          shareInfo: sharesData.find(s => s.resource_id === p.id),
          isShared: true
        }))
      }

      // 공유받은 페이지 조회
      let sharedPages = []
      if (pageIds.length > 0) {
        const { data: pagesData } = await supabase
          .from('pages')
          .select('*, projects(name)')
          .in('id', pageIds)

        sharedPages = (pagesData || []).map(p => ({
          ...p,
          shareInfo: sharesData.find(s => s.resource_id === p.id),
          isShared: true
        }))
      }

      setSharedWithMe({
        projects: sharedProjects,
        pages: sharedPages
      })
    } catch (error) {
      console.error('공유받은 항목 로드 오류:', error.message)
    }
  }, [session?.user?.id])

  // 새 공유 생성
  const createShare = async (resourceType, resourceId, email, permission = 'viewer') => {
    if (!session?.user?.id) return { success: false, error: '로그인이 필요합니다.' }

    // 자기 자신에게 공유 방지
    if (email === session.user.email) {
      return { success: false, error: '자신에게는 공유할 수 없습니다.' }
    }

    setSharingLoading(true)
    try {
      const { data, error } = await supabase
        .from('shares')
        .insert([{
          resource_type: resourceType,
          resource_id: resourceId,
          owner_id: session.user.id,
          shared_with_email: email.trim().toLowerCase(),
          permission
        }])
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: '이미 해당 사용자에게 공유되어 있습니다.' }
        }
        console.error('공유 생성 오류:', error.message)
        return { success: false, error: error.message }
      }

      setShares(prev => [data, ...prev])
      return { success: true, data }
    } catch (error) {
      console.error('공유 생성 오류:', error.message)
      return { success: false, error: error.message }
    } finally {
      setSharingLoading(false)
    }
  }

  // 공유 권한 변경
  const updateSharePermission = async (shareId, newPermission) => {
    if (!session?.user?.id) return false

    try {
      const { error } = await supabase
        .from('shares')
        .update({ permission: newPermission, updated_at: new Date().toISOString() })
        .eq('id', shareId)
        .eq('owner_id', session.user.id)

      if (error) {
        console.error('권한 변경 오류:', error.message)
        return false
      }

      setShares(prev => prev.map(s =>
        s.id === shareId ? { ...s, permission: newPermission } : s
      ))
      return true
    } catch (error) {
      console.error('권한 변경 오류:', error.message)
      return false
    }
  }

  // 공유 삭제
  const deleteShare = async (shareId) => {
    if (!session?.user?.id) return false

    try {
      const { error } = await supabase
        .from('shares')
        .delete()
        .eq('id', shareId)
        .eq('owner_id', session.user.id)

      if (error) {
        console.error('공유 삭제 오류:', error.message)
        return false
      }

      setShares(prev => prev.filter(s => s.id !== shareId))
      return true
    } catch (error) {
      console.error('공유 삭제 오류:', error.message)
      return false
    }
  }

  // 특정 리소스의 공유 목록 조회
  const getSharesForResource = (resourceType, resourceId) => {
    return shares.filter(s =>
      s.resource_type === resourceType && s.resource_id === resourceId
    )
  }

  // 특정 리소스에 대한 내 권한 확인
  const getMyPermission = (resourceType, resourceId) => {
    // 프로젝트인 경우
    const projectShare = sharedWithMe.projects.find(p => p.id === resourceId)
    if (projectShare) return projectShare.shareInfo?.permission

    // 페이지인 경우 (직접 공유 또는 프로젝트 공유 통해)
    const pageShare = sharedWithMe.pages.find(p => p.id === resourceId)
    if (pageShare) return pageShare.shareInfo?.permission

    // 페이지가 속한 프로젝트가 공유된 경우
    if (resourceType === 'page') {
      const page = sharedWithMe.pages.find(p => p.id === resourceId)
      if (page) {
        const projectShare = sharedWithMe.projects.find(p => p.id === page.project_id)
        if (projectShare) return projectShare.shareInfo?.permission
      }
    }

    return null
  }

  // 세션 변경 시 공유 목록 로드
  useEffect(() => {
    if (session?.user?.id) {
      fetchMyShares()
      fetchSharedWithMe()
    } else {
      setShares([])
      setSharedWithMe({ projects: [], pages: [] })
    }
  }, [session?.user?.id, fetchMyShares, fetchSharedWithMe])

  return {
    shares,
    sharedWithMe,
    sharingLoading,
    fetchMyShares,
    fetchSharedWithMe,
    createShare,
    updateSharePermission,
    deleteShare,
    getSharesForResource,
    getMyPermission,
  }
}
