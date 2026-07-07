import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useGoals } from '../../hooks/useGoals'
import { useDashboardData } from '../../hooks/useDashboardData'
import { useIsMobile } from '@thinkmap/core'
import { startOfWeek, addDays, isSameDay } from '../Schedule/scheduleUtils'
import GoalProgressWidget from './GoalProgressWidget'
import RoutineMatrixWidget from './RoutineMatrixWidget'
import TodoTrendWidget from './TodoTrendWidget'
import GoalEditorModal from './GoalEditorModal'
import './Dashboard.css'

/**
 * 통합 대시보드 — 목표 진행률 + 주간 루틴 매트릭스 + 투두 추이.
 * 기존 도메인 테이블을 읽어 집계만 한다 (데이터 복사 없음).
 * v1: 본인(owner=self) 데이터만.
 */
export default function DashboardPage({ session }) {
  const { isMobile } = useIsMobile()
  const selfUid = session?.user?.id

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const { goals, createGoal, updateGoal, deleteGoal } = useGoals(session)
  const { routineEvents, eventsById, instancesByEvent, todoBlocks } =
    useDashboardData(session, weekStart)

  // 목표 편집/생성 모달
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null) // null = 신규

  const openCreate = () => { setEditTarget(null); setEditorOpen(true) }
  const openEdit = (goal) => { setEditTarget(goal); setEditorOpen(true) }

  const handleSave = async (payload) => {
    if (editTarget?.id) await updateGoal(editTarget.id, payload)
    else await createGoal(payload)
  }

  const dataCtx = useMemo(
    () => ({ eventsById, instancesByEvent, todoBlocks, now: new Date() }),
    [eventsById, instancesByEvent, todoBlocks]
  )

  const isThisWeek = isSameDay(weekStart, startOfWeek(new Date()))
  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6)
    const f = (d) => `${d.getMonth() + 1}/${d.getDate()}`
    return `${f(weekStart)} – ${f(end)}`
  }, [weekStart?.getTime()])

  return (
    <div className={`dash-page ${isMobile ? 'is-mobile' : ''}`}>
      <div className="dash-toolbar">
        <h2 className="dash-title">대시보드</h2>
        <div className="dash-week-nav">
          <button className="dash-icon-btn" aria-label="이전 주"
            onClick={() => setWeekStart(w => addDays(w, -7))}><ChevronLeft size={16} /></button>
          <button className="dash-btn dash-week-label"
            onClick={() => setWeekStart(startOfWeek(new Date()))}>
            {isThisWeek ? '이번 주' : weekLabel}
          </button>
          <button className="dash-icon-btn" aria-label="다음 주"
            onClick={() => setWeekStart(w => addDays(w, 7))}><ChevronRight size={16} /></button>
        </div>
        <button className="dash-btn dash-btn-primary" onClick={openCreate}>
          <Plus size={14} /> 목표
        </button>
      </div>

      <div className="dash-grid">
        <GoalProgressWidget
          goals={goals}
          dataCtx={dataCtx}
          onEdit={openEdit}
          onCreate={openCreate}
        />
        <RoutineMatrixWidget
          routineEvents={routineEvents}
          instancesByEvent={instancesByEvent}
          weekStart={weekStart}
          selfUid={selfUid}
        />
        <TodoTrendWidget todoBlocks={todoBlocks} />
      </div>

      <GoalEditorModal
        isOpen={editorOpen}
        goal={editTarget}
        routineEvents={routineEvents}
        onSave={handleSave}
        onDelete={deleteGoal}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  )
}
