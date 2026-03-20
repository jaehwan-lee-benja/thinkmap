import React, { useState, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, FileText } from 'lucide-react'
import './CalendarView.css'

/**
 * 업무일지 달력 뷰
 * Notion 달력 DB와 유사한 월간 그리드
 *
 * [향후 확장]
 * - 계정별 개인 업무일지 분리 시, dailyPages를 owner_id로 필터링
 * - 접근 계정 관리 UI 추가 (달력 헤더에 설정 버튼)
 */
export function CalendarView({ dailyPages, onPageSelect, onCreateDailyPage }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-indexed

  const todayStr = today.toISOString().slice(0, 10)

  // 월 이동
  const goToPrevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const goToNextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const goToToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  // 달력 그리드 생성
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDayOfWeek = firstDay.getDay() // 0=일, 6=토

    const days = []

    // 이전 달의 빈 칸
    for (let i = 0; i < startDayOfWeek; i++) {
      const d = new Date(year, month, -startDayOfWeek + i + 1)
      days.push({ date: d, isCurrentMonth: false })
    }

    // 이번 달
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ date: new Date(year, month, d), isCurrentMonth: true })
    }

    // 다음 달의 빈 칸 (6행 맞추기)
    const remaining = 42 - days.length // 7 * 6 = 42
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false })
    }

    return days
  }, [year, month])

  // 날짜별 페이지 매핑
  const pagesByDate = useMemo(() => {
    const map = {}
    if (!dailyPages) return map
    dailyPages.forEach(page => {
      const dateKey = page.page_date || page.name
      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(page)
    })
    return map
  }, [dailyPages])

  const formatDateKey = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const monthLabel = `${year}년 ${month + 1}월`
  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="calendar-view">
      {/* 헤더 */}
      <div className="calendar-header">
        <div className="calendar-nav">
          <button className="calendar-nav-btn" onClick={goToPrevMonth}>
            <ChevronLeft size={18} />
          </button>
          <span className="calendar-month-label">{monthLabel}</span>
          <button className="calendar-nav-btn" onClick={goToNextMonth}>
            <ChevronRight size={18} />
          </button>
        </div>
        <button className="calendar-today-btn" onClick={goToToday}>오늘</button>
      </div>

      {/* 요일 헤더 */}
      <div className="calendar-weekdays">
        {weekDays.map(day => (
          <div key={day} className="calendar-weekday">{day}</div>
        ))}
      </div>

      {/* 그리드 */}
      <div className="calendar-grid">
        {calendarDays.map((item, index) => {
          const dateKey = formatDateKey(item.date)
          const isToday = dateKey === todayStr
          const entries = pagesByDate[dateKey] || []
          const maxShow = 2

          return (
            <div
              key={index}
              className={`calendar-cell ${!item.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
            >
              <div className="calendar-cell-header">
                <span className={`calendar-day-number ${isToday ? 'today-number' : ''}`}>
                  {item.date.getDate()}
                </span>
                {item.isCurrentMonth && (
                  <button
                    className="calendar-cell-add"
                    onClick={(e) => { e.stopPropagation(); onCreateDailyPage(dateKey) }}
                    title={`${dateKey} 페이지 추가`}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
              <div className="calendar-cell-entries">
                {entries.slice(0, maxShow).map(page => (
                  <button
                    key={page.id}
                    className="calendar-entry"
                    onClick={() => onPageSelect(page.id)}
                    title={page.name}
                  >
                    <FileText size={12} />
                    <span>{page.name}</span>
                  </button>
                ))}
                {entries.length > maxShow && (
                  <span className="calendar-entry-more">
                    +{entries.length - maxShow}개 더보기
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
