import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import WeekView from './WeekView'
import EventEditor from './EventEditor'
import ScheduleSettingsModal from './ScheduleSettingsModal'
import { useScheduleEvents } from '../../hooks/useScheduleEvents'
import { useScheduleInstances } from '../../hooks/useScheduleInstances'
import { useLinkedAccounts } from '../../hooks/useLinkedAccounts'
import { useEnabledOwners } from '../../hooks/useEnabledOwners'
import { useAuthContext } from '../../contexts/AuthContext'
import { startOfWeek, addDays, ownerHue } from './scheduleUtils'
import { buildOccurrences } from './routineUtils'
import './Schedule.css'

const MARKER_LIMIT = 4   // 툴바에 표시할 owner 색 점 최대 개수

/**
 * 캘린더 페이지 — 주간/월간/3일 뷰의 컨테이너.
 * Phase 1.5: 모달 기반 다중 owner 필터 + 마스터 전체 토글 + owner hue 마커.
 */
export default function SchedulePage({ session }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const { isMaster } = useAuthContext() || {}

  const selfUid = session?.user?.id
  const selfEmail = session?.user?.email

  const { linkedAccounts } = useLinkedAccounts(session)
  const { enabled, masterAll, toggle, toggleMasterAll } = useEnabledOwners(selfUid)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorTarget, setEditorTarget] = useState(null)
  const [editorAnchor, setEditorAnchor] = useState(null)   // EventEditor 팝오버 앵커

  // fetch 범위: 주의 시작 ~ 다음 주 시작
  const from = weekStart
  const to = useMemo(() => addDays(weekStart, 7), [weekStart.getTime()])

  const { events, loading, createEvent, updateEvent, deleteEvent, refetch } =
    useScheduleEvents({ from, to, ownerIds: enabled, masterAll, session })

  // 루틴 인스턴스 fetch (현재 주에 보이는 routine event 들에 대해서만)
  const routineEventIds = useMemo(
    () => events.filter(e => e.is_routine).map(e => e.id),
    [events]
  )
  const { instances, upsertInstance, toggleCompleted, refetch: refetchInstances } =
    useScheduleInstances({ eventIds: routineEventIds, from, to })

  // occurrences 빌드 (단발 + 루틴 펼침 + instance override 머지)
  const occurrences = useMemo(() => {
    const instancesByEvent = {}
    instances.forEach(inst => {
      if (!instancesByEvent[inst.event_id]) instancesByEvent[inst.event_id] = []
      instancesByEvent[inst.event_id].push(inst)
    })
    return buildOccurrences(events, from, to, instancesByEvent)
  }, [events, instances, from, to])

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6)
    const y = weekStart.getFullYear()
    const m = weekStart.getMonth() + 1
    return `${y}.${String(m).padStart(2, '0')}.${String(weekStart.getDate()).padStart(2, '0')} – ${end.getMonth() + 1}.${String(end.getDate()).padStart(2, '0')}`
  }, [weekStart])

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
          <button onClick={() => setWeekStart(d => addDays(d, -7))} title="이전 주">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}>오늘</button>
          <button onClick={() => setWeekStart(d => addDays(d, 7))} title="다음 주">
            <ChevronRight size={14} />
          </button>
          <span className="label">{weekLabel}</span>
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

        <button onClick={() => setSettingsOpen(true)} title="캘린더 설정">
          <Settings size={14} />
        </button>

        {/* 뷰 스위처 자리 (Phase 4) */}
        <div className="view-switch">
          <button className="active">주</button>
          <button disabled title="Phase 4">월</button>
          <button disabled title="Phase 4">3일</button>
        </div>
      </div>

      {showEmptyPlaceholder ? (
        <div className="schedule-empty-placeholder">
          <div>표시할 계정을 선택해 주세요</div>
          <button onClick={() => setSettingsOpen(true)}>설정 열기</button>
        </div>
      ) : (
        <WeekView
          weekStart={weekStart}
          occurrences={occurrences}
          selfUid={selfUid}
          ownerEmailByUid={ownerEmailByUid}
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
      />

      {loading && (
        <div style={{ position: 'absolute', top: 60, right: 16, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          로딩…
        </div>
      )}
    </div>
  )
}
