// 캘린더(schedule) 일정 CRUD + 주간 범위 fetch React 훅.
//
// 책임:
//   - [from, to) 범위의 schedule_events 를 가져옴 (RPC get_schedule_events_in_range)
//   - createEvent / updateEvent / deleteEvent (낙관적 업데이트 + 실패 시 refetch)
//   - ownerIds (uuid[]) 로 표시 owner 명시. masterAll=true 면 RLS 허용 모든 owner.
//
// Phase 1 은 단발 일정만. is_routine / instance / link 는 Phase 2/3 에서 확장.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'

/**
 * @param {Object} args
 * @param {Date}   args.from         범위 시작 (포함)
 * @param {Date}   args.to           범위 끝 (제외)
 * @param {string[]} args.ownerIds   표시할 owner uuid 배열. 빈 배열이면 결과 0개 (fetch 생략).
 * @param {boolean} [args.masterAll=false]  마스터의 "전체 계정" 토글. true 면 ownerIds 무시하고 RLS 허용 전체.
 * @param {Object} args.session      supabase auth session
 */
export function useScheduleEvents({ from, to, ownerIds = [], masterAll = false, session }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!session?.user?.id || !from || !to) {
      setEvents([])
      return
    }
    // 마스터 전체 모드가 아니고 선택 owner 가 0개면 fetch 생략
    if (!masterAll && (!ownerIds || ownerIds.length === 0)) {
      setEvents([])
      return
    }
    setLoading(true)
    try {
      // masterAll 이면 p_owner_ids = null → RPC 가 RLS 허용 전체 반환
      const p_owner_ids = masterAll ? null : ownerIds

      const { data, error: rpcErr } = await supabase.rpc('get_schedule_events_in_range', {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_owner_ids,
        p_shared_only: false,
      })

      if (rpcErr) throw rpcErr
      if (mountedRef.current) setEvents(data || [])
    } catch (err) {
      logError('useScheduleEvents.refetch', err)
      if (mountedRef.current) setError(err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [from?.getTime(), to?.getTime(), JSON.stringify(ownerIds), masterAll, session?.user?.id])

  useEffect(() => { refetch() }, [refetch])

  const createEvent = useCallback(async (payload) => {
    const row = {
      owner_user_id: payload.owner_user_id || session?.user?.id,
      title: payload.title || '',
      description: payload.description || null,
      color: payload.color || '#3b82f6',
      start_at: payload.start_at,
      end_at: payload.end_at,
      all_day: !!payload.all_day,
      timezone: payload.timezone || 'Asia/Seoul',
      is_shared: !!payload.is_shared,
      is_routine: !!payload.is_routine,
      rrule: payload.rrule || null,
      routine_until: payload.routine_until || null,
    }
    const { data, error: insErr } = await supabase
      .from('schedule_events')
      .insert(row)
      .select()
      .single()
    if (insErr) { logError('useScheduleEvents.create', insErr); throw insErr }
    if (mountedRef.current) setEvents(prev => [...prev, data])
    return data
  }, [session?.user?.id])

  const updateEvent = useCallback(async (id, patch) => {
    // 낙관적: 로컬 먼저 반영
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
    const { data, error: updErr } = await supabase
      .from('schedule_events')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (updErr) {
      logError('useScheduleEvents.update', updErr)
      refetch()   // 롤백
      throw updErr
    }
    if (mountedRef.current) setEvents(prev => prev.map(e => e.id === id ? data : e))
    return data
  }, [refetch])

  // 단발 이벤트 체크 토글. 루틴은 useScheduleInstances 의 toggleCompleted 사용.
  const toggleEventCompleted = useCallback(async (id, currentCompleted) => {
    const next = !currentCompleted
    setEvents(prev => prev.map(e =>
      e.id === id
        ? { ...e, completed: next, completed_at: next ? new Date().toISOString() : null }
        : e
    ))
    const { data, error: updErr } = await supabase
      .from('schedule_events')
      .update({ completed: next, completed_at: next ? new Date().toISOString() : null })
      .eq('id', id)
      .select()
      .single()
    if (updErr) {
      logError('useScheduleEvents.toggleCompleted', updErr)
      refetch()   // 롤백
      throw updErr
    }
    if (mountedRef.current) setEvents(prev => prev.map(e => e.id === id ? data : e))
    return data
  }, [refetch])

  const deleteEvent = useCallback(async (id) => {
    setEvents(prev => prev.filter(e => e.id !== id))
    // soft delete
    const { error: delErr } = await supabase
      .from('schedule_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (delErr) {
      logError('useScheduleEvents.delete', delErr)
      refetch()
      throw delErr
    }
  }, [refetch])

  return {
    events,
    loading,
    error,
    refetch,
    createEvent,
    updateEvent,
    toggleEventCompleted,
    deleteEvent,
  }
}
