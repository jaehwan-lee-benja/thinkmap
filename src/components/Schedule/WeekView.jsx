import React, { useEffect, useMemo, useRef, useState } from 'react'
import TimeBox from './TimeBox'
import {
  HOUR_PX, SLOT_MINUTES, PX_PER_MIN,
  startOfWeek, addDays, isSameDay,
  layoutDayColumn, snapToSlot,
  minutesFromMidnight, ownerHue,
} from './scheduleUtils'
import { DAY_NAMES } from '../../utils/dateUtils'

/**
 * 시간축 뷰 — N일 × 24시간 그리드 + occurrence 렌더 + 드래그 생성/이동/리사이즈
 * dayCount=7 (주간 뷰) / 3 (모바일 3일 뷰) 등으로 재사용.
 *
 * @param weekStart        뷰 시작 (Date)
 * @param dayCount         표시할 일수 (기본 7)
 * @param occurrences      해당 범위의 Occurrence 배열
 * @param ...etc
 */
export default function WeekView({
  weekStart, dayCount = 7, occurrences, selfUid, ownerEmailByUid, colorLabels,
  onUpdate, onSelect, onToggleCheck, pendingDraft,
}) {
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime(), dayCount]
  )
  const gridCols = `60px repeat(${dayCount}, 1fr)`

  // all_day 와 시간 이벤트 분리
  const timedOccurrences = useMemo(() => occurrences.filter(o => !o.all_day), [occurrences])
  const allDayOccurrences = useMemo(() => occurrences.filter(o => o.all_day), [occurrences])

  // 현재 시각 라인
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // 컬럼별 layout 계산 (시간 이벤트만)
  const layoutsByDay = useMemo(() => {
    return days.map(day => {
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
      const inDay = timedOccurrences.filter(o => {
        const s = new Date(o.start_at), en = new Date(o.end_at)
        return s < dayEnd && en > dayStart
      })
      return layoutDayColumn(inDay)
    })
  }, [days, timedOccurrences])

  // all_day 막대 — day 별 그루핑
  const allDayByDayIdx = useMemo(() => {
    const out = days.map(() => [])
    allDayOccurrences.forEach(o => {
      const s = new Date(o.start_at)
      const e = new Date(o.end_at)
      days.forEach((d, i) => {
        const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)
        if (s < dayEnd && e > dayStart) out[i].push(o)
      })
    })
    return out
  }, [days, allDayOccurrences])

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
      startX: e.clientX,
      startY: e.clientY,
      boxRect: e.currentTarget.getBoundingClientRect(),
      moved: false,
    })
    e.preventDefault()
  }

  const handleBoxResizeStart = (e, occ, edge = 'bottom') => {
    if (e.button !== 0) return
    const dayIdx = days.findIndex(d => isSameDay(d, new Date(occ.start_at)))
    if (dayIdx < 0) return
    setDrag({
      mode: 'resize',
      edge,                          // 'top' | 'bottom'
      occ,
      dayIdx,
      startAt: new Date(occ.start_at),
      endAt: new Date(occ.end_at),
    })
    e.preventDefault()
  }

  // 화면 X 좌표로 day-column 인덱스 찾기 (좌우 X축 드래그 추적용)
  const findDayIdxAt = (clientX) => {
    for (let i = 0; i < colRefs.current.length; i++) {
      const c = colRefs.current[i]
      if (!c) continue
      const r = c.getBoundingClientRect()
      if (clientX >= r.left && clientX < r.right) return i
    }
    return -1
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e) => {
      if (drag.mode === 'move') {
        // 3px 임계 미만이면 click 으로 간주 (preview 미발생) — §13.1
        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY
        if (!drag.moved && dx * dx + dy * dy < 9) return

        // 다른 day-column 위로 이동했으면 dayIdx 갱신 (X축 드래그)
        const overIdx = findDayIdxAt(e.clientX)
        const effectiveDayIdx = overIdx >= 0 ? overIdx : drag.dayIdx
        const col = colRefs.current[effectiveDayIdx]
        if (!col) return
        const rect = col.getBoundingClientRect()
        const y = e.clientY - rect.top
        const newTopY = y - drag.grabOffsetPx
        const newStart = yToTime(days[effectiveDayIdx], newTopY)
        const newEnd = new Date(newStart.getTime() + drag.duration)
        setDrag(d => ({ ...d, moved: true, dayIdx: effectiveDayIdx, previewStart: newStart, previewEnd: newEnd }))
        return
      }

      const col = colRefs.current[drag.dayIdx]
      if (!col) return
      const rect = col.getBoundingClientRect()
      const y = e.clientY - rect.top

      if (drag.mode === 'create') {
        // 신규 생성은 시작 컬럼 고정 (Google Calendar 동일 패턴)
        const t = yToTime(days[drag.dayIdx], y)
        const anchorTime = yToTime(days[drag.dayIdx], drag.anchorY)
        const a = anchorTime < t ? anchorTime : t
        const b = anchorTime < t ? t : anchorTime
        const endAdj = b.getTime() === a.getTime() ? new Date(a.getTime() + SLOT_MINUTES * 60_000) : b
        setDrag(d => ({ ...d, startTime: a, endTime: endAdj }))
      } else if (drag.mode === 'resize') {
        // 같은 컬럼 안에서 resize (자정 넘어가는 케이스는 §13.4 후속)
        const t = yToTime(days[drag.dayIdx], y)
        if (drag.edge === 'top') {
          // start_at 변경, end_at 보존. 최소 SLOT_MINUTES 보장 (end 직전).
          const maxStart = new Date(drag.endAt.getTime() - SLOT_MINUTES * 60_000)
          setDrag(d => ({ ...d, previewStart: t < maxStart ? t : maxStart }))
        } else {
          // bottom — end_at 변경
          const minEnd = new Date(drag.startAt.getTime() + SLOT_MINUTES * 60_000)
          setDrag(d => ({ ...d, previewEnd: t > minEnd ? t : minEnd }))
        }
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
      } else if (drag.mode === 'move') {
        if (drag.moved && drag.previewStart) {
          await onUpdate(drag.occ, {
            start_at: drag.previewStart.toISOString(),
            end_at: drag.previewEnd.toISOString(),
          })
        } else if (!drag.moved && onSelect) {
          // 임계 미만 — click 으로 처리하여 EventEditor 오픈
          onSelect(drag.occ, drag.boxRect)
        }
      } else if (drag.mode === 'resize') {
        if (drag.edge === 'top' && drag.previewStart) {
          await onUpdate(drag.occ, { start_at: drag.previewStart.toISOString() })
        } else if (drag.previewEnd) {
          await onUpdate(drag.occ, { end_at: drag.previewEnd.toISOString() })
        }
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
      <div className="week-view-header" style={{ gridTemplateColumns: gridCols }}>
        <div className="corner" />
        {days.map((d, i) => (
          <div key={i} className={`day-cell ${isSameDay(d, now) ? 'today' : ''}`}>
            <div className="weekday">{DAY_NAMES[d.getDay()]}</div>
            <div className="date">{d.getDate()}</div>
          </div>
        ))}
      </div>

      {/* 종일 (all-day) 막대 영역 — 컬럼 헤더와 시간 그리드 사이 */}
      {allDayOccurrences.length > 0 && (
        <div className="all-day-strip" style={{ gridTemplateColumns: gridCols }}>
          <div className="corner all-day-label">종일</div>
          {days.map((d, i) => (
            <div key={i} className="all-day-col">
              {allDayByDayIdx[i].map(o => {
                const hue = ownerHue(o.owner_user_id, selfUid)
                return (
                  <div
                    key={o.id}
                    className={`all-day-bar ${o.is_shared ? 'shared' : ''} ${o.completed ? 'completed' : ''}`}
                    title={o.title || '(제목없음)'}
                    style={{
                      '--tb-color': o.color || '#3b82f6',
                      borderLeftColor: hue,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onSelect) onSelect(o, e.currentTarget.getBoundingClientRect())
                    }}
                  >
                    {o.title || '(제목없음)'}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div className="week-view-body" ref={bodyRef}>
        <div
          className="week-grid"
          style={{
            height: `${24 * HOUR_PX}px`,
            ['--hour-px']: `${HOUR_PX}px`,
            gridTemplateColumns: gridCols,
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
              } else if (drag.mode === 'resize') {
                const origStart = new Date(drag.occ.start_at)
                const origEnd = new Date(drag.occ.end_at)
                const effStart = drag.edge === 'top' && drag.previewStart ? drag.previewStart : origStart
                const effEnd = drag.edge === 'bottom' && drag.previewEnd ? drag.previewEnd : origEnd
                const top = (minutesFromMidnight(effStart) / 60) * HOUR_PX
                const h = ((effEnd - effStart) / 60000) * PX_PER_MIN
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
                    colorLabel={colorLabels?.[occ.color]}
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
