// 목표(goals) 목록 + CRUD React 훅.
//
// goals 는 진행률을 저장하지 않는다 (조회 시점 계산 — goalUtils.js).
// 여기서는 정의(CRUD)만 책임진다. owner_user_id 귀속 / soft delete(deleted_at).

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, logError } from '@thinkmap/core'

/**
 * @param {Object} session  supabase auth session
 * v1: 본인(owner=self) 목표만 다룬다. linked 합산은 후속.
 */
export function useGoals(session) {
  const selfUid = session?.user?.id
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!selfUid) { setGoals([]); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('owner_user_id', selfUid)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      if (mountedRef.current) setGoals(data || [])
    } catch (err) {
      logError('useGoals.refetch', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [selfUid])

  useEffect(() => { refetch() }, [refetch])

  // draft → DB. 저장 버튼을 눌렀을 때만 호출 (EventEditor draft 패턴 준수).
  const createGoal = useCallback(async (draft) => {
    if (!selfUid) return null
    const row = {
      owner_user_id: selfUid,
      domain: draft.domain || 'general',
      title: draft.title || '',
      description: draft.description || null,
      metric_source: draft.metric_source,
      metric_filter: draft.metric_filter || {},
      target_value: Number(draft.target_value) || 0,
      current_value: draft.metric_source === 'manual' ? (Number(draft.current_value) || 0) : null,
      unit: draft.unit || null,
      period: draft.period || 'weekly',
      deadline: draft.deadline || null,
      is_shared: !!draft.is_shared,
      sort_order: draft.sort_order ?? 0,
    }
    const { data, error } = await supabase.from('goals').insert(row).select().single()
    if (error) { logError('useGoals.create', error); throw error }
    if (mountedRef.current) setGoals(prev => [...prev, data])
    return data
  }, [selfUid])

  const updateGoal = useCallback(async (id, patch) => {
    const clean = { ...patch }
    if ('target_value' in clean) clean.target_value = Number(clean.target_value) || 0
    if ('current_value' in clean && clean.current_value != null) clean.current_value = Number(clean.current_value)
    const { data, error } = await supabase
      .from('goals').update(clean).eq('id', id).select().single()
    if (error) { logError('useGoals.update', error); throw error }
    if (mountedRef.current) setGoals(prev => prev.map(g => (g.id === id ? data : g)))
    return data
  }, [])

  // soft delete
  const deleteGoal = useCallback(async (id) => {
    const { error } = await supabase
      .from('goals').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { logError('useGoals.delete', error); throw error }
    if (mountedRef.current) setGoals(prev => prev.filter(g => g.id !== id))
  }, [])

  return { goals, loading, refetch, createGoal, updateGoal, deleteGoal }
}
