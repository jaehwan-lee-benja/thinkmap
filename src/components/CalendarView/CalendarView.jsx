import React, { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, FileText, CheckSquare, MessageSquare, Archive } from 'lucide-react'
import { parseTodoStats } from '../../utils/worklogUtils'
import { DAY_NAMES } from '../../utils/dateUtils'
import LeftoverManager from '../Worklog/LeftoverManager'
import './CalendarView.css'

/**
 * 업무일지 달력 뷰
 * Notion 달력 DB와 유사한 월간 그리드
 */
export function CalendarView({ dailyPages, onPageSelect, onCreateDailyPage, commentCounts, session }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-indexed
  const [leftoverOpen, setLeftoverOpen] = useState(false)

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

  // 날짜별 todo 통계
  const statsByDate = useMemo(() => {
    const map = {}
    if (!dailyPages) return map
    dailyPages.forEach(page => {
      const dateKey = page.page_date || page.name
      const stats = parseTodoStats(page.content_tiptap)
      if (!map[dateKey]) map[dateKey] = { total: 0, completed: 0 }
      map[dateKey].total += stats.total
      map[dateKey].completed += stats.completed
    })
    return map
  }, [dailyPages])

  // 날짜별 코멘트 수
  const commentsByDate = useMemo(() => {
    const map = {}
    if (!dailyPages || !commentCounts) return map
    dailyPages.forEach(page => {
      const dateKey = page.page_date || page.name
      const counts = commentCounts[page.id]
      if (counts) {
        if (!map[dateKey]) map[dateKey] = { total: 0, unresolved: 0 }
        map[dateKey].total += counts.total
        map[dateKey].unresolved += counts.unresolved
      }
    })
    return map
  }, [dailyPages, commentCounts])

  // 월간 요약 통계
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthlySummary = useMemo(() => {
    let totalTodos = 0, completedTodos = 0, totalComments = 0, daysWithEntries = 0

    Object.entries(statsByDate).forEach(([dateKey, stats]) => {
      if (dateKey.startsWith(monthPrefix)) {
        totalTodos += stats.total
        completedTodos += stats.completed
        daysWithEntries++
      }
    })

    Object.entries(commentsByDate).forEach(([dateKey, counts]) => {
      if (dateKey.startsWith(monthPrefix)) {
        totalComments += counts.total
      }
    })

    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const completionRate = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0

    return { totalTodos, completedTodos, completionRate, totalComments, daysWithEntries, daysInMonth }
  }, [statsByDate, commentsByDate, monthPrefix, year, month])

  const formatDateKey = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const monthLabel = `${year}년 ${month + 1}월`
  const weekDays = DAY_NAMES
  const hasSummaryData = monthlySummary.totalTodos > 0 || monthlySummary.totalComments > 0

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
        <div className="calendar-header-actions">
          <button
            className="calendar-leftover-btn"
            onClick={() => setLeftoverOpen(true)}
            title="3년 이상 미완료 todo 정리"
          >
            <Archive size={14} />
            <span>오래된 todo 정리</span>
          </button>
          <button className="calendar-today-btn" onClick={goToToday}>오늘</button>
        </div>
      </div>

      <LeftoverManager
        isOpen={leftoverOpen}
        onClose={() => setLeftoverOpen(false)}
        session={session}
        onJumpToPage={onPageSelect}
      />

      {/* 월간 요약 */}
      {hasSummaryData && (
        <div className="calendar-summary">
          {monthlySummary.totalTodos > 0 && (
            <span className="calendar-summary-item">
              <CheckSquare size={12} />
              완료 {monthlySummary.completedTodos}/{monthlySummary.totalTodos} ({monthlySummary.completionRate}%)
            </span>
          )}
          {monthlySummary.totalComments > 0 && (
            <span className="calendar-summary-item">
              <MessageSquare size={12} />
              코멘트 {monthlySummary.totalComments}
            </span>
          )}
          <span className="calendar-summary-item">
            작성 {monthlySummary.daysWithEntries}/{monthlySummary.daysInMonth}일
          </span>
        </div>
      )}

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
          const todoStats = statsByDate[dateKey]
          const commentStats = commentsByDate[dateKey]
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
              {/* 셀 내 통계 */}
              {(todoStats?.total > 0 || commentStats?.total > 0) && (
                <div className="calendar-cell-stats">
                  {todoStats?.total > 0 && (
                    <span className={`calendar-cell-stat ${todoStats.completed === todoStats.total ? 'all-done' : ''}`}>
                      <CheckSquare size={10} />
                      {todoStats.completed}/{todoStats.total}
                    </span>
                  )}
                  {commentStats?.total > 0 && (
                    <span className="calendar-cell-stat">
                      <MessageSquare size={10} />
                      {commentStats.total}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
