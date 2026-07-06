// 루틴 인스턴스(schedule_event_instances) fetch + upsert.
//
// 인스턴스는 SPEC §7.3 에 따라 lazily 생성: 체크/이동/취소 시점에 INSERT 또는 UPDATE.
// 한 번 만들어진 row 는 그대로 유지 (취소 풀어도 row 삭제하지 않음 — completed=false 등으로 update).

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@thinkmap/core'
import { logError } from '../utils/supabaseError'

/**
 * @param {Object} args
 * @param {string[]} args.eventIds  현재 화면에 표시되는 routine event_id 들
 * @param {Date}     args.from
 * @param {Date}     args.to
 */
export function useScheduleInstances({ eventIds, from, to }) {
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(async () => {
    if (!eventIds || eventIds.length === 0 || !from || !to) {
      setInstances([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('schedule_event_instances')
        .select('*')
        .in('event_id', eventIds)
        .gte('instance_start_at', from.toISOString())
        .lt('instance_start_at', to.toISOString())
      if (error) throw error
      if (mountedRef.current) setInstances(data || [])
    } catch (err) {
      logError('useScheduleInstances.refetch', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [JSON.stringify(eventIds), from?.getTime(), to?.getTime()])

  useEffect(() => { refetch() }, [refetch])

  /**
   * 인스턴스 한 행을 upsert.
   * key = (event_id, instance_start_at). 기존 row 가 있으면 patch 머지.
   */
  const upsertInstance = useCallback(async ({ event_id, instance_start_at, ...patch }) => {
    const instanceIso = instance_start_at instanceof Date
      ? instance_start_at.toISOString()
      : instance_start_at

    // 낙관적: 로컬 먼저
    setInstances(prev => {
      const idx = prev.findIndex(
        i => i.event_id === event_id && new Date(i.instance_start_at).toISOString() === instanceIso
      )
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], ...patch }
        return next
      }
      return [...prev, { event_id, instance_start_at: instanceIso, ...patch, id: 'tmp-' + Math.random() }]
    })

    const row = {
      event_id,
      instance_start_at: instanceIso,
      ...patch,
    }
    const { data, error } = await supabase
      .from('schedule_event_instances')
      .upsert(row, { onConflict: 'event_id,instance_start_at' })
      .select()
      .single()

    if (error) {
      logError('useScheduleInstances.upsert', error)
      refetch()
      throw error
    }
    if (mountedRef.current) {
      setInstances(prev => {
        const idx = prev.findIndex(
          i => i.event_id === event_id && new Date(i.instance_start_at).toISOString() === instanceIso
        )
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = data
          return next
        }
        return [...prev, data]
      })
    }
    return data
  }, [refetch])

  const toggleCompleted = useCallback((occurrence) => {
    return upsertInstance({
      event_id: occurrence.event_id,
      instance_start_at: occurrence.instance_start_at,
      completed: !occurrence.completed,
      completed_at: !occurrence.completed ? new Date().toISOString() : null,
    })
  }, [upsertInstance])

  return { instances, loading, refetch, upsertInstance, toggleCompleted }
}
