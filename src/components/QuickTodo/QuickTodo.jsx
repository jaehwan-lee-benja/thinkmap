import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Check, Pin, PinOff, Settings } from 'lucide-react'
import { supabase } from '@thinkmap/core'
import { DEFAULT_SECTION_ID } from '../../utils/worklogConstants'
import {
  findCalendarPageId,
  ensureTodayDailyPage,
  fetchSectionRows,
  findSectionByMasterId,
  insertTodoIntoSection,
  moveTodoRowToSection,
} from '../../utils/quickTodoOps'
import { useAuthContext } from '../../contexts/AuthContext'
import { useWorklogUserSettings } from '../../hooks/useWorklogUserSettings'
import './QuickTodo.css'

/**
 * Quick Todo — 상단바에서 빠르게 todo를 입력하여 오늘 업무일지에 삽입
 * v2: daily_blocks row 기반.
 *   - 오늘 페이지 보장: createDailyPageV2 (섹션/이월 row 까지 생성)
 *   - 삽입: 섹션 자식으로 toggle row INSERT (block_type='toggle', is_todo=true)
 *   - 이동: parent_block_id / section_id / position UPDATE
 *
 * pinnedSection 는 sectionMasterId 를 저장 — 매일 새 페이지의 섹션 row 로 자동 매핑.
 */
