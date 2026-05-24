import React from 'react'
import { Trash2, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

export default function WorklogHeader({ pageDate, onDelete, onGoToCalendar, onPrevDay, onNextDay, extraActions }) {
  return (
    <div className="worklog-header">
      <div className="worklog-header-actions">
        {onPrevDay && (
          <button className="worklog-nav-btn" onClick={onPrevDay} title="이전 업무일지로 가기">
            <ChevronLeft size={14} />
          </button>
        )}
        {onNextDay && (
          <button className="worklog-nav-btn" onClick={onNextDay} title="다음 업무일지로 가기">
            <ChevronRight size={14} />
          </button>
        )}
        {onGoToCalendar && (
          <button className="worklog-calendar-btn" onClick={onGoToCalendar} title="캘린더로 이동">
            <CalendarDays size={14} />
            <span>캘린더</span>
          </button>
        )}
        {extraActions}
        {onDelete && (
          <button className="worklog-delete-btn" onClick={onDelete} title="이 업무일지 삭제">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
