import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import WeekView from './WeekView'
import MonthView from './MonthView'
import EventEditor from './EventEditor'
import ScheduleSettingsModal from './ScheduleSettingsModal'
import ScheduleSearch from './ScheduleSearch'
import { useScheduleEvents } from '../../hooks/useScheduleEvents'
import { useScheduleInstances } from '../../hooks/useScheduleInstances'
import { useScheduleLinks } from '../../hooks/useScheduleLinks'
import { useScheduleNotifications } from '../../hooks/useScheduleNotifications'
import { useLinkedAccounts } from '../../hooks/useLinkedAccounts'
import { useEnabledOwners } from '../../hooks/useEnabledOwners'
import { useColorLabels } from '../../hooks/useColorLabels'
import { useAuthContext } from '../../contexts/AuthContext'
import { usePageContext } from '../../contexts/PageContext'
import { useIsMobile } from '../../hooks/useIsMobile'
import { supabase } from '../../supabaseClient'
import { startOfWeek, addDays, ownerHue, startOfMonthGrid, endOfMonthGrid } from './scheduleUtils'
import { buildOccurrences } from './routineUtils'
import './Schedule.css'

const MARKER_LIMIT = 4   // 툴바에 표시할 owner 색 점 최대 개수

/**
 * 캘린더 페이지 — 주간/월간/3일 뷰의 컨테이너.
 * Phase 1.5: 모달 기반 다중 owner 필터 + 마스터 전체 토글 + owner hue 마커.
 */
