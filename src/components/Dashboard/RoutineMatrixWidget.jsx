import React, { useMemo } from 'react'
import { addDays, dateKey, ownerHue } from '../Schedule/scheduleUtils'
import { expandRoutine } from '../Schedule/routineUtils'

// 위젯 2: 주간 루틴 매트릭스.
//   행 = 본인 루틴(is_routine) 이벤트, 열 = 요일(일~토).
//   완료 = 채움, 미완료(예정) = 빈칸, 회차 없음 = 점, 취소는 expandRoutine 단계에서 이미 제외.
//   캘린더 owner hue 규칙(ownerHue)과 색 일관성 유지.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function RoutineMatrixWidget({ routineEvents, instancesByEvent, weekStart, selfUid }) {
  const weekTo = useMemo(() => addDays(weekStart, 7), [weekStart?.getTime()])
  const dayKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => dateKey(addDays(weekStart, i))),
    [weekStart?.getTime()]
  )

  // 각 루틴을 이번 주로 펼쳐 day_key → occurrence 맵 생성
  const rows = useMemo(() => {
    return routineEvents.map(ev => {
      const insts = instancesByEvent[ev.id] || []
      const occs = expandRoutine(ev, weekStart, weekTo, insts)
      const byDay = {}
      for (const o of occs) byDay[dateKey(o.start_at)] = o
      return { event: ev, byDay }
    }).filter(r => Object.keys(r.byDay).length > 0) // 이번 주 회차가 없는 루틴은 숨김
  }, [routineEvents, instancesByEvent, weekStart?.getTime(), weekTo?.getTime()])

  return (
    <div className="dash-widget">
      <div className="dash-widget-head"><h3>주간 루틴 매트릭스</h3></div>
      {rows.length === 0 ? (
        <div className="dash-empty"><p>이번 주 루틴이 없습니다.</p></div>
      ) : (
        <div className="dash-matrix">
          <div className="dash-matrix-headrow">
            <div className="dash-matrix-rowlabel" />
            {WEEKDAYS.map(w => <div key={w} className="dash-matrix-col">{w}</div>)}
          </div>
          {rows.map(({ event, byDay }) => {
            const hue = ownerHue(event.owner_user_id, selfUid)
            return (
              <div key={event.id} className="dash-matrix-row">
                <div className="dash-matrix-rowlabel" title={event.title}>
                  <span className="dash-hue-dot" style={{ background: hue }} />
                  <span className="dash-matrix-name">{event.title || '(제목 없음)'}</span>
                </div>
                {dayKeys.map(k => {
                  const occ = byDay[k]
                  let cls = 'dash-cell'
                  if (!occ) cls += ' is-none'
                  else if (occ.completed) cls += ' is-done'
                  else cls += ' is-pending'
                  return (
                    <div key={k} className="dash-matrix-col">
                      <span
                        className={cls}
                        style={occ?.completed ? { background: hue, borderColor: hue } : undefined}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