export default function QuickTodo({ session }) {
  const { isMaster } = useAuthContext()
  const { quicktodoPinned, updateQuicktodoPinned } = useWorklogUserSettings(session)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [availableSections, setAvailableSections] = useState([])

  // pinnedSection 의 id 는 sectionMasterId (예: 'fixed_todo', 'usr-xxxx')
  const pinnedSection = quicktodoPinned?.id || null
  const pinnedSectionName = quicktodoPinned?.name || null

  const inputRef = useRef(null)
  const wrapperRef = useRef(null)
  // 마지막 삽입 정보 (섹션 이동용)
  const lastInsertRef = useRef(null) // { pageId, blockId, fromSectionMasterId }
  // 기본 섹션 이름 (DB 에서 조회)
  const [defaultSectionName, setDefaultSectionName] = useState('')
  useEffect(() => {
    supabase.from('worklog_sections').select('title').eq('id', DEFAULT_SECTION_ID).maybeSingle()
      .then(({ data }) => { if (data?.title) setDefaultSectionName(data.title) })
  }, [])

  // 외부 클릭 시 토스트/설정 닫기
  useEffect(() => {
    if (!result && !showSettings) return
    const handle = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setResult(null)
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [result, showSettings])

  // 결과 자동 숨김 (4초)
  useEffect(() => {
    if (!result?.success) return
    const t = setTimeout(() => setResult(null), 4000)
    return () => clearTimeout(t)
  }, [result])

  /** 오늘 daily 페이지 보장. 없으면 createDailyPageV2 로 생성. */
  const getOrCreateTodayPage = useCallback(async () => {
    const calendarId = await findCalendarPageId(supabase)
    if (!calendarId) throw new Error('캘린더 페이지 없음')
    return ensureTodayDailyPage(supabase, { calendarId, userId: session.user.id })
  }, [session])

  /** 섹션 row 를 QuickTodo 가 사용하는 표시 모델로 변환 — id 는 sectionMasterId */
  const toDisplaySection = (row) => ({
    id: row.sectionMasterId || row.blockId,
    title: row.textContent,
    visibility: row.visibility || 'all',
    _row: row,  // 내부용 (실제 blockId 등 row 데이터)
  })

  /** 섹션에 todo 삽입 */
  const insertTodo = useCallback(async (todoText, targetMasterId) => {
    const { pageId, pageDate } = await getOrCreateTodayPage()
    const sectionRows = await fetchSectionRows(supabase, pageId, { isMaster })
    const sections = sectionRows.map(toDisplaySection)
    const { row: targetRow, foundExact } = findSectionByMasterId(sectionRows, targetMasterId, DEFAULT_SECTION_ID)
    if (!targetRow) throw new Error('대상 섹션을 찾을 수 없음')

    const newRow = await insertTodoIntoSection(supabase, {
      pageId,
      pageDate,
      userId: session.user.id,
      sectionRow: targetRow,
      todoText,
    })
    window.dispatchEvent(new CustomEvent('quicktodo-inserted', { detail: { pageId } }))

    lastInsertRef.current = {
      pageId,
      blockId: newRow.blockId,
      fromSectionMasterId: targetRow.sectionMasterId,
    }
    const actualTarget = {
      id: targetRow.sectionMasterId,
      title: targetRow.textContent,
      visibility: targetRow.visibility,
    }
    return { sections, sectionNotFound: !foundExact, actualTarget }
  }, [getOrCreateTodayPage, isMaster, session])

  /** 마지막 삽입한 todo 를 다른 섹션으로 이동 */
  const moveTodoToSection = useCallback(async (section) => {
    const last = lastInsertRef.current
    if (!last) return

    const sectionRows = await fetchSectionRows(supabase, last.pageId, { isMaster })
    const targetRow =
      sectionRows.find(s => s.sectionMasterId === section.id) ||
      sectionRows.find(s => s.blockId === section.id)
    if (!targetRow) return

    await moveTodoRowToSection(supabase, {
      blockId: last.blockId,
      targetSectionRow: targetRow,
      pageId: last.pageId,
    })
    window.dispatchEvent(new CustomEvent('quicktodo-inserted', { detail: { pageId: last.pageId } }))

    lastInsertRef.current = { ...last, fromSectionMasterId: targetRow.sectionMasterId }
  }, [isMaster])

  const pinSection = (section) => {
    updateQuicktodoPinned({ id: section.id, name: section.title })
  }

  const handleUnpin = () => {
    updateQuicktodoPinned(null)
    setResult(prev => prev ? { ...prev, pinnedTo: null } : null)
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!text.trim() || submitting) return
    setSubmitting(true)
    try {
      const targetMasterId = pinnedSection || DEFAULT_SECTION_ID
      const { sections, sectionNotFound, actualTarget } = await insertTodo(text.trim(), targetMasterId)

      if (sectionNotFound) handleUnpin()

      const targetInfo = actualTarget ? sections.find(s => s.id === actualTarget.id || s.title === actualTarget.title) : null
      setText('')
      setResult({
        success: true, sections,
        insertedTo: actualTarget?.title || defaultSectionName,
        insertedToId: actualTarget?.id,
        visibility: targetInfo?.visibility || 'all',
        sectionNotFound: sectionNotFound ? targetMasterId : null,
      })
    } catch (err) {
      console.error('Quick Todo 오류:', err)
      setResult({ success: false })
    } finally {
      setSubmitting(false)
    }
  }

  /** 섹션 버튼 클릭: 방금 입력한 것을 해당 섹션으로 이동 + 고정 */
  const handleSectionClick = async (section) => {
    if (submitting) return
    setSubmitting(true)
    try {
      await moveTodoToSection(section)
      pinSection(section)
      setResult(prev => ({
        ...prev,
        insertedTo: section.title,
        insertedToId: section.id,
        visibility: section.visibility,
        movedTo: section.title,
      }))
    } catch (err) {
      console.error('섹션 이동 오류:', err)
    } finally {
      setSubmitting(false)
    }
  }

  /** 설정 열기: 현재 섹션 목록 로드 */
  const handleOpenSettings = async () => {
    setShowSettings(prev => !prev)
    setResult(null)
    try {
      const { pageId } = await getOrCreateTodayPage()
      const rows = await fetchSectionRows(supabase, pageId, { isMaster })
      setAvailableSections(rows.map(toDisplaySection))
    } catch {}
  }

  return (
    <div className="quick-todo-inline" ref={wrapperRef}>
      <form onSubmit={handleSubmit} className="quick-todo-form">
        <input
          ref={inputRef}
          type="text"
          className="quick-todo-input"
          placeholder={pinnedSectionName ? `${pinnedSectionName}에 추가...` : defaultSectionName ? `${defaultSectionName} 입력...` : '할 일 입력...'}
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" className="quick-todo-submit" disabled={!text.trim() || submitting}>
          {submitting ? '...' : '입력'}
        </button>
        <button type="button" className={`quick-todo-settings-btn ${showSettings ? 'active' : ''}`} onClick={handleOpenSettings} title="Quick Todo 설정">
          <Settings size={13} />
        </button>
      </form>

      {/* 설정 패널 */}
      {showSettings && (
        <div className="quick-todo-toast quick-todo-settings-panel">
          <div className="quick-todo-settings-title">저장 섹션</div>
          {pinnedSection ? (
            <div className="quick-todo-settings-current">
              <Pin size={11} />
              <span>{pinnedSectionName || pinnedSection}</span>
              <button onClick={() => { handleUnpin(); setShowSettings(false) }} title="고정 해제"><PinOff size={11} /></button>
            </div>
          ) : (
            <div className="quick-todo-settings-none">고정 없음 — 기본 "{defaultSectionName}" 섹션에 저장</div>
          )}
          <div className="quick-todo-settings-label">섹션 변경</div>
          <div className="quick-todo-sections">
            {availableSections.map(s => (
              <button
                key={s.id}
                className={`quick-todo-section-btn ${s.visibility === 'master' ? 'master' : ''} ${s.id === pinnedSection ? 'current' : ''}`}
                onClick={() => { pinSection(s); setShowSettings(false) }}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 결과 토스트 */}
      {result && !showSettings && (
        <div className="quick-todo-toast">
          {result.success ? (
            <>
              <div className="quick-todo-success">
                <Check size={12} />
                <span className={`quick-todo-section-tag ${result.visibility === 'master' ? 'master' : ''}`}>
                  {result.insertedTo}
                </span>
                <span>{result.movedTo ? '이동됨' : '추가됨'}</span>
              </div>
              {!result.movedTo && result.sections && result.sections.length > 1 && (
                <div className="quick-todo-sections">
                  <div className="quick-todo-sections-label">다른 섹션으로 이동</div>
                  {result.sections
                    .filter(s => s.title !== result.insertedTo)
                    .map(s => (
                      <button
                        key={s.id}
                        className={`quick-todo-section-btn ${s.visibility === 'master' ? 'master' : ''}`}
                        onClick={() => handleSectionClick(s)}
                      >
                        {s.title}
                      </button>
                    ))
                  }
                </div>
              )}
              {result.sectionNotFound && (
                <div className="quick-todo-notice">"{result.sectionNotFound}" 섹션을 찾을 수 없어 고정 해제됨</div>
              )}
            </>
          ) : (
            <span className="quick-todo-error">오류 발생</span>
          )}
        </div>
      )}
    </div>
  )
}
