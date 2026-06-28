import React, { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'

/**
 * 캘린더 툴바 검색 — 현재 fetch 된 events 에서 제목 contains 검색.
 * 결과 클릭 시 onJump(event) — CalendarShell 이 그 날짜로 점프 + 박스 하이라이트.
 *
 * @param events    schedule_events 배열 (현재 화면 fetch 결과)
 * @param onJump    (event) => void
 */
export default function ScheduleSearch({ events, onJump }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return (events || [])
      .filter(e => (e.title || '').toLowerCase().includes(term))
      .slice(0, 30)
      .sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at))
  }, [events, q])

  const fmtDate = (iso) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="schedule-search">
      {!open ? (
        <button onClick={() => setOpen(true)} title="검색 (제목)" className="search-icon-btn">
          <Search size={14} />
        </button>
      ) : (
        <div className="search-popover">
          <div className="search-input-row">
            <Search size={14} />
            <input
              type="text"
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="이벤트 제목 검색…"
              onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQ('') } }}
            />
            <button className="icon-btn" onClick={() => { setOpen(false); setQ('') }}>
              <X size={14} />
            </button>
          </div>
          {q.trim() && (
            <div className="search-results">
              {results.length === 0 ? (
                <div className="todo-picker-empty">결과 없음</div>
              ) : results.map(e => (
                <button
                  key={e.id}
                  className="todo-picker-item"
                  onClick={() => { onJump(e); setOpen(false); setQ('') }}
                >
                  <span
                    className="result-color"
                    style={{ background: e.color || '#3b82f6' }}
                  />
                  <span className="todo-text">{e.title || '(제목없음)'}</span>
                  <span className="todo-page">{fmtDate(e.start_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
