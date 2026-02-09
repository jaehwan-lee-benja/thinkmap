import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * 사용자 관리 훅 (마스터 전용)
 */
export const useUsers = (session, isMaster) => {
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)

  // 사용자 목록 조회
  const fetchUsers = useCallback(async () => {
    if (!isMaster) return

    setUsersLoading(true)
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('사용자 목록 조회 오류:', error)
    } finally {
      setUsersLoading(false)
    }
  }, [isMaster])

  // 마스터 로그인 시 사용자 목록 조회
  useEffect(() => {
    if (isMaster) {
      fetchUsers()
    }
  }, [isMaster, fetchUsers])

  // 사용자 추가 (이메일로 초대)
  const addUser = useCallback(async (email, role = 'user') => {
    if (!isMaster) return null

    try {
      // 이미 등록된 사용자인지 확인
      const { data: existing } = await supabase
        .from('app_users')
        .select('id')
        .eq('email', email.toLowerCase())
        .single()

      if (existing) {
        alert('이미 등록된 사용자입니다.')
        return null
      }

      // 새 사용자 추가
      const { data, error } = await supabase
        .from('app_users')
        .insert({
          email: email.toLowerCase(),
          role: role,
          status: 'invited',
          invited_by: session?.user?.id,
        })
        .select()
        .single()

      if (error) throw error

      setUsers(prev => [data, ...prev])
      return data
    } catch (error) {
      console.error('사용자 추가 오류:', error)
      alert('사용자 추가 오류: ' + error.message)
      return null
    }
  }, [isMaster, session])

  // 사용자 역할 변경
  const updateUserRole = useCallback(async (userId, newRole) => {
    if (!isMaster) return false

    try {
      const { error } = await supabase
        .from('app_users')
        .update({ role: newRole })
        .eq('id', userId)

      if (error) throw error

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, role: newRole } : u
      ))
      return true
    } catch (error) {
      console.error('역할 변경 오류:', error)
      return false
    }
  }, [isMaster])

  // 사용자 상태 변경 (활성/비활성)
  const updateUserStatus = useCallback(async (userId, newStatus) => {
    if (!isMaster) return false

    try {
      const { error } = await supabase
        .from('app_users')
        .update({ status: newStatus })
        .eq('id', userId)

      if (error) throw error

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, status: newStatus } : u
      ))
      return true
    } catch (error) {
      console.error('상태 변경 오류:', error)
      return false
    }
  }, [isMaster])

  // 사용자 삭제
  const deleteUser = useCallback(async (userId) => {
    if (!isMaster) return false

    try {
      const { error } = await supabase
        .from('app_users')
        .delete()
        .eq('id', userId)

      if (error) throw error

      setUsers(prev => prev.filter(u => u.id !== userId))
      return true
    } catch (error) {
      console.error('사용자 삭제 오류:', error)
      return false
    }
  }, [isMaster])

  return {
    users,
    usersLoading,
    fetchUsers,
    addUser,
    updateUserRole,
    updateUserStatus,
    deleteUser,
  }
}
