import React, { useEffect, useMemo, useRef, useState } from 'react'
import TimeBox from './TimeBox'
import {
  HOUR_PX, SLOT_MINUTES, PX_PER_MIN,
  startOfWeek, addDays, isSameDay,
  layoutDayColumn, snapToSlot,
  minutesFromMidnight,
} from './scheduleUtils'
import { DAY_NAMES } from '../../utils/dateUtils'

/**
 * 주간 뷰 — 7일 × 24시간 그리드 + occurrence 렌더 + 드래그 생성/이동/리사이즈
 *
 * @param weekStart        주의 시작 (Date, 일요일 00:00)
 * @param occurrences      해당 주의 Occurrence 배열 (단발/루틴 통일)
 * @param selfUid          현재 사용자 uuid
 * @param ownerEmailByUid  { [uid]: email } — tooltip 용
 * @param onUpdate         (occ, patch) → Promise — 단발/루틴 분기는 부모가 처리
 * @param onSelect         (occOrDraft) → void — 박스 클릭 또는 신규 draft 생성
 * @param onToggleCheck    (occ) → void — 루틴 체크
 * @param pendingDraft     EventEditor 에서 편집 중인 draft (없으면 null).
 *                         있으면 해당 시간 슬롯을 선택 표시로 계속 그림.
 *
 * 신규 생성: 빈 영역 드래그 종료 시 DB 저장하지 않고 draft 객체만 만들어
 *           onSelect(draft) 로 넘김. 부모는 EventEditor 를 띄우고, 사용자가
 *           저장 버튼을 눌렀을 때 비로소 createEvent 호출 (Google Calendar 패턴).
 */
