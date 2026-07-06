import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@thinkmap/core'

/**
 * 연결 계정 훅 — 현재 로그인한 사용자가 접근 가능한 연결 계정 목록
 */
export const useLinkedAccounts = (session) => {
  const [linkedAccounts, setLinkedAccounts] = useState([])
  const [linkedAccountsLoading, setLinkedAccountsLoading] = useState(false)

  const fetchLinkedAccounts = useCallback(async () => {
    if (!session?.user?.id) return

    setLinkedAccountsLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_linked_accounts')

      if (error) throw error
      setLinkedAccounts(data || [])
    } catch (error) {
      console.error('연결 계정 조회 오류:', error)
      setLinkedAccounts([])
    } finally {
      setLinkedAccountsLoading(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    fetchLinkedAccounts()
  }, [fetchLinkedAccounts])

  return {
    linkedAccounts,
    linkedAccountsLoading,
    fetchLinkedAccounts,
  }
}

/**
 * 연결 계정 관리 훅 (마스터 전용) — 모든 연결 계정 CRUD
 */
export const useLinkedAccountsAdmin = (session, isMaster) => {
  const [allLinkedAccounts, setAllLinkedAccounts] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!isMaster) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('linked_accounts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setAllLinkedAccounts(data || [])
    } catch (error) {
      console.error('연결 계정 목록 조회 오류:', error)
    } finally {
      setLoading(false)
    }
  }, [isMaster])

  useEffect(() => {
    if (isMaster) fetchAll()
  }, [isMaster, fetchAll])

  const addLinkedAccount = useCallback(async (primaryEmail, linkedEmail, permission = 'editor') => {
    if (!isMaster) return null

    try {
      const { data: existing } = await supabase
        .from('linked_accounts')
        .select('id')
        .eq('primary_email', primaryEmail.toLowerCase())
        .eq('linked_email', linkedEmail.toLowerCase())
        .single()

      if (existing) {
        alert('이미 등록된 연결입니다.')
        return null
      }

      const { data, error } = await supabase
        .from('linked_accounts')
        .insert({
          primary_email: primaryEmail.toLowerCase(),
          linked_email: linkedEmail.toLowerCase(),
          permission,
        })
        .select()
        .single()

      if (error) throw error

      setAllLinkedAccounts(prev => [data, ...prev])
      return data
    } catch (error) {
      console.error('연결 계정 추가 오류:', error)
      alert('연결 계정 추가 오류: ' + error.message)
      return null
    }
  }, [isMaster])

  const updatePermission = useCallback(async (id, permission) => {
    if (!isMaster) return false

    try {
      const { error } = await supabase
        .from('linked_accounts')
        .update({ permission })
        .eq('id', id)

      if (error) throw error

      setAllLinkedAccounts(prev =>
        prev.map(la => la.id === id ? { ...la, permission } : la)
      )
      return true
    } catch (error) {
      console.error('권한 변경 오류:', error)
      return false
    }
  }, [isMaster])

  const deleteLinkedAccount = useCallback(async (id) => {
    if (!isMaster) return false

    try {
      const { error } = await supabase
        .from('linked_accounts')
        .delete()
        .eq('id', id)

      if (error) throw error

      setAllLinkedAccounts(prev => prev.filter(la => la.id !== id))
      return true
    } catch (error) {
      console.error('연결 계정 삭제 오류:', error)
      return false
    }
  }, [isMaster])

  return {
    allLinkedAccounts,
    loading,
    fetchAll,
    addLinkedAccount,
    updatePermission,
    deleteLinkedAccount,
  }
}
