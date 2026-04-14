import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'

/**
 * 업무일지 코멘트 훅
 * page_id 기준 코멘트 CRUD + 멘션 사용자 목록
 */
export function useWorklogComments(session, pageId, projectId) {
  const [comments, setComments] = useState([])
  const [mentionableUsers, setMentionableUsers] = useState([])
  const [loading, setLoading] = useState(false)

  // 코멘트 목록 로드
  const fetchComments = useCallback(async () => {
    if (!pageId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('worklog_comments')
        .select('*')
        .eq('page_id', pageId)
        .order('created_at', { ascending: true })

      if (logError('코멘트 로드', error)) return

      // user_id → 이메일 변환
      const userIds = [...new Set((data || []).map(c => c.user_id))]
      let emailMap = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('app_users')
          .select('auth_uid, email')
          .in('auth_uid', userIds)
        if (users) {
          users.forEach(u => { emailMap[u.auth_uid] = u.email })
        }
      }
      const enriched = (data || []).map(c => ({
        ...c,
        user_email: emailMap[c.user_id] || session?.user?.email || c.user_id,
      }))
      setComments(enriched)
    } catch (error) {
      logError('코멘트 로드', error)
    } finally {
      setLoading(false)
    }
  }, [pageId])

  // 멘션 가능 사용자 목록 로드
  const fetchMentionableUsers = useCallback(async () => {
    if (!session?.user?.id || !projectId) return
    try {
      // 프로젝트에 공유된 사용자
      const { data: sharesData } = await supabase
        .from('shares')
        .select('shared_with_email')
        .eq('resource_type', 'project')
        .eq('resource_id', projectId)

      const emails = new Set()
      emails.add(session.user.email)
      if (sharesData) {
        sharesData.forEach(s => emails.add(s.shared_with_email))
      }

      // linked_accounts
      const { data: linkedData } = await supabase
        .from('linked_accounts')
        .select('linked_email')
        .eq('primary_email', session.user.email)

      if (linkedData) {
        linkedData.forEach(la => emails.add(la.linked_email))
      }

      setMentionableUsers(
        [...emails].map(email => ({
          email,
          displayName: email.split('@')[0],
        }))
      )
    } catch (error) {
      logError('멘션 사용자 로드', error)
    }
  }, [session?.user?.id, session?.user?.email, projectId])

  useEffect(() => { fetchComments() }, [fetchComments])
  useEffect(() => { fetchMentionableUsers() }, [fetchMentionableUsers])

  // 실시간 구독
  useEffect(() => {
    if (!pageId) return
    const channel = supabase
      .channel(`worklog_comments:${pageId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'worklog_comments',
        filter: `page_id=eq.${pageId}`,
      }, () => {
        fetchComments()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [pageId, fetchComments])

  // 코멘트 추가
  const addComment = useCallback(async (content, mentions = [], targetType = 'page', targetId = null) => {
    if (!session?.user?.id || !pageId || !content.trim()) return null
    try {
      const { data, error } = await supabase
        .from('worklog_comments')
        .insert([{
          page_id: pageId,
          user_id: session.user.id,
          target_type: targetType,
          target_id: targetId,
          content: content.trim(),
          mentions,
        }])
        .select()
        .single()

      if (logError('코멘트 작성', error)) return null
      setComments(prev => [...prev, data])
      return data
    } catch (error) {
      logError('코멘트 작성', error)
      return null
    }
  }, [session?.user?.id, pageId])

  // 해결됨 토글
  const toggleResolved = useCallback(async (commentId) => {
    const comment = comments.find(c => c.id === commentId)
    if (!comment) return
    try {
      const { error } = await supabase
        .from('worklog_comments')
        .update({ resolved: !comment.resolved })
        .eq('id', commentId)

      if (logError('코멘트 해결 토글', error)) return
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: !c.resolved } : c))
    } catch (error) {
      logError('코멘트 해결 토글', error)
    }
  }, [comments])

  // 코멘트 삭제
  const deleteComment = useCallback(async (commentId) => {
    try {
      const { error } = await supabase
        .from('worklog_comments')
        .delete()
        .eq('id', commentId)

      if (logError('코멘트 삭제', error)) return
      setComments(prev => prev.filter(c => c.id !== commentId))
    } catch (error) {
      logError('코멘트 삭제', error)
    }
  }, [])

  return {
    comments,
    mentionableUsers,
    loading,
    addComment,
    toggleResolved,
    deleteComment,
  }
}
