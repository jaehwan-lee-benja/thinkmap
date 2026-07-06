import React, { useEffect, useMemo, useState } from 'react'
import { Search, X, CheckSquare, Square } from 'lucide-react'
import { supabase, logError } from '@thinkmap/core'

/**
 * 투두 선택 모달.
 * - daily_blocks 에서 is_todo=true, 삭제 안 된 항목 fetch
 * - 미체크 우선, 최근 page_date 우선
 * - 검색어로 text_content 필터
 * - 페이지명 그룹 표시
 *
 * @param isOpen
 * @param onPick   (block) => void
 * @param onClose  () => void
 * @param excludeIds  이미 연결된 block_id 배열 (목록에서 가림)
 */
export default function TodoPicker({ isOpen, onPick, onClose, excludeIds = [] }) {
  const [todos, setTodos] = useState([])
  const [pages, setPages] = useState({})    // page_id → page name
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  // fetch on open
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const { data: blocks, error } = await supabase
          .from('daily_blocks')
          .select('block_id, page_id, page_date, text_content, todo_checked, todo_status')
          .eq('is_todo', true)
          .is('deleted_at', null)
          .order('todo_checked', { ascending: true })
          .order('page_date', { ascending: false })
          .limit(200)
        if (error) throw error
        if (cancelled) return

        // page 이름 매핑
        const pageIds = Array.from(new Set((blocks || []).map(b => b.page_id)))
        let pageMap = {}
        if (pageIds.length) {
          const { data: pageRows } = await supabase
            .from('pages')
            .select('id, name')
            .in('id', pageIds)
          ;(pageRows || []).forEach(p => { pageMap[p.id] = p.name })
        }
        setTodos(blocks || [])
        setPages(pageMap)
      } catch (err) {
        logError('TodoPicker.fetch', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  const filtered = useMemo(() => {
    const ex = new Set(excludeIds)
    const q = query.trim().toLowerCase()
    return todos.filter(t => {
      if (ex.has(t.block_id)) return false
      if (!q) return true
      return (t.text_content || '').toLowerCase().includes(q)
    })
  }, [todos, query, excludeIds])

  if (!isOpen) return null

  return (
    <div className="event-editor-backdrop" onClick={onClose}>
      <div className="event-editor schedule-settings todo-picker" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h3>투두 연결</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="todo-picker-search">
          <Search size={14} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="투두 내용 검색…"
            autoFocus
          />
        </div>

        <div className="todo-picker-list">
          {loading ? (
            <div className="todo-picker-empty">불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div className="todo-picker-empty">
              {todos.length === 0 ? '연결 가능한 투두가 없습니다' : '검색 결과 없음'}
            </div>
          ) : (
            filtered.map(t => (
              <button
                key={t.block_id}
                className={`todo-picker-item ${t.todo_checked ? 'checked' : ''}`}
                onClick={() => { onPick(t); onClose() }}
              >
                {t.todo_checked ? <CheckSquare size={14} /> : <Square size={14} />}
                <span className="todo-text">{t.text_content || '(빈 투두)'}</span>
                <span className="todo-page">
                  {pages[t.page_id] || ''}
                  {t.page_date ? ` · ${t.page_date.slice(5)}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
