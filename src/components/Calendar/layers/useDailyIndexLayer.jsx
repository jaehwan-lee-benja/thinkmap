import React, { useCallback, useMemo, useState } from 'react'
import { Archive, CheckSquare, FileText, MessageSquare, Plus } from 'lucide-react'
import { supabase } from '../../../supabaseClient'
import { generateUUID } from '../../../utils/uuid'
import { usePageContext } from '../../../contexts/PageContext'
import { useCalendarTodoStats } from '../../../hooks/useCalendarTodoStats'
import { useCalendarCommentCounts } from '../../../hooks/useCalendarCommentCounts'
import { isCalendarPage, isDailyPage } from '../../../utils/pageTypes'
import { dateKey } from '../../Schedule/scheduleUtils'
import { dailyPageName } from '../../../utils/dateUtils'
import { ensureDailyPage } from '../../../utils/ensureDailyPage'
import LeftoverManager from '../../Worklog/LeftoverManager'

/**
 * DailyIndexLayer — 캘린더의 "데일리 인덱스" 레이어 (구 CalendarView 흡수).
 * CALENDAR-SPEC §6.2.
 *
 * 데이터: pages(parent = calendar 컨테이너) + daily_blocks 집계(todo/코멘트).
 * 렌더 슬롯:
 *   - renderDayBadges(day)    : 월간 셀에 데일리 칩(존재 시 통계+열기 / 미존재 시 +생성)
 *   - renderHeaderBadges(day) : 주간/3일 헤더에 todo X/Y 칩(존재 시)
 * 액션: 날짜 클릭 → 그날 데일리 페이지 열기(없으면 ensureDailyPage 로 생성)
 * 툴바: "오래된 todo 정리"(LeftoverManager)
 *
 * @param {object}  args
 * @param {object}  args.session  Supabase 세션
 * @param {Date}    args.from     보이는 범위 시작
 * @param {Date}    args.to       보이는 범위 끝(배타)
 * @param {boolean} args.enabled  레이어 ON 여부 (OFF 면 렌더/툴바 null)
 */