export default function WeekView({
  weekStart, occurrences, selfUid, ownerEmailByUid,
  onUpdate, onSelect, onToggleCheck, pendingDraft,
}) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime()]
  )

  // 현재 시각 라인
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // 컬럼별 layout 계산 — occurrence 를 schedule_events 형태로 어댑트해서 layoutDayColumn 재사용
  const layoutsByDay = useMemo(() => {
    return days.map(day => {
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
      const inDay = occurrences.filter(o => {
        const s = new Date(o.start_at), en = new Date(o.end_at)
        return s < dayEnd && en > dayStart
      })
      return layoutDayColumn(inDay)
    })
  }, [days, occurrences])

  // ── 드래그 상태 ─────────────────────────────────────────────
  const [drag, setDrag] = useState(null)
  const bodyRef = useRef(null)
  const colRefs = useRef([])

  const yToTime = (dayDate, y) => {
    const totalMin = (y / HOUR_PX) * 60
    const snapped = Math.round(totalMin / SLOT_MINUTES) * SLOT_MINUTES
    const clamped = Math.max(0, Math.min(24 * 60 - SLOT_MINUTES, snapped))
    const d = new Date(dayDate)
    d.setHours(0, clamped, 0, 0)
    return d
  }

  const handleColumnMouseDown = (e, dayIdx) => {
    if (e.button !== 0) return
    const col = colRefs.current[dayIdx]
    if (!col) return
    const rect = col.getBoundingClientRect()
    const y = e.clientY - rect.top
    const startTime = yToTime(days[dayIdx], y)
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000)
    setDrag({
      mode: 'create',
      dayIdx,
      startTime,
      endTime,
      anchorY: y,
    })
    e.preventDefault()
  }

  const handleBoxDragStart = (e, occ) => {
    if (e.button !== 0) return
    const dayIdx = days.findIndex(d => isSameDay(d, new Date(occ.start_at)))
    if (dayIdx < 0) return
    const col = colRefs.current[dayIdx]
    if (!col) return
    const rect = col.getBoundingClientRect()
    const grabY = e.clientY - rect.top
    const startTopY = (minutesFromMidnight(new Date(occ.start_at)) / 60) * HOUR_PX
    setDrag({
      mode: 'move',
      occ,
      dayIdx,
      duration: new Date(occ.end_at) - new Date(occ.start_at),
      grabOffsetPx: grabY - startTopY,
    })
    e.preventDefault()
  }

  const handleBoxResizeStart = (e, occ) => {
    if (e.button !== 0) return
    const dayIdx = days.findIndex(d => isSameDay(d, new Date(occ.start_at)))
    if (dayIdx < 0) return
    setDrag({
      mode: 'resize',
      occ,
      dayIdx,
      startAt: new Date(occ.start_at),
    })
    e.preventDefault()
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e) => {
      const col = colRefs.current[drag.dayIdx]
      if (!col) return
      const rect = col.getBoundingClientRect()
      const y = e.clientY - rect.top

      if (drag.mode === 'create') {
        const t = yToTime(days[drag.dayIdx], y)
        const anchorTime = yToTime(days[drag.dayIdx], drag.anchorY)
        const a = anchorTime < t ? anchorTime : t
        const b = anchorTime < t ? t : anchorTime
        const endAdj = b.getTime() === a.getTime() ? new Date(a.getTime() + SLOT_MINUTES * 60_000) : b
        setDrag(d => ({ ...d, startTime: a, endTime: endAdj }))
      } else if (drag.mode === 'move') {
        const newTopY = y - drag.grabOffsetPx
        const newStart = yToTime(days[drag.dayIdx], newTopY)
        const newEnd = new Date(newStart.getTime() + drag.duration)
        setDrag(d => ({ ...d, previewStart: newStart, previewEnd: newEnd }))
      } else if (drag.mode === 'resize') {
        const newEnd = yToTime(days[drag.dayIdx], y)
        const minEnd = new Date(drag.startAt.getTime() + SLOT_MINUTES * 60_000)
        setDrag(d => ({ ...d, previewEnd: newEnd > minEnd ? newEnd : minEnd }))
      }
    }
    const onUp = async () => {
      if (drag.mode === 'create' && drag.startTime && drag.endTime) {
        // DB 저장 없이 draft 만 만들어 EventEditor 로 넘김
        const draft = {
          __draft: true,
          title: '',
          description: null,
          color: '#3b82f6',
          start_at: drag.startTime.toISOString(),
          end_at: drag.endTime.toISOString(),
          is_shared: false,
          is_routine: false,
          rrule: null,
          all_day: false,
        }
        // EventEditor 위치 계산용 anchorRect — 막 그렸던 박스의 화면 좌표
        let anchorRect = null
        const col = colRefs.current[drag.dayIdx]
        if (col) {
          const colRect = col.getBoundingClientRect()
          const topY = (minutesFromMidnight(drag.startTime) / 60) * HOUR_PX
          const h = ((drag.endTime - drag.startTime) / 60000) * PX_PER_MIN
          anchorRect = {
            top:    colRect.top + topY,
            bottom: colRect.top + topY + h,
            left:   colRect.left,
            right:  colRect.right,
            width:  colRect.width,
            height: h,
          }
        }
        if (onSelect) onSelect(draft, anchorRect)
      } else if (drag.mode === 'move' && drag.previewStart) {
        await onUpdate(drag.occ, {
          start_at: drag.previewStart.toISOString(),
          end_at: drag.previewEnd.toISOString(),
        })
      } else if (drag.mode === 'resize' && drag.previewEnd) {
        await onUpdate(drag.occ, { end_at: drag.previewEnd.toISOString() })
      }
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, days, onUpdate, onSelect])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 8 * HOUR_PX
  }, [])

  return (
    <div className="week-view">
      <div className="week-view-header">
        <div className="corner" />
        {days.map((d, i) => (
          <div key={i} className={`day-cell ${isSameDay(d, now) ? 'today' : ''}`}>
            <div className="weekday">{DAY_NAMES[d.getDay()]}</div>
            <div className="date">{d.getDate()}</div>
          </div>
        ))}
      </div>

      <div className="week-view-body" ref={bodyRef}>
        <div
          className="week-grid"
          style={{
            height: `${24 * HOUR_PX}px`,
            ['--hour-px']: `${HOUR_PX}px`,
          }}
        >
          <div style={{ position: 'relative', borderRight: '1px solid var(--color-border-light)' }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="hour-label"
                style={{ position: 'absolute', top: `${h * HOUR_PX - 6}px`, right: 0, left: 0 }}
              >
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {days.map((day, idx) => {
            const layout = layoutsByDay[idx]
            const isToday = isSameDay(day, now)
            const nowTop = isToday ? (minutesFromMidnight(now) / 60) * HOUR_PX : null

            let preview = null
            if (drag && drag.dayIdx === idx) {
              if (drag.mode === 'create' && drag.startTime && drag.endTime) {
                const top = (minutesFromMidnight(drag.startTime) / 60) * HOUR_PX
                const h = ((drag.endTime - drag.startTime) / 60000) * PX_PER_MIN
                preview = { top, h }
              } else if (drag.mode === 'move' && drag.previewStart) {
                const top = (minutesFromMidnight(drag.previewStart) / 60) * HOUR_PX
                const h = ((drag.previewEnd - drag.previewStart) / 60000) * PX_PER_MIN
                preview = { top, h }
              } else if (drag.mode === 'resize' && drag.previewEnd) {
                const top = (minutesFromMidnight(new Date(drag.occ.start_at)) / 60) * HOUR_PX
                const h = ((drag.previewEnd - new Date(drag.occ.start_at)) / 60000) * PX_PER_MIN
                preview = { top, h }
              }
            }

            // EventEditor 가 draft 를 편집 중이면 해당 시간 슬롯을 같은 점선 박스로 유지
            // (드래그 중 preview 와 동일 스타일 — 사용자가 "이 구역을 만지고 있다" 는 컨텍스트 유지)
            if (!preview && pendingDraft && pendingDraft.start_at && pendingDraft.end_at) {
              const draftStart = new Date(pendingDraft.start_at)
              const draftEnd = new Date(pendingDraft.end_at)
              if (isSameDay(draftStart, day)) {
                const top = (minutesFromMidnight(draftStart) / 60) * HOUR_PX
                const h = ((draftEnd - draftStart) / 60000) * PX_PER_MIN
                preview = { top, h }
              }
            }

            return (
              <div
                key={idx}
                ref={el => (colRefs.current[idx] = el)}
                className={`day-column ${isToday ? 'today' : ''}`}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) handleColumnMouseDown(e, idx)
                }}
              >
                {layout.map(({ event: occ, col, colCount }) => (
                  <TimeBox
                    key={occ.id}
                    occ={occ}
                    dayDate={day}
                    col={col}
                    colCount={colCount}
                    selfUid={selfUid}
                    ownerEmail={ownerEmailByUid?.[occ.owner_user_id]}
                    onClick={onSelect}
                    onDragStart={handleBoxDragStart}
                    onResizeStart={handleBoxResizeStart}
                    onToggleCheck={onToggleCheck}
                  />
                ))}

                {preview && (
                  <div
                    className="timebox preview"
                    style={{ top: `${preview.top}px`, height: `${preview.h}px`, left: 2, right: 2 }}
                  />
                )}

                {isToday && nowTop !== null && (
                  <div className="now-line" style={{ top: `${nowTop}px` }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
