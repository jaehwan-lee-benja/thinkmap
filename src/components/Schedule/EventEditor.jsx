import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Repeat, Link2, X, CheckSquare, Square, FileText, ExternalLink, Bell } from 'lucide-react'
import RoutineEditor from './RoutineEditor'
import TodoPicker from './TodoPicker'
import PagePicker from './PagePicker'

const COLORS = [
  '#3b82f6',   // blue
  '#10b981',   // green
  '#f59e0b',   // amber
  '#ef4444',   // red
  '#8b5cf6',   // violet
  '#ec4899',   // pink
  '#64748b',   // slate
]

// datetime-local 입력값 변환
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(val) {
  if (!val) return null
  return new Date(val).toISOString()
}

/**
 * @param event           schedule_events row (편집 모드) — 없으면 신규 생성 모드
 * @param anchorRect      { top, bottom, left, right, width, height } — 박스/드래그 좌표 (없으면 중앙)
 * @param links           [link rows] — 이 이벤트에 연결된 schedule_event_links (Phase 3a: todo 만)
 * @param linkTargets     { [block_id]: { text_content, todo_checked, page_name } } — 표시용 메타
 * @param onSave          (patch) => Promise
 * @param onDelete        () => Promise
 * @param onClose         () => void
 * @param onCreateLink    ({ target_type, target_id }) => Promise (이벤트 미저장 시 null 반환 가능)
 * @param onDeleteLink    (link_id) => Promise
 * @param onToggleLinkTodo  (blockId, currentChecked) => Promise — 연결된 todo 의 체크 토글
 * @param onNavigateToLink  (link) => void — 원본 페이지로 이동
 */
