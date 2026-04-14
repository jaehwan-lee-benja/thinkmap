import React from 'react'
import { Calendar, User, Trash2 } from 'lucide-react'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function formatPageDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return `${dateStr}(${DAY_NAMES[d.getDay()]})`
}

export default function WorklogHeader({ pageDate, authorEmail, onDelete }) {
  const authorName = authorEmail ? authorEmail.split('@')[0] : ''

  return (
    <div className="worklog-header">
      <div className="worklog-header-meta">
        <div className="worklog-header-row">
          <Calendar size={14} className="worklog-header-icon" />
          <span className="worklog-header-label">날짜</span>
          <span className="worklog-header-value">{formatPageDate(pageDate)}</span>
        </div>
        {authorName && (
          <div className="worklog-header-row">
            <User size={14} className="worklog-header-icon" />
            <span className="worklog-header-label">작성자</span>
            <span className="worklog-header-value">{authorName}</span>
          </div>
        )}
      </div>
      {onDelete && (
        <button className="worklog-delete-btn" onClick={onDelete} title="이 업무일지 삭제">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}
