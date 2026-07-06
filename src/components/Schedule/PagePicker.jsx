import React, { useEffect, useMemo, useState } from 'react'
import { Search, X, FileText } from 'lucide-react'
import { supabase } from '@thinkmap/core'
import { logError } from '../../utils/supabaseError'

/**
 * 페이지 선택 모달.
 * - pages 에서 normal/schedule/daily/calendar 등 가용 페이지 fetch
 * - 검색어로 name 필터
 * - Phase 3b — page 링크용
 *
 * @param isOpen
 * @param onPick   (page) => void
 * @param onClose  () => void
 * @param excludeIds  이미 연결된 page_id 배열
 */
export default function PagePicker({ isOpen, onPick, onClose, excludeIds = [] }) {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('pages')
          .select('id, name, page_type, page_date')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(200)
        if (error) throw error
        if (!cancelled) setPages(data || [])
      } catch (err) {
        logError('PagePicker.fetch', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  const filtered = useMemo(() => {
    const ex = new Set(excludeIds)
    const q = query.trim().toLowerCase()
    return pages.filter(p => {
      if (ex.has(p.id)) return false
      if (!q) return true
      return (p.name || '').toLowerCase().includes(q)
    })
  }, [pages, query, excludeIds])

  if (!isOpen) return null

  return (
    <div className="event-editor-backdrop" onClick={onClose}>
      <div className="event-editor schedule-settings todo-picker" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h3>페이지 연결</h3>
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
            placeholder="페이지 이름 검색…"
            autoFocus
          />
        </div>

        <div className="todo-picker-list">
          {loading ? (
            <div className="todo-picker-empty">불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div className="todo-picker-empty">
              {pages.length === 0 ? '연결 가능한 페이지가 없습니다' : '검색 결과 없음'}
            </div>
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                className="todo-picker-item"
                onClick={() => { onPick(p); onClose() }}
              >
                <FileText size={14} />
                <span className="todo-text">{p.name || '(이름 없음)'}</span>
                <span className="todo-page">{p.page_type}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