export default function EventEditor({
  event, anchorRect,
  links = [], linkTargets = {},
  onSave, onDelete, onClose,
  onCreateLink, onDeleteLink, onToggleLinkTodo, onNavigateToLink,
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [noEnd, setNoEnd] = useState(false)
  const [allDay, setAllDay] = useState(false)
  const [color, setColor] = useState(COLORS[0])
  const [isShared, setIsShared] = useState(false)
  const [rrule, setRrule] = useState(null)
  const [routineOpen, setRoutineOpen] = useState(false)
  const [notifyMin, setNotifyMin] = useState('')   // '' = 없음, '0' = 시작 시점, '5' / '10' / ...
  const [todoPickerOpen, setTodoPickerOpen] = useState(false)
  const [pagePickerOpen, setPagePickerOpen] = useState(false)

  useEffect(() => {
    if (event) {
      setTitle(event.title || '')
      setDescription(event.description || '')
      setStartAt(toLocalInput(event.start_at))
      setEndAt(toLocalInput(event.end_at))
      // end_at === start_at 이면 포인트 이벤트로 인식
      setNoEnd(!!event.start_at && event.end_at === event.start_at)
      setAllDay(!!event.all_day)
      setColor(event.color || COLORS[0])
      setIsShared(!!event.is_shared)
      setRrule(event.rrule || null)
      setRoutineOpen(!!event.rrule)   // 이미 루틴이면 자동 펼침
      setNotifyMin(event.notify_minutes_before == null ? '' : String(event.notify_minutes_before))
    }
  }, [event?.id])

  // ── 팝오버 위치 계산 ──────────────────────────────────────
  const editorRef = useRef(null)
  const [popoverStyle, setPopoverStyle] = useState({ visibility: 'hidden' })

  useLayoutEffect(() => {
    const compute = () => {
      const editor = editorRef.current
      if (!editor) return
      const w = editor.offsetWidth
      const h = editor.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight
      const gap = 8

      // 모바일 (≤600px): 바텀시트 — 화면 가로 가득 + 화면 하단
      if (vw <= 600) {
        setPopoverStyle({
          position: 'fixed',
          left: 0, right: 0, bottom: 0,
          width: '100vw',
          maxWidth: '100vw',
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          maxHeight: '85vh',
        })
        return
      }

      if (!anchorRect) {
        // 앵커 없음 — 화면 중앙
        setPopoverStyle({
          position: 'fixed',
          left: Math.max(gap, (vw - w) / 2),
          top:  Math.max(gap, (vh - h) / 2),
        })
        return
      }

      // 가로: 오른쪽 우선, 못 들어가면 왼쪽, 양쪽 다 안되면 앵커 좌측에 맞춰 clamp
      let left = anchorRect.right + gap
      if (left + w > vw - gap) {
        const leftSide = anchorRect.left - w - gap
        left = leftSide >= gap ? leftSide : Math.max(gap, Math.min(vw - w - gap, anchorRect.left))
      }

      // 세로: 앵커 top 기준, 아래로 넘치면 위로 끌어올리고, 그래도 화면 위쪽이면 gap 으로 고정
      let top = anchorRect.top
      if (top + h > vh - gap) top = vh - h - gap
      if (top < gap) top = gap

      setPopoverStyle({ position: 'fixed', left, top })
    }

    compute()

    // 콘텐츠 크기 변경(루틴화 펼침 등)에 따라 재계산
    let ro
    if (editorRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(compute)
      ro.observe(editorRef.current)
    }
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [anchorRect])

  if (!event) return null

  const handleSave = async () => {
    let startIso = fromLocalInput(startAt)
    let endIso = noEnd ? startIso : fromLocalInput(endAt)
    // all_day: 그날 00:00:00 ~ 다음날 00:00:00 (시간정보 제거)
    if (allDay && startIso) {
      const s = new Date(startIso); s.setHours(0, 0, 0, 0)
      const e = endIso ? new Date(endIso) : new Date(s)
      e.setHours(0, 0, 0, 0)
      if (+e <= +s) e.setDate(s.getDate() + 1)
      startIso = s.toISOString()
      endIso = e.toISOString()
    }
    const patch = {
      title: title.trim(),
      description: description.trim() || null,
      start_at: startIso,
      end_at: endIso,
      all_day: allDay,
      color,
      is_shared: isShared,
      is_routine: !!rrule,
      rrule: rrule || null,
      notify_minutes_before: notifyMin === '' ? null : parseInt(notifyMin, 10),
    }
    await onSave(patch)
    onClose()
  }

  const handleDelete = async () => {
    const msg = event?.is_routine
      ? '루틴 전체 시리즈를 삭제할까요? (회차별 체크/이동 기록도 함께 사라집니다)'
      : '이 일정을 삭제할까요?'
    if (!confirm(msg)) return
    await onDelete()
    onClose()
  }

  return (
    <div className="event-editor-backdrop popover" onClick={onClose}>
      <div
        ref={editorRef}
        className="event-editor"
        style={popoverStyle}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <h3>일정</h3>

        <div>
          <label>제목</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목"
            autoFocus
          />
        </div>

        <div className="row">
          <div>
            <label>시작</label>
            <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
          </div>
          <div>
            <label>종료</label>
            <input
              type="datetime-local"
              value={noEnd ? '' : endAt}
              onChange={e => setEndAt(e.target.value)}
              disabled={noEnd}
              placeholder="종료 없음"
            />
          </div>
        </div>

        <label className="no-end-toggle">
          <input
            type="checkbox"
            checked={allDay}
            onChange={e => setAllDay(e.target.checked)}
          />
          종일 (all-day) — 하루 단위. 시간 무시.
        </label>

        <label className="no-end-toggle">
          <input
            type="checkbox"
            checked={noEnd}
            disabled={allDay}
            onChange={e => setNoEnd(e.target.checked)}
          />
          종료 없이 만들기 — 그 시각에 한 줄 마커로 표시
        </label>

        <div>
          <label>색상</label>
          <div className="color-row">
            {COLORS.map(c => (
              <div
                key={c}
                className={`color-swatch ${c === color ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <label className="shared-toggle">
          <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} />
          공유 일정 — 연결된 모든 계정에서 함께 표시
        </label>

        <div className="notify-row">
          <label><Bell size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />알림</label>
          <select value={notifyMin} onChange={e => setNotifyMin(e.target.value)}>
            <option value="">없음</option>
            <option value="0">시작 시점</option>
            <option value="5">5분 전</option>
            <option value="10">10분 전</option>
            <option value="15">15분 전</option>
            <option value="30">30분 전</option>
            <option value="60">1시간 전</option>
            <option value="1440">1일 전</option>
          </select>
        </div>

        {/* 연결된 항목 (Phase 3a — todo 만) */}
        {event && !event.__draft && (
          <div className="link-section">
            <div className="link-section-label">연결된 항목</div>
            {links.map(link => {
              const t = linkTargets[link.target_id] || {}
              return (
                <div key={link.id} className="link-row">
                  {link.target_type === 'todo' ? (
                    <button
                      type="button"
                      className="link-todo-check"
                      onClick={() => onToggleLinkTodo?.(link.target_id, !!t.todo_checked)}
                      title={t.todo_checked ? '체크 해제' : '완료 체크'}
                    >
                      {t.todo_checked
                        ? <CheckSquare size={14} className="link-icon checked" />
                        : <Square size={14} className="link-icon" />}
                    </button>
                  ) : link.target_type === 'page' ? (
                    <FileText size={12} className="link-icon" />
                  ) : (
                    <Link2 size={12} className="link-icon" />
                  )}
                  <span className={`link-label ${t.todo_checked ? 'todo-done' : ''}`}>
                    {t.text_content || t.page_name || '(연결된 항목)'}
                    {t.text_content && t.page_name ? ` · ${t.page_name}` : ''}
                  </span>
                  <button
                    className="link-remove"
                    onClick={() => onNavigateToLink?.(link)}
                    title="원본 페이지로 가기"
                  >
                    <ExternalLink size={12} />
                  </button>
                  <button
                    className="link-remove"
                    onClick={() => onDeleteLink?.(link.id)}
                    title="연결 해제"
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="link-add-btn"
                type="button"
                onClick={() => setTodoPickerOpen(true)}
                style={{ flex: 1 }}
              >
                <Link2 size={12} /> 투두 연결
              </button>
              <button
                className="link-add-btn"
                type="button"
                onClick={() => setPagePickerOpen(true)}
                style={{ flex: 1 }}
              >
                <FileText size={12} /> 페이지 연결
              </button>
            </div>
          </div>
        )}

        {!routineOpen ? (
          <button
            type="button"
            className="routine-toggle-btn"
            onClick={() => {
              // 기본 반복 = 매일. (없으면 RoutineEditor 의 초기 state='none' 때문에
              //  즉시 onChange(null) 가 발사되어 자동 접힘 버그)
              if (!rrule) setRrule('FREQ=DAILY')
              setRoutineOpen(true)
            }}
          >
            <Repeat size={14} />
            <span>루틴화</span>
          </button>
        ) : (
          <>
            <RoutineEditor
              rrule={rrule}
              startAt={fromLocalInput(startAt)}
              onChange={(r) => {
                setRrule(r)
                // RoutineEditor 에서 "반복 안 함" 선택 시 섹션 자동 접기
                if (r === null) setRoutineOpen(false)
              }}
            />
            {rrule && (
              <div className="routine-scope-notice">
                ※ 저장/삭제는 <b>전체 시리즈</b>에 적용됩니다.<br />
                한 회차만 이동·체크하려면 캘린더에서 박스를 직접 드래그하거나 체크박스를 누르세요.
              </div>
            )}
          </>
        )}

        <div>
          <label>설명 (선택)</label>
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <TodoPicker
          isOpen={todoPickerOpen}
          onClose={() => setTodoPickerOpen(false)}
          excludeIds={links.filter(l => l.target_type === 'todo').map(l => l.target_id)}
          onPick={async (block) => {
            await onCreateLink?.({ target_type: 'todo', target_id: block.block_id })
          }}
        />
        <PagePicker
          isOpen={pagePickerOpen}
          onClose={() => setPagePickerOpen(false)}
          excludeIds={links.filter(l => l.target_type === 'page').map(l => l.target_id)}
          onPick={async (page) => {
            await onCreateLink?.({ target_type: 'page', target_id: page.id })
          }}
        />

        <div className="actions">
          {event?.id && !event?.__draft ? (
            <button className="danger" onClick={handleDelete}>삭제</button>
          ) : <div />}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onClose}>취소</button>
            <button className="primary" onClick={handleSave}>저장</button>
          </div>
        </div>
      </div>
    </div>
  )
}