export function useDailyIndexLayer({ session, from, to, enabled = true }) {
  const { pages, fetchPages, setCurrentPageId } = usePageContext() || {}
  const [leftoverOpen, setLeftoverOpen] = useState(false)
  const userId = session?.user?.id

  // calendar 컨테이너(데일리 부모). project_id=null 독립 엔티티 1개.
  const container = useMemo(() => (pages || []).find(p => isCalendarPage(p)), [pages])

  // 보이는 범위의 데일리 페이지만 추림 (page_date 문자열 비교)
  const fromKey = dateKey(from)
  const toKey = dateKey(to)
  const dailyPages = useMemo(() => {
    if (!enabled || !pages) return []
    return pages.filter(p => {
      if (!isDailyPage(p)) return false
      const d = p.page_date || p.name
      return d >= fromKey && d <= toKey
    })
  }, [enabled, pages, fromKey, toKey])

  const pageIds = useMemo(() => dailyPages.map(p => p.id), [dailyPages])
  const { todoStats } = useCalendarTodoStats(session, pageIds)
  const { commentCounts } = useCalendarCommentCounts(session, pageIds)

  // dateKey → { pageId, todo:{total,completed}, comments:{total} }
  const byDate = useMemo(() => {
    const map = {}
    dailyPages.forEach(p => {
      const key = p.page_date || p.name
      const todo = todoStats?.[p.id] || { total: 0, completed: 0 }
      const comments = commentCounts?.[p.id] || { total: 0, unresolved: 0 }
      map[key] = { pageId: p.id, todo, comments }
    })
    return map
  }, [dailyPages, todoStats, commentCounts])

  // calendar 컨테이너 보장 — 없으면 생성(독립 엔티티). 데일리 고아화 방지(CALENDAR-SPEC §9.1).
  const ensureContainer = useCallback(async () => {
    if (container?.id) return container.id
    const existing = (pages || []).find(p => isCalendarPage(p))
    if (existing?.id) return existing.id
    // DB 직접 조회
    const { data } = await supabase
      .from('pages').select('id').eq('page_type', 'calendar').is('deleted_at', null)
      .limit(1).maybeSingle()
    if (data?.id) return data.id
    // 생성
    const newId = generateUUID()
    const { error } = await supabase.from('pages').insert([{
      id: newId, user_id: userId, name: '업무일지',
      page_type: 'calendar', project_id: null, parent_id: null, position: 0,
    }])
    if (error) { console.error('calendar 컨테이너 생성 실패:', error); return null }
    return newId
  }, [container, pages, userId])

  // 그날 데일리 열기(없으면 생성)
  const openDaily = useCallback(async (day) => {
    const key = dateKey(day)
    const existing = byDate[key]
    if (existing?.pageId) { setCurrentPageId?.(existing.pageId); return }
    const parentId = await ensureContainer()
    if (!parentId) return
    try {
      const result = await ensureDailyPage({ supabase, parentId, dateKey: key, userId, dailyPageName })
      if (result?.pageId) {
        if (typeof fetchPages === 'function') await fetchPages()
        setCurrentPageId?.(result.pageId)
      }
    } catch (err) {
      console.error('데일리 페이지 생성 실패:', err)
    }
  }, [byDate, ensureContainer, fetchPages, setCurrentPageId, userId])

  // 월간 셀 데일리 칩
  const renderDayBadges = useCallback((day) => {
    if (!enabled) return null
    const e = byDate[dateKey(day)]
    const open = (ev) => { ev.stopPropagation(); openDaily(day) }
    if (e) {
      const allDone = e.todo.total > 0 && e.todo.completed === e.todo.total
      return (
        <button type="button" className="daily-chip" onClick={open} title="업무일지 열기">
          <FileText size={11} />
          {e.todo.total > 0 && (
            <span className={`daily-chip-todo ${allDone ? 'all-done' : ''}`}>
              {e.todo.completed}/{e.todo.total}
            </span>
          )}
          {e.comments.total > 0 && (
            <span className="daily-chip-comment"><MessageSquare size={10} />{e.comments.total}</span>
          )}
        </button>
      )
    }
    // 없는 날 — hover 시에만 노출되는 생성 버튼
    return (
      <button type="button" className="daily-chip daily-chip--empty" onClick={open} title="업무일지 추가">
        <Plus size={11} />
      </button>
    )
  }, [enabled, byDate, openDaily])

  // 주간/3일 헤더 데일리 칩 (존재 + todo 있을 때만, 컴팩트)
  const renderHeaderBadges = useCallback((day) => {
    if (!enabled) return null
    const e = byDate[dateKey(day)]
    if (!e) return null
    const open = (ev) => { ev.stopPropagation(); openDaily(day) }
    const allDone = e.todo.total > 0 && e.todo.completed === e.todo.total
    return (
      <button type="button" className="day-header-daily" onClick={open} title="업무일지 열기">
        <FileText size={10} />
        {e.todo.total > 0 && (
          <span className={allDone ? 'all-done' : ''}>{e.todo.completed}/{e.todo.total}</span>
        )}
      </button>
    )
  }, [enabled, byDate, openDaily])

  // 툴바 — 오래된 todo 정리
  const toolbar = enabled ? (
    <button
      type="button"
      className="daily-toolbar-btn"
      onClick={() => setLeftoverOpen(true)}
      title="3년 이상 미완료 todo 정리"
    >
      <Archive size={13} />
    </button>
  ) : null

  // 레이어 소유 모달
  const modals = (
    <LeftoverManager
      isOpen={leftoverOpen}
      onClose={() => setLeftoverOpen(false)}
      session={session}
      onJumpToPage={(pageId) => setCurrentPageId?.(pageId)}
    />
  )

  return {
    id: 'daily',
    label: '업무일지',
    access: 'workspace',   // CALENDAR-SPEC §8 — 데일리/pages 기존 RLS(워크스페이스 멤버)
    enabled,
    byDate,
    openDaily,
    renderDayBadges,
    renderHeaderBadges,
    toolbar,
    modals,
  }
}
