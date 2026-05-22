import React from 'react'
import { Check, Link2 } from 'lucide-react'
import { HOUR_PX, minutesFromMidnight, isSameDay, ownerHue } from './scheduleUtils'

/**
 * 시간박스 — occurrence(단발/루틴 통일된 모양) 1개를 day-column 안에 절대 위치로 렌더.
 *
 * @param occ           Occurrence (routineUtils 의 Occurrence)
 * @param dayDate       현재 컬럼이 표현하는 날짜
 * @param col / colCount 레이아웃
 * @param selfUid       현재 사용자 uuid
 * @param ownerEmail    tooltip 용
 * @param onClick       (occ) — 박스 클릭
 * @param onDragStart   (e, occ) — 본체 드래그 (시간 이동)
 * @param onResizeStart (e, occ) — 하단 핸들 드래그
 * @param onToggleCheck (occ) — 루틴 체크 토글 (routine 일 때만 호출)
 */
export default function TimeBox({
  occ, dayDate, col, colCount,
  selfUid, ownerEmail, colorLabel,
  onClick, onDragStart, onResizeStart, onToggleCheck,
}) {
  const start = new Date(occ.start_at)
  const end = new Date(occ.end_at)

  // 컬럼이 표현하는 하루 범위로 잘림
  const dayStart = new Date(dayDate); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)

  const continuesFromPrev = start < dayStart    // 어제 시작 — 윗쪽 잘림
  const continuesToNext   = end > dayEnd        // 내일까지 — 아래쪽 잘림
  const visibleStart = continuesFromPrev ? dayStart : start
  const visibleEnd   = continuesToNext ? dayEnd : end

  const topMin = minutesFromMidnight(visibleStart)
  const bottomMin = isSameDay(visibleEnd, dayStart) ? minutesFromMidnight(visibleEnd) : 24 * 60

  // 포인트 이벤트(start == end): 1줄 마커. 일반 이벤트: 시간 비례 높이.
  const isPoint = +start === +end
  const top = (topMin / 60) * HOUR_PX
  const height = isPoint ? 22 : Math.max(((bottomMin - topMin) / 60) * HOUR_PX, 16)

  const widthPct = 100 / colCount
  const leftPct = col * widthPct

  const fmtTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  const hue = ownerHue(occ.owner_user_id, selfUid)
  const parts = [occ.title || '(제목없음)']
  if (colorLabel) parts.push(`[${colorLabel}]`)
  if (ownerEmail) parts.push(ownerEmail)
  const tooltip = parts.join(' · ')

  return (
    <div
      data-schedule-event-id={occ.event_id}
      className={`timebox ${occ.is_shared ? 'shared' : ''} ${occ.completed ? 'completed' : ''} ${isPoint ? 'point' : ''} ${occ.is_routine ? 'is-routine' : ''} ${continuesFromPrev ? 'cont-prev' : ''} ${continuesToNext ? 'cont-next' : ''}`}
      title={tooltip}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        '--tb-color': occ.color || '#3b82f6',
        '--tb-owner-hue': hue,
        borderLeftColor: hue,
      }}
      onMouseDown={(e) => { if (onDragStart) onDragStart(e, occ) }}
      /* 클릭 처리는 WeekView 의 mouseup 에서 (3px 임계 — §13.1) */
    >
      {isPoint ? (
        <div className="point-row">
          <span className="point-time">{fmtTime(start)}</span>
          <span className="title">{occ.title || '(제목없음)'}</span>
        </div>
      ) : (
        <>
          <div className="title">{occ.title || '(제목없음)'}</div>
          <div className="time">{fmtTime(start)}–{fmtTime(end)}</div>
        </>
      )}

      {occ.link_count > 0 && (
        <span className="link-indicator" title={`${occ.link_count} 개 항목 연결됨`}>
          <Link2 size={11} />
        </span>
      )}

      {/* 단발/루틴 모두 체크박스 노출 (Phase 3b) */}
      {onToggleCheck && (
        <div
          className={`routine-check ${occ.completed ? 'checked' : ''}`}
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggleCheck(occ) }}
          title={occ.completed ? '체크 해제' : '완료 체크'}
        >
          {occ.completed && <Check size={10} strokeWidth={3} />}
        </div>
      )}

      {/* 포인트 이벤트는 리사이즈 핸들 숨김.
          cross-day 잘림(이전/다음 날로 이어짐) 쪽도 의미 없어서 숨김 */}
      {!isPoint && onResizeStart && !continuesFromPrev && (
        <div
          className="resize-handle resize-handle-top"
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, occ, 'top') }}
        />
      )}
      {!isPoint && onResizeStart && !continuesToNext && (
        <div
          className="resize-handle resize-handle-bottom"
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, occ, 'bottom') }}
        />
      )}
    </div>
  )
}
