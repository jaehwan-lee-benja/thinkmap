import React from 'react'
import { CheckSquare, Square, ExternalLink } from 'lucide-react'
import { useBoardTodos } from '../../hooks/useBoardTodos'

/**
 * 투두 레인 — daily_blocks(is_todo) 를 우선순위순으로 표시. CRM-BOARD-SPEC §3, §5.
 * P1: 읽기 중심(미완료 우선, 최근 날짜). 지표 연결(↳연결지표)·양방향은 P3.
 *
 * @param session
 * @param period   'week'|'month'|'year'
 * @param anchor   Date
 * @param onOpenPage  (pageId) => void   투두의 원본 데일리 페이지로 이동(있으면)
 */
export default function TodoLane({ session, period, anchor, onOpenPage }) {
  const { open, done, total, pages, loading } = useBoardTodos(session, period, anchor)

  const row = (t) => (
    <li key={t.block_id} className={`crmb-todo ${t.todo_checked ? 'is-done' : ''}`}>
      <span className="crmb-todo-check" aria-hidden="true">
        {t.todo_checked ? <CheckSquare size={15} /> : <Square size={15} />}
      </span>
      <span className="crmb-todo-text">{t.text_content || '(빈 투두)'}</span>
      <span className="crmb-todo-meta">
        {pages[t.page_id] || ''}
        {t.page_date ? ` · ${t.page_date.slice(5)}` : ''}
        {onOpenPage && (
          <button className="crmb-todo-open" title="원본 페이지 열기"
            onClick={() => onOpenPage(t.page_id)}>
            <ExternalLink size={12} />
          </button>
        )}
      </span>
    </li>
  )

  return (
    <section className="crmb-lane crmb-lane-todos" aria-label="투두">
      <header className="crmb-lane-head">
        <h3 className="crmb-lane-title">투두</h3>
        <span className="crmb-lane-count">
          {loading ? '…' : `미완료 ${open.length} · 전체 ${total}`}
        </span>
      </header>

      {loading ? (
        <div className="crmb-empty">불러오는 중…</div>
      ) : total === 0 ? (
        <div className="crmb-empty">이 기간에 등록된 투두가 없습니다.</div>
      ) : (
        <div className="crmb-todo-scroll">
          {open.length > 0 && (
            <ul className="crmb-todo-list">{open.map(row)}</ul>
          )}
          {done.length > 0 && (
            <>
              <div className="crmb-todo-divider">완료 {done.length}</div>
              <ul className="crmb-todo-list">{done.map(row)}</ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