export default function SchedulePage({ session }) {
  const { isMobile } = useIsMobile()
  // 초기 뷰 — 모바일이면 3day 가 기본 (좁은 화면에서 7컬럼은 너무 빡빡)
  const [view, setView] = useState(() => isMobile ? '3day' : 'week')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [threeDayStart, setThreeDayStart] = useState(() => {        // 3일 뷰 시작일 (오늘)
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  const [monthAnchor, setMonthAnchor] = useState(() => new Date())  // 그 달을 표시
  const { isMaster } = useAuthContext() || {}
  const { setCurrentPageId } = usePageContext()

  const selfUid = session?.user?.id
  const selfEmail = session?.user?.email

  const { linkedAccounts } = useLinkedAccounts(session)
  const { enabled, masterAll, toggle, toggleMasterAll } = useEnabledOwners(selfUid)
  const { labels: colorLabels, setLabel: setColorLabel } = useColorLabels()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorTarget, setEditorTarget] = useState(null)
  const [editorAnchor, setEditorAnchor] = useState(null)   // EventEditor 팝오버 앵커

  // fetch 범위: view 에 따라 분기
  const from = view === 'month' ? startOfMonthGrid(monthAnchor)
             : view === '3day' ? threeDayStart
             : weekStart
  const to = useMemo(
    () => view === 'month' ? endOfMonthGrid(monthAnchor)
        : view === '3day' ? addDays(threeDayStart, 3)
        : addDays(weekStart, 7),
    [view, weekStart.getTime(), threeDayStart.getTime(), monthAnchor.getTime()]
  )

  const { events, loading, createEvent, updateEvent, toggleEventCompleted, deleteEvent, refetch } =
    useScheduleEvents({ from, to, ownerIds: enabled, masterAll, session })

  // 활성 탭 알림 스케줄러 — 미래에 발생할 이벤트만 자동 등록
  useScheduleNotifications({ events, enabled: true })

  // 루틴 인스턴스 fetch (현재 주에 보이는 routine event 들에 대해서만)
  const routineEventIds = useMemo(
    () => events.filter(e => e.is_routine).map(e => e.id),
    [events]
  )
  const { instances, upsertInstance, toggleCompleted: toggleInstanceOnly, refetch: refetchInstances } =
    useScheduleInstances({ eventIds: routineEventIds, from, to })

  // 화면 events 전체의 links fetch (routine + single 모두)
  const allEventIds = useMemo(() => events.map(e => e.id), [events])
  const { links, createLink, deleteLink, refetch: refetchLinks } =
    useScheduleLinks({ eventIds: allEventIds })

  // 링크된 todo/page 의 표시용 메타 (text/checked/page_name) — 별도 fetch
  const [linkTargets, setLinkTargets] = useState({})
  useEffect(() => {
    const todoIds = Array.from(new Set(
      links.filter(l => l.target_type === 'todo').map(l => l.target_id)
    ))
    const pageLinkIds = Array.from(new Set(
      links.filter(l => l.target_type === 'page').map(l => l.target_id)
    ))
    if (todoIds.length === 0 && pageLinkIds.length === 0) { setLinkTargets({}); return }
    let cancelled = false
    ;(async () => {
      try {
        // todo blocks
        let blocks = []
        if (todoIds.length) {
          const r = await supabase
            .from('daily_blocks')
            .select('block_id, page_id, text_content, todo_checked')
            .in('block_id', todoIds)
          blocks = r.data || []
        }
        // page 메타 — todo block 의 page + page 링크의 page 양쪽
        const allPageIds = Array.from(new Set([
          ...blocks.map(b => b.page_id),
          ...pageLinkIds,
        ]))
        let pageMap = {}
        if (allPageIds.length) {
          const { data: pageRows } = await supabase
            .from('pages').select('id, name').in('id', allPageIds)
          ;(pageRows || []).forEach(p => { pageMap[p.id] = p.name })
        }
        if (cancelled) return
        const map = {}
        blocks.forEach(b => {
          map[b.block_id] = {
            text_content: b.text_content,
            todo_checked: b.todo_checked,
            page_id: b.page_id,                       // ← 원본 페이지 이동용
            page_name: pageMap[b.page_id] || '',
          }
        })
        pageLinkIds.forEach(id => {
          map[id] = { page_id: id, page_name: pageMap[id] || '(삭제된 페이지)' }
        })
        setLinkTargets(map)
      } catch (err) { console.error('linkTargets fetch:', err) }
    })()
    return () => { cancelled = true }
  }, [links])

  // event_id 별 links 인덱싱 (occurrence 에 붙여 TimeBox 가 link 아이콘 표시)
  const linksByEvent = useMemo(() => {
    const m = {}
    links.forEach(l => {
      if (!m[l.event_id]) m[l.event_id] = []
      m[l.event_id].push(l)
    })
    return m
  }, [links])

  // 링크의 원본 페이지로 이동 — todo 면 daily_blocks.page_id, page 면 target_id 자체.
  // todo 인 경우 페이지 전환 후 해당 블록을 찾아 잠시 하이라이트.
  const navigateToLinkTarget = useCallback((link) => {
    const meta = linkTargets[link.target_id]
    const targetPageId = link.target_type === 'page' ? link.target_id : meta?.page_id
    if (!targetPageId) {
      console.warn('네비게이션 대상 페이지 없음', link)
      return
    }
    const targetBlockId = link.target_type === 'todo' ? link.target_id : null

    setEditorTarget(null)
    setEditorAnchor(null)
    setCurrentPageId(targetPageId)

    if (targetBlockId) {
      // 페이지/에디터 마운트 + daily_blocks fetch 완료까지 폴링하다 발견 시 하이라이트
      const deadline = Date.now() + 5000
      const tryHighlight = () => {
        const el = document.querySelector(`[data-block-id="${targetBlockId}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('schedule-highlight-pulse')
          setTimeout(() => el.classList.remove('schedule-highlight-pulse'), 2500)
          return
        }
        if (Date.now() < deadline) requestAnimationFrame(tryHighlight)
      }
      setTimeout(tryHighlight, 120)
    }
  }, [linkTargets, setCurrentPageId])

  // EventEditor 의 연결된 todo 체크박스 클릭 — 그 todo 하나 토글
  const toggleLinkTodo = useCallback(async (blockId, currentChecked) => {
    const next = !currentChecked
    setLinkTargets(prev => {
      if (!prev[blockId]) return prev
      return { ...prev, [blockId]: { ...prev[blockId], todo_checked: next } }
    })
    try {
      const { error } = await supabase
        .from('daily_blocks')
        .update({ todo_checked: next, todo_status: next ? 'done' : 'open' })
        .eq('block_id', blockId)
      if (error) throw error
    } catch (err) {
      console.error('todo toggle 실패:', err)
      // 롤백
      setLinkTargets(prev => {
        if (!prev[blockId]) return prev
        return { ...prev, [blockId]: { ...prev[blockId], todo_checked: currentChecked } }
      })
    }
  }, [])

  // 박스 체크 → 단발/루틴 분기 + 링크된 todo 도 함께 sync (SPEC §8.2 단방향 push)
  const toggleCompleted = useCallback(async (occ) => {
    const next = !occ.completed
    // 1) 이벤트 측 체크
    if (occ.is_routine) {
      await toggleInstanceOnly(occ)
    } else {
      await toggleEventCompleted(occ.event_id, occ.completed)
    }
    // 2) 링크된 todo 동기
    const eventLinks = linksByEvent[occ.event_id] || []
    const todoLinks = eventLinks.filter(l => l.target_type === 'todo' && l.sync_check)
    if (todoLinks.length === 0) return
    try {
      const ids = todoLinks.map(l => l.target_id)
      await supabase
        .from('daily_blocks')
        .update({
          todo_checked: next,
          todo_status: next ? 'done' : 'open',
        })
        .in('block_id', ids)
      setLinkTargets(prev => {
        const out = { ...prev }
        ids.forEach(id => { if (out[id]) out[id] = { ...out[id], todo_checked: next } })
        return out
      })
    } catch (err) { console.error('todo sync 실패:', err) }
  }, [linksByEvent, toggleInstanceOnly, toggleEventCompleted])

  // occurrences 빌드 (단발 + 루틴 펼침 + instance override 머지 + linked todo 머지)
  const occurrences = useMemo(() => {
    const instancesByEvent = {}
    instances.forEach(inst => {
      if (!instancesByEvent[inst.event_id]) instancesByEvent[inst.event_id] = []
      instancesByEvent[inst.event_id].push(inst)
    })
    const raw = buildOccurrences(events, from, to, instancesByEvent)

    return raw.map(o => {
      const eventLinks = linksByEvent[o.event_id] || []
      const link_count = eventLinks.length

      // 역방향 머지 (Phase 3b): sync_check=true 인 모든 todo 가 체크되어 있으면 박스 완료로 합성.
      // 이벤트 측이 이미 completed=true 면 그대로 유지.
      let completed = o.completed
      if (!completed) {
        const syncedTodos = eventLinks.filter(l => l.target_type === 'todo' && l.sync_check)
        if (syncedTodos.length > 0
            && syncedTodos.every(l => linkTargets[l.target_id]?.todo_checked)) {
          completed = true
        }
      }
      return { ...o, link_count, completed }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, instances, from, to, linksByEvent, linkTargets])

  const navLabel = useMemo(() => {
    if (view === 'month') {
      return `${monthAnchor.getFullYear()}년 ${monthAnchor.getMonth() + 1}월`
    }
    const start = view === '3day' ? threeDayStart : weekStart
    const dayCount = view === '3day' ? 3 : 7
    const end = addDays(start, dayCount - 1)
    const y = start.getFullYear()
    const m = start.getMonth() + 1
    return `${y}.${String(m).padStart(2, '0')}.${String(start.getDate()).padStart(2, '0')} – ${end.getMonth() + 1}.${String(end.getDate()).padStart(2, '0')}`
  }, [view, weekStart, threeDayStart, monthAnchor])

  const handlePrev = useCallback(() => {
    if (view === 'month') setMonthAnchor(d => {
      const nd = new Date(d); nd.setMonth(nd.getMonth() - 1); return nd
    })
    else if (view === '3day') setThreeDayStart(d => addDays(d, -3))
    else setWeekStart(d => addDays(d, -7))
  }, [view])

  const handleNext = useCallback(() => {
    if (view === 'month') setMonthAnchor(d => {
      const nd = new Date(d); nd.setMonth(nd.getMonth() + 1); return nd
    })
    else if (view === '3day') setThreeDayStart(d => addDays(d, 3))
    else setWeekStart(d => addDays(d, 7))
  }, [view])

  const handleToday = useCallback(() => {
    if (view === 'month') setMonthAnchor(new Date())
    else if (view === '3day') {
      const d = new Date(); d.setHours(0, 0, 0, 0); setThreeDayStart(d)
    }
    else setWeekStart(startOfWeek(new Date()))
  }, [view])

  // 월간 뷰에서 칸의 날짜 숫자 클릭 → 주간 뷰로 점프
  const handleDayJump = useCallback((day) => {
    setWeekStart(startOfWeek(day))
    setView('week')
  }, [])

  // 검색 결과 클릭 → 그 이벤트의 주로 점프 + 그 박스에 펄스
  const handleSearchJump = useCallback((ev) => {
    const evStart = new Date(ev.start_at)
    setWeekStart(startOfWeek(evStart))
    setView('week')
    // 박스 DOM 렌더링 후 펄스 (id = data-event-id 와 매칭 — TimeBox 에 부여)
    const deadline = Date.now() + 5000
    const tryPulse = () => {
      const el = document.querySelector(`[data-schedule-event-id="${ev.id}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('schedule-highlight-pulse')
        setTimeout(() => el.classList.remove('schedule-highlight-pulse'), 2500)
        return
      }
      if (Date.now() < deadline) requestAnimationFrame(tryPulse)
    }
    setTimeout(tryPulse, 120)
  }, [])

  // 새 이벤트 — 지금 시각에서 시작하는 1시간짜리 draft
  const openNewDraft = useCallback(() => {
    const now = new Date()
    // 15분 스냅
    const m = Math.round(now.getMinutes() / 15) * 15
    now.setMinutes(m, 0, 0)
    const end = new Date(now.getTime() + 60 * 60 * 1000)
    setEditorAnchor(null)   // 중앙 표시 (current time 위치를 정확히 잡기 어려움)
    setEditorTarget({
      __draft: true,
      title: '',
      description: null,
      color: '#3b82f6',
      start_at: now.toISOString(),
      end_at: end.toISOString(),
      is_shared: false,
      is_routine: false,
      rrule: null,
      all_day: false,
    })
  }, [])

  // 키보드 단축키 — input/textarea 포커스 중에는 무시
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      // 수정 키 조합은 무시 (앱 단축키와 충돌 방지)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'ArrowLeft':  handlePrev();  e.preventDefault(); break
        case 'ArrowRight': handleNext();  e.preventDefault(); break
        case 't': case 'T': handleToday(); e.preventDefault(); break
        case 'n': case 'N':
          if (editorTarget) return
          openNewDraft();   e.preventDefault(); break
        case 'Escape':
          if (settingsOpen) setSettingsOpen(false)
          else if (editorTarget) handleEditorClose()
          break
        case '1': setView('week');  e.preventDefault(); break
        case '2': setView('month'); e.preventDefault(); break
        case '3': setView('3day');  e.preventDefault(); break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlePrev, handleNext, handleToday, openNewDraft, editorTarget, settingsOpen])

  // 미니 마커에 표시할 owner hue 점들
  const markerDots = useMemo(() => {
    if (masterAll) return [{ uid: '__all__', hue: 'var(--color-master-text)' }]
    return enabled.slice(0, MARKER_LIMIT).map(uid => ({ uid, hue: ownerHue(uid, selfUid) }))
  }, [enabled, masterAll, selfUid])

  // owner uuid → email 매핑 (tooltip 용)
  const ownerEmailByUid = useMemo(() => {
    const m = {}
    if (selfUid) m[selfUid] = selfEmail || '내 계정'
    linkedAccounts.forEach(la => {
      if (la.linked_auth_uid) m[la.linked_auth_uid] = la.linked_email
    })
    return m
  }, [selfUid, selfEmail, linkedAccounts])

  const handleSave = async (patch) => {
    if (!editorTarget) return
    if (editorTarget.__draft) {
      // 신규 — patch 에는 EventEditor 가 사용자로부터 받은 모든 필드가 들어옴
      await createEvent({
        start_at: editorTarget.start_at,
        end_at: editorTarget.end_at,
        ...patch,
      })
      return
    }
    const eventId = editorTarget.event_id || editorTarget.id
    await updateEvent(eventId, patch)
    refetchInstances()
  }
  const handleDelete = async () => {
    if (!editorTarget || editorTarget.__draft) return   // draft 는 DB 에 없으므로 삭제 없음
    const eventId = editorTarget.event_id || editorTarget.id
    await deleteEvent(eventId)
  }

  const handleEditorClose = () => {
    const wasDraft = editorTarget?.__draft
    setEditorTarget(null)
    setEditorAnchor(null)
    // draft 였다면 DB 에 아무것도 없으므로 refetch 불필요 (Google Calendar 와 동일)
    if (!wasDraft) refetch()
  }

  // 박스 드래그/리사이즈 핸들러 — 단발/루틴 분기
  const handleOccurrenceUpdate = async (occ, patch) => {
    if (!occ.is_routine) {
      // 단발: event 자체 update
      await updateEvent(occ.event_id, patch)
    } else {
      // 루틴: 이 회차만 — instance upsert (moved_start_at/moved_end_at)
      await upsertInstance({
        event_id: occ.event_id,
        instance_start_at: occ.instance_start_at,
        moved_start_at: patch.start_at || occ.start_at.toISOString(),
        moved_end_at: patch.end_at || occ.end_at.toISOString(),
      })
    }
  }

  // 박스 클릭 시: 단발은 event row 로, 루틴은 마스터 event row 로 EventEditor 열기.
  // WeekView 가 신규 draft 를 넘기면 그대로 editorTarget 으로 사용 (DB 미저장).
  // anchorRect 는 EventEditor 팝오버 위치 계산에 사용.
  const handleSelectOccurrence = (occ, anchorRect) => {
    if (!occ) return
    setEditorAnchor(anchorRect || null)
    if (occ.__draft) {
      setEditorTarget(occ)
      return
    }
    if (!occ.is_routine) {
      const ev = events.find(e => e.id === occ.event_id) || occ
      setEditorTarget(ev)
    } else {
      const ev = events.find(e => e.id === occ.event_id)
      if (ev) setEditorTarget(ev)
    }
  }

  const showEmptyPlaceholder = !masterAll && enabled.length === 0

  return (
    <div className="schedule-page">
      <div className="schedule-toolbar">
        <div className="title">캘린더</div>

        <div className="nav">
          <button onClick={handlePrev} title={view === 'month' ? '이전 달' : '이전 주'}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={handleToday}>오늘</button>
          <button onClick={handleNext} title={view === 'month' ? '다음 달' : '다음 주'}>
            <ChevronRight size={14} />
          </button>
          <span className="label">{navLabel}</span>
        </div>

        <div className="spacer" />

        {/* 활성 owner 미니 마커 — 클릭하면 설정 모달 오픈 */}
        <div
          className="owner-markers"
          onClick={() => setSettingsOpen(true)}
          title="표시 계정 설정"
        >
          {masterAll ? (
            <span className="dot" style={{ background: 'var(--color-master-text)' }} />
          ) : enabled.length === 0 ? (
            <span className="empty">계정 없음</span>
          ) : (
            <>
              {markerDots.map(d => (
                <span key={d.uid} className="dot" style={{ background: d.hue }} />
              ))}
              {enabled.length > MARKER_LIMIT && (
                <span className="more">+{enabled.length - MARKER_LIMIT}</span>
              )}
            </>
          )}
        </div>

        <ScheduleSearch events={events} onJump={handleSearchJump} />

        <button onClick={() => setSettingsOpen(true)} title="캘린더 설정">
          <Settings size={14} />
        </button>

        <div className="view-switch">
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>주</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>월</button>
          <button className={view === '3day' ? 'active' : ''} onClick={() => setView('3day')}>3일</button>
        </div>
      </div>

      {showEmptyPlaceholder ? (
        <div className="schedule-empty-placeholder">
          <div>표시할 계정을 선택해 주세요</div>
          <button onClick={() => setSettingsOpen(true)}>설정 열기</button>
        </div>
      ) : view === 'month' ? (
        <MonthView
          monthAnchor={monthAnchor}
          occurrences={occurrences}
          selfUid={selfUid}
          ownerEmailByUid={ownerEmailByUid}
          colorLabels={colorLabels}
          onUpdate={handleOccurrenceUpdate}
          onSelect={handleSelectOccurrence}
          onDayJump={handleDayJump}
        />
      ) : view === '3day' ? (
        <WeekView
          weekStart={threeDayStart}
          dayCount={3}
          occurrences={occurrences}
          selfUid={selfUid}
          ownerEmailByUid={ownerEmailByUid}
          colorLabels={colorLabels}
          onUpdate={handleOccurrenceUpdate}
          onSelect={handleSelectOccurrence}
          onToggleCheck={toggleCompleted}
          pendingDraft={editorTarget?.__draft ? editorTarget : null}
        />
      ) : (
        <WeekView
          weekStart={weekStart}
          occurrences={occurrences}
          selfUid={selfUid}
          ownerEmailByUid={ownerEmailByUid}
          colorLabels={colorLabels}
          onUpdate={handleOccurrenceUpdate}
          onSelect={handleSelectOccurrence}
          onToggleCheck={toggleCompleted}
          pendingDraft={editorTarget?.__draft ? editorTarget : null}
        />
      )}

      {editorTarget && (
        <EventEditor
          event={editorTarget}
          anchorRect={editorAnchor}
          links={(linksByEvent[editorTarget.event_id || editorTarget.id] || [])}
          linkTargets={linkTargets}
          onCreateLink={async ({ target_type, target_id }) => {
            const eventId = editorTarget.event_id || editorTarget.id
            if (!eventId || editorTarget.__draft) return null
            await createLink({ event_id: eventId, target_type, target_id })
            refetchLinks()
          }}
          onDeleteLink={async (id) => {
            await deleteLink(id)
            refetchLinks()
          }}
          onToggleLinkTodo={toggleLinkTodo}
          onNavigateToLink={navigateToLinkTarget}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={handleEditorClose}
        />
      )}

      <ScheduleSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        selfUid={selfUid}
        selfEmail={selfEmail}
        linkedAccounts={linkedAccounts}
        enabledOwners={enabled}
        onToggleOwner={toggle}
        isMaster={!!isMaster}
        masterAll={masterAll}
        onToggleMasterAll={toggleMasterAll}
        colorLabels={colorLabels}
        onSetColorLabel={setColorLabel}
      />

      {loading && (
        <div style={{ position: 'absolute', top: 60, right: 16, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          로딩…
        </div>
      )}
    </div>
  )
}
