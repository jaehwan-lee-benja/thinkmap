import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Check, Pin, PinOff, Settings } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { generateUUID } from '../../utils/uuid'
import { buildDailyPageTemplate } from '../../utils/worklogUtils'
import { DEFAULT_SECTION_ID } from '../../utils/worklogConstants'
import { todoToggle } from '../../utils/toggleNodeFactory'
import { extractH2Sections, filterByVisibility, findSectionMatcher as findMatcher } from '../../utils/sectionUtils'
import { useAuthContext } from '../../contexts/AuthContext'
import { useWorklogUserSettings } from '../../hooks/useWorklogUserSettings'
import './QuickTodo.css'

/**
 * Quick Todo — 상단바에서 빠르게 todo를 입력하여 오늘 업무일지에 삽입
 */
export default function QuickTodo({ session }) {
  const { isMaster } = useAuthContext()
  const { quicktodoPinned, updateQuicktodoPinned } = useWorklogUserSettings(session)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [availableSections, setAvailableSections] = useState([])

  // Supabase 기반 고정 섹션
  const pinnedSection = quicktodoPinned?.id || null
  const pinnedSectionName = quicktodoPinned?.name || null

  const inputRef = useRef(null)
  const wrapperRef = useRef(null)
  // 마지막 삽입 정보 (섹션 이동용)
  const lastInsertRef = useRef(null) // { pageId, todoText, fromSectionId }
  // 기본 섹션 이름 (DB에서 조회)
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

  const getOrCreateTodayPage = useCallback(async () => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const { data: calPages } = await supabase
      .from('pages').select('id').eq('page_type', 'calendar').is('deleted_at', null).limit(1)
    if (!calPages?.length) throw new Error('캘린더 페이지 없음')
    const calendarId = calPages[0].id

    const { data: todayPages } = await supabase
      .from('pages').select('id, content_tiptap')
      .eq('parent_id', calendarId).eq('page_date', todayStr)
      .eq('page_type', 'daily').is('deleted_at', null).limit(1)
    if (todayPages?.length > 0) return todayPages[0]

    const { data: recentPages } = await supabase
      .from('pages').select('page_date, content_tiptap')
      .eq('parent_id', calendarId).eq('page_type', 'daily').is('deleted_at', null)
      .order('page_date', { ascending: false }).limit(1)

    const template = await buildDailyPageTemplate(recentPages || [], supabase)
    const newPage = {
      id: generateUUID(), user_id: session.user.id, name: `업무일지_${todayStr}`,
      parent_id: calendarId, content_tiptap: template, project_id: null,
      page_type: 'daily', page_date: todayStr, position: 0,
    }
    const { error } = await supabase.from('pages').insert([newPage])
    if (error) throw error
    return { id: newPage.id, content_tiptap: template }
  }, [session])

  const extractSections = (content) =>
    filterByVisibility(extractH2Sections(content), isMaster)

  /** 섹션에 todo 삽입 */
  const insertTodo = useCallback(async (todoText, targetId) => {
    const page = await getOrCreateTodayPage()
    const content = page.content_tiptap
    if (!content?.content) throw new Error('페이지 콘텐츠 없음')

    const sections = extractSections(content)
    const { matcher, found } = findMatcher(content, targetId)
    const newTodo = todoToggle(todoText)

    let actualTarget = null
    const newContent = { ...content, content: content.content.map(node => {
      if (actualTarget || !matcher(node)) return node
      actualTarget = { id: node.attrs?.sectionId, title: node.content?.[0]?.content?.[0]?.text }
      const children = [...(node.content || [])]
      children.splice(children.length > 1 ? children.length : 1, 0, newTodo)
      return { ...node, content: children }
    })}

    await supabase.from('pages').update({ content_tiptap: newContent }).eq('id', page.id)
    window.dispatchEvent(new CustomEvent('quicktodo-inserted', { detail: { pageId: page.id } }))

    lastInsertRef.current = { pageId: page.id, todoText, fromSectionId: actualTarget?.id }
    return { sections, sectionNotFound: !found, actualTarget }
  }, [getOrCreateTodayPage, isMaster])

  /** 마지막 삽입한 todo를 다른 섹션으로 이동 */
  const moveTodoToSection = useCallback(async (section) => {
    const last = lastInsertRef.current
    if (!last) return

    const { data } = await supabase.from('pages').select('content_tiptap').eq('id', last.pageId).single()
    if (!data?.content_tiptap) return

    const content = data.content_tiptap
    let removedTodo = null

    // 원래 섹션에서 제거
    const afterRemove = { ...content, content: content.content.map(node => {
      if (node.type !== 'toggle' || node.attrs?.blockType !== 'h2') return node
      if (node.attrs?.sectionId !== last.fromSectionId) return node
      const children = (node.content || []).filter(child => {
        if (removedTodo) return true
        if (child.type === 'toggle' && child.attrs?.isTodo) {
          const childText = child.content?.[0]?.content?.[0]?.text
          if (childText === last.todoText) { removedTodo = child; return false }
        }
        return true
      })
      return { ...node, content: children }
    })}

    if (!removedTodo) return

    // 대상 섹션에 삽입
    const targetMatcher = (node) => node.type === 'toggle' && node.attrs?.blockType === 'h2' && node.attrs?.sectionId === section.id
    const finalContent = { ...afterRemove, content: afterRemove.content.map(node => {
      if (!targetMatcher(node)) return node
      const children = [...(node.content || [])]
      children.splice(children.length > 1 ? children.length : 1, 0, removedTodo)
      return { ...node, content: children }
    })}

    await supabase.from('pages').update({ content_tiptap: finalContent }).eq('id', last.pageId)
    window.dispatchEvent(new CustomEvent('quicktodo-inserted', { detail: { pageId: last.pageId } }))

    lastInsertRef.current = { ...last, fromSectionId: section.id }
  }, [])

  const pinSection = (section) => {
    updateQuicktodoPinned({ id: section.id || section.title, name: section.title })
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
      const targetId = pinnedSection || DEFAULT_SECTION_ID
      const { sections, sectionNotFound, actualTarget } = await insertTodo(text.trim(), targetId)

      if (sectionNotFound) handleUnpin()

      const targetInfo = actualTarget ? sections.find(s => s.id === actualTarget.id || s.title === actualTarget.title) : null
      setText('')
      setResult({
        success: true, sections,
        insertedTo: actualTarget?.title || defaultSectionName,
        insertedToId: actualTarget?.id,
        visibility: targetInfo?.visibility || 'all',
        sectionNotFound: sectionNotFound ? targetId : null,
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
      const page = await getOrCreateTodayPage()
      setAvailableSections(extractSections(page.content_tiptap))
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
                key={s.id || s.title}
                className={`quick-todo-section-btn ${s.visibility === 'master' ? 'master' : ''} ${(s.id && s.id === pinnedSection) || s.title === pinnedSection ? 'current' : ''}`}
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
                        key={s.id || s.title}
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
