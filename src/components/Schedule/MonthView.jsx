import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  startOfMonthGrid, addDays, isSameDay, isSameMonth, dateKey, ownerHue,
} from './scheduleUtils'
import { groupByDate } from './monthLayoutUtils'
import { DAY_NAMES } from '@thinkmap/core'

const MAX_BARS_PER_CELL = 3

/**
 * 월간 뷰 — 6주×7일 그리드, 칸당 이벤트 막대 N개 + +더보기.
 *
 * @param monthAnchor      어느 달을 표시할지 (Date — 그 달의 1일 또는 임의 시점)
 * @param occurrences      해당 월 그리드 범위의 Occurrence 배열 (이미 fetch)
 * @param selfUid          현재 사용자 uuid (owner hue)
 * @param ownerEmailByUid  tooltip 용
 * @param onSelect         (occOrDraft, anchorRect) — 막대 클릭 / 빈 칸 클릭(draft)
 * @param onUpdate         (occ, patch) — 막대 다른 날 드래그
 * @param onDayJump        (Date) — 칸의 날짜 숫자 클릭 시 주간 뷰로 점프
 * @param renderDayBadges  (Date)=>node — 레이어가 주입하는 day-summary 슬롯(데일리 인덱스 등). 선택.
 */
export default function MonthView({
  monthAnchor, occurrences, selfUid, ownerEmailByUid, colorLabels,
  onSelect, onUpdate, onDayJump, renderDayBadges,
}) {
  const gridStart = useMemo(() => startOfMonthGrid(monthAnchor), [monthAnchor.getTime()])
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart.getTime()])

  const occByDate = useMemo(() => groupByDate(occurrences), [occurrences])

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // 그날 전체 펼침 팝오버 ("+N more")
  const [overflowDay, setOverflowDay] = useState(null)   // { date, anchorRect }

  // 막대 드래그 — 다른 날 이동
  const cellRefs = useRef({})
  const [drag, setDrag] = useState(null)

  const findDateIdxAt = (clientX, clientY) => {
    for (const key in cellRefs.current) {
      const el = cellRefs.current[key]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom) {
        return key   // YYYY-MM-DD
      }
    }
    return null
  }

  const handleBarMouseDown = (e, occ) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setDrag({ occ, startX: e.clientX, startY: e.clientY, overKey: null })
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e) => {
      const moved = Math.abs(e.clientX - drag.startX) > 3 || Math.abs(e.clientY - drag.startY) > 3
      if (!moved) return
      const k = findDateIdxAt(e.clientX, e.clientY)
      setDrag(d => ({ ...d, overKey: k, moved: true }))
    }
    const onUp = async (e) => {
      const moved = drag.moved
      const targetKey = findDateIdxAt(e.clientX, e.clientY)
      setDrag(null)
      if (!moved) {
        // 단순 클릭으로 간주
        const rect = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : null
        if (onSelect) onSelect(drag.occ, rect)
        return
      }
      if (!targetKey) return
      const originalDate = dateKey(new Date(drag.occ.start_at))
      if (targetKey === originalDate) return    // 같은 날 (변경 없음)

      // 시각은 유지하고 날짜만 변경
      const [y, m, d] = targetKey.split('-').map(Number)
      const oldStart = new Date(drag.occ.start_at)
      const oldEnd = new Date(drag.occ.end_at)
      const duration = oldEnd - oldStart
      const newStart = new Date(y, m - 1, d, oldStart.getHours(), oldStart.getMinutes(), 0, 0)
      const newEnd = new Date(newStart.getTime() + duration)
      if (onUpdate) await onUpdate(drag.occ, {
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, onSelect, onUpdate])

  const handleCellClick = (e, day) => {
    // 칸의 빈 영역 클릭 — 09:00–10:00 draft
    if (e.target.closest('.month-bar') || e.target.closest('.month-overflow') || e.target.closest('.daily-chip')) return
    const start = new Date(day); start.setHours(9, 0, 0, 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const draft = {
      __draft: true,
      title: '',
      description: null,
      color: '#3b82f6',
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      is_shared: false,
      is_routine: false,
      rrule: null,
      all_day: false,
    }
    const rect = e.currentTarget.getBoundingClientRect()
    if (onSelect) onSelect(draft, rect)
  }

  const renderBar = (occ) => {
    const start = new Date(occ.start_at)
    const hh = String(start.getHours()).padStart(2, '0')
    const mm = String(start.getMinutes()).padStart(2, '0')
    const hue = ownerHue(occ.owner_user_id, selfUid)
    const ownerEmail = ownerEmailByUid?.[occ.owner_user_id]
    const colorLabel = colorLabels?.[occ.color]
    const parts = [occ.title || '(제목없음)']
    if (colorLabel) parts.push(`[${colorLabel}]`)
    if (ownerEmail) parts.push(ownerEmail)
    const tooltip = parts.join(' · ')
    return (
      <div
        key={occ.id}
        className={`month-bar ${occ.is_shared ? 'shared' : ''} ${occ.completed ? 'completed' : ''}`}
        title={tooltip}
        style={{
          '--tb-color': occ.color || '#3b82f6',
          '--tb-owner-hue': hue,
          borderLeftColor: hue,
        }}
        onMouseDown={(e) => handleBarMouseDown(e, occ)}
      >
        <span className="bar-time">{hh}:{mm}</span>
        <span className="bar-title">{occ.title || '(제목없음)'}</span>
      </div>
    )
  }

  return (
    <div className="month-view">
      {/* 요일 헤더 */}
      <div className="month-header">
        {DAY_NAMES.map(d => <div key={d} className="month-weekday">{d}</div>)}
      </div>

      {/* 6주 × 7일 그리드 */}
      <div className="month-grid">
        {days.map(day => {
          const key = dateKey(day)
          const cellOccs = occByDate[key] || []
          const inMonth = isSameMonth(day, monthAnchor)
          const today = isSameDay(day, now)
          const visible = cellOccs.slice(0, MAX_BARS_PER_CELL)
          const overflowCount = cellOccs.length - visible.length

          return (
            <div
              key={key}
              ref={el => { cellRefs.current[key] = el }}
              className={`month-cell ${inMonth ? '' : 'other-month'} ${today ? 'today' : ''} ${drag?.overKey === key ? 'drop-target' : ''}`}
              onClick={(e) => handleCellClick(e, day)}
            >
              <div className="cell-header">
                <button
                  type="button"
                  className="cell-date"
                  onClick={(e) => { e.stopPropagation(); onDayJump && onDayJump(day) }}
                  title="주간 뷰로 보기"
                >
                  {day.getDate()}
                </button>
              </div>

              <div className="cell-bars">
                {renderDayBadges && (
                  <div className="cell-daily-badges">{renderDayBadges(day)}</div>
                )}
                {visible.map(renderBar)}
                {overflowCount > 0 && (
                  <button
                    type="button"
                    className="month-overflow"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOverflowDay({ date: day, anchorRect: e.currentTarget.getBoundingClientRect() })
                    }}
                  >
                    외 {overflowCount}개
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* +N more 팝오버 */}
      {overflowDay && (
        <div className="event-editor-backdrop popover" onClick={() => setOverflowDay(null)}>
          <div
            className="month-overflow-popover"
            style={{ position: 'fixed', left: overflowDay.anchorRect.left, top: overflowDay.anchorRect.bottom + 4 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="settings-header">
              <h3>{overflowDay.date.getMonth() + 1}월 {overflowDay.date.getDate()}일</h3>
              <button className="icon-btn" onClick={() => setOverflowDay(null)}>×</button>
            </div>
            <div className="cell-bars" style={{ padding: '4px 8px 10px' }}>
              {(occByDate[dateKey(overflowDay.date)] || []).map(renderBar)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
