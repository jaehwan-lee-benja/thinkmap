// 대시보드 위젯/목표 진행률에 필요한 기존 도메인 데이터를 모아 fetch.
//
// 데이터 복사 없음 — 기존 테이블(schedule_events / schedule_event_instances /
// daily_blocks)을 읽어서 집계만 한다 (작업 지시서 §0 원칙 1).
// v1: 본인(owner=self) 데이터만. linked 합산은 후속.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { logError } from '../utils/supabaseError'
import { startOfWeek, addDays, dateKey } from '../components/Schedule/scheduleUtils'

function startOfYear(d) { return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0) }

/**
 * @param {Object} session
 * @param {Date}   weekStart  매트릭스가 보는 주의 시작(일요일). 펼침 범위에 포함시킨다.
 */
export function useDashboardData(session, weekStart) {
  const selfUid = session?.user?.id
  const [routineEvents, setRoutineEvents] = useState([]) // is_routine=true 본인 이벤트
  const [instances, setInstances] = useState([])
  const [todoBlocks, setTodoBlocks] = useState([])
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // fetch 범위: 연초 ~ (현재 주 끝, 보는 주 끝, 내일) 중 가장 늦은 시각.
  // → 연간 목표의 누적 + 임의 주차 매트릭스 모두 커버.
  const now = new Date()
  const rangeFrom = useMemo(() => {
    const a = startOfYear(now)
    return weekStart && weekStart < a ? weekStart : a
  }, [weekStart?.getTime()])
  const rangeTo = useMemo(() => {
    const candidates = [
      addDays(startOfWeek(now), 7),
      weekStart ? addDays(weekStart, 7) : null,
      addDays(now, 1),
    ].filter(Boolean)
    return new Date(Math.max(...candidates.map(d => d.getTime())))
  }, [weekStart?.getTime()])

  const refetch = useCallback(async () => {
    if (!selfUid) {
      setRoutineEvents([]); setInstances([]); setTodoBlocks([])
      return
    }
    setLoading(true)
    try {
      // 1) 본인 루틴 이벤트 (매트릭스 행 + 목표 event 드롭다운 + eventsById)
      const { data: evs, error: evErr } = await supabase
        .from('schedule_events')
        .select('id,owner_user_id,title,color,is_shared,is_routine,rrule,start_at,end_at,timezone,routine_until')
        .eq('owner_user_id', selfUid)
        .eq('is_routine', true)
        .is('deleted_at', null)
      if (evErr) throw evErr
      const events = evs || []

      // 2) 그 루틴들의 인스턴스 (체크/이동/취소) — 범위 내
      let insts = []
      if (events.length) {
        const { data: instData, error: instErr } = await supabase
          .from('schedule_event_instances')
          .select('*')
          .in('event_id', events.map(e => e.id))
          .gte('instance_start_at', rangeFrom.toISOString())
          .lt('instance_start_at', rangeTo.toISOString())
        if (instErr) throw instErr
        insts = instData || []
      }

      // 3) 본인 투두 (todo_completion + 추이 위젯) — 범위 내 (page_date 기준)
      const { data: todos, error: todoErr } = await supabase
        .from('daily_blocks')
        .select('page_id,page_date,todo_checked')
        .eq('user_id', selfUid)
        .eq('is_todo', true)
        .is('deleted_at', null)
        .gte('page_date', dateKey(rangeFrom))
        .lt('page_date', dateKey(rangeTo))
      if (todoErr) throw todoErr

      if (mountedRef.current) {
        setRoutineEvents(events)
        setInstances(insts)
        setTodoBlocks(todos || [])
      }
    } catch (err) {
      logError('useDashboardData.refetch', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [selfUid, rangeFrom.getTime(), rangeTo.getTime()])

  useEffect(() => { refetch() }, [refetch])

  // 파생: event_id → event, event_id → instance[]
  const eventsById = useMemo(() => {
    const m = {}
    for (const e of routineEvents) m[e.id] = e
    return m
  }, [routineEvents])

  const instancesByEvent = useMemo(() => {
    const m = {}
    for (const i of instances) (m[i.event_id] ||= []).push(i)
    return m
  }, [instances])

  return { routineEvents, instances, todoBlocks, eventsById, instancesByEvent, loading, refetch }
}
