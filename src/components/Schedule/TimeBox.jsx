import React from 'react'
import { Check } from 'lucide-react'
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
  selfUid, ownerEmail,
  onClick, onDragStart, onResizeStart, onToggleCheck,
}) {
  const start = new Date(occ.start_at)
  const end = new Date(occ.end_at)

  // 컬럼이 표현하는 하루 범위로 잘림
  const dayStart = new Date(dayDate); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)

  const visibleStart = start < dayStart ? dayStart : start
  const visibleEnd = end > dayEnd ? dayEnd : end

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
  const tooltip = ownerEmail
    ? `${occ.title || '(제목없음)'} · ${ownerEmail}`
    : (occ.title || '(제목없음)')

  return (
    <div
      className={`timebox ${occ.is_shared ? 'shared' : ''} ${occ.completed ? 'completed' : ''} ${isPoint ? 'point' : ''}`}
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
      onClick={(e) => {
        e.stopPropagation()
        if (onClick) {
          const rect = e.currentTarget.getBoundingClientRect()
          onClick(occ, rect)
        }
      }}
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

      {occ.is_routine && onToggleCheck && (
        <div
          className={`routine-check ${occ.completed ? 'checked' : ''}`}
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggleCheck(occ) }}
          title={occ.completed ? '체크 해제' : '완료 체크'}
        >
          {occ.completed && <Check size={10} strokeWidth={3} />}
        </div>
      )}

      {/* 포인트 이벤트는 리사이즈 핸들 숨김 (드래그하면 일반 이벤트로 변환됨) */}
      {!isPoint && onResizeStart && (
        <div
          className="resize-handle"
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, occ) }}
        />
      )}
    </div>
  )
}
