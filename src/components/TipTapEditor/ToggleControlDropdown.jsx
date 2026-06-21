import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, ChevronRight, List, ListTree } from 'lucide-react'

/**
 * 토글 일괄 제어 드롭다운.
 * - 전체 닫기 / 전체 열기 / 1단까지만 열기 / N단까지 열기
 * - editorRef.current.commands.setAllTogglesOpen(depth) 호출
 *
 * variant:
 *  - "toolbar": 툴바용 — 'tiptap-btn tiptap-btn-secondary' 스타일
 *  - "header":  WorklogHeader 용 — 'worklog-calendar-btn' 톤
 */
export default function ToggleControlDropdown({ editorRef, getEditors, variant = 'toolbar', resetKey }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => { setOpen(false) }, [resetKey])

  const applyDepth = useCallback((depth) => {
    // 2단 데일리는 좌/우 두 에디터가 따로다 — getEditors 가 있으면 양쪽 모두에 적용.
    // (단일 페이지/1단은 editorRef 하나로 기존과 동일 동작)
    const eds = getEditors ? getEditors() : (editorRef?.current ? [editorRef.current] : [])
    eds.forEach((ed, i) => {
      if (!ed) return
      const chain = ed.chain()
      if (i === 0) chain.focus()   // 첫 에디터만 포커스 — 둘째 pane 포커스 탈취/스크롤 점프 방지
      chain.setAllTogglesOpen(depth).run()
    })
  }, [editorRef, getEditors])

  const promptDepth = useCallback(() => {
    const raw = window.prompt('몇 단까지 열까요? (1 이상의 정수)', '2')
    if (raw == null) return
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) {
      window.alert('1 이상의 정수를 입력해주세요.')
      return
    }
    applyDepth(n)
  }, [applyDepth])

  const btnClass = variant === 'header'
    ? `worklog-calendar-btn ${open ? 'open' : ''}`
    : `tiptap-btn tiptap-btn-secondary page-nav-chevron ${open ? 'open' : ''}`

  return (
    <div className="page-nav-dropdown-wrapper" ref={wrapperRef}>
      <button
        className={btnClass}
        onClick={() => setOpen(prev => !prev)}
        title="토글 제어"
      >
        <ChevronDown size={14} />
        <span>토글 제어</span>
      </button>
      {open && (
        <div className="page-nav-dropdown toggle-control-dropdown">
          <div className="page-nav-dropdown-list">
            <button className="page-nav-dropdown-item" onClick={() => { applyDepth(0); setOpen(false) }}>
              <ChevronRight size={14} />
              <span>전체 닫기</span>
            </button>
            <button className="page-nav-dropdown-item" onClick={() => { applyDepth(Infinity); setOpen(false) }}>
              <ChevronDown size={14} />
              <span>전체 열기</span>
            </button>
            <button className="page-nav-dropdown-item" onClick={() => { applyDepth(1); setOpen(false) }}>
              <List size={14} />
              <span>1단까지만 열기</span>
            </button>
            <button className="page-nav-dropdown-item" onClick={() => { promptDepth(); setOpen(false) }}>
              <ListTree size={14} />
              <span>N단까지 열기…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
