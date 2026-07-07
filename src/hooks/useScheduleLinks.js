// schedule_event_links CRUD + 현재 화면 events 의 links 한 번에 fetch.
//
// SPEC §8 — 일정 ↔ todo/page/block 양방향 참조.
// Phase 3a 는 todo 만 사용 (page/block 은 schema 만 준비, UI 후속).

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, logError } from '@thinkmap/core'

/**
 * @param {string[]} eventIds  화면에 보이는 schedule event_id 배열
 */
export function useScheduleLinks({ eventIds }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!eventIds || eventIds.length === 0) {
      setLinks([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('schedule_event_links')
        .select('*')
        .in('event_id', eventIds)
      if (error) throw error
      if (mountedRef.current) setLinks(data || [])
    } catch (err) {
      logError('useScheduleLinks.refetch', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [JSON.stringify(eventIds)])

  useEffect(() => { refetch() }, [refetch])

  const createLink = useCallback(async ({ event_id, instance_id = null, target_type, target_id, sync_check = true }) => {
    const row = { event_id, instance_id, target_type, target_id, sync_check }
    const { data, error } = await supabase
      .from('schedule_event_links')
      .insert(row)
      .select()
      .single()
    if (error) {
      logError('useScheduleLinks.create', error)
      throw error
    }
    if (mountedRef.current) setLinks(prev => [...prev, data])
    return data
  }, [])

  const deleteLink = useCallback(async (id) => {
    setLinks(prev => prev.filter(l => l.id !== id))
    const { error } = await supabase
      .from('schedule_event_links')
      .delete()
      .eq('id', id)
    if (error) {
      logError('useScheduleLinks.delete', error)
      refetch()
      throw error
    }
  }, [refetch])

  return { links, loading, refetch, createLink, deleteLink }
}
