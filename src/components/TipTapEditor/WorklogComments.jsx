import React, { useState, useRef, useEffect } from 'react'
import { MessageSquare, Check, Trash2, AtSign } from 'lucide-react'

function formatTime(dateStr) {
  const d = new Date(dateStr)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${min}`
}

export default function WorklogComments({
  comments,
  mentionableUsers,
  currentUserEmail,
  onAdd,
  onToggleResolved,
  onDelete,
}) {
  const [input, setInput] = useState('')
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef(null)

  const unresolvedCount = comments.filter(c => !c.resolved).length

  // @ 입력 감지
  const handleInputChange = (e) => {
    const value = e.target.value
    setInput(value)

    const lastAt = value.lastIndexOf('@')
    if (lastAt !== -1 && (lastAt === 0 || value[lastAt - 1] === ' ')) {
      const query = value.slice(lastAt + 1)
      if (!query.includes(' ')) {
        setMentionFilter(query.toLowerCase())
        setShowMentionDropdown(true)
        return
      }
    }
    setShowMentionDropdown(false)
  }

  const handleMentionSelect = (user) => {
    const lastAt = input.lastIndexOf('@')
    const before = input.slice(0, lastAt)
    setInput(`${before}@${user.displayName} `)
    setShowMentionDropdown(false)
    inputRef.current?.focus()
  }

  const handleSubmit = () => {
    if (!input.trim()) return
    // @멘션 추출
    const mentionRegex = /@(\S+)/g
    const mentions = []
    let match
    while ((match = mentionRegex.exec(input)) !== null) {
      const found = mentionableUsers.find(u => u.displayName === match[1])
      if (found) mentions.push({ email: found.email, display_name: found.displayName })
    }
    onAdd(input, mentions)
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const filteredUsers = mentionableUsers.filter(u =>
    u.displayName.toLowerCase().includes(mentionFilter)
  )

  return (
    <div className="worklog-comments">
      <button
        className={`worklog-comments-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <MessageSquare size={14} />
        <span>코멘트{unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}</span>
      </button>

      {isOpen && (
        <div className="worklog-comments-body">
          {comments.length === 0 && (
            <div className="worklog-comments-empty">코멘트가 없습니다</div>
          )}

          {comments.map(comment => {
            const displayEmail = comment.user_email || ''
            const authorName = displayEmail ? displayEmail.split('@')[0] : comment.user_id?.slice(0, 8)

            return (
              <div key={comment.id} className={`worklog-comment ${comment.resolved ? 'resolved' : ''}`}>
                <div className="worklog-comment-header">
                  <span className="worklog-comment-author">
                    {authorName}
                  </span>
                  <span className="worklog-comment-time">{formatTime(comment.created_at)}</span>
                </div>
                <div className="worklog-comment-content">{comment.content}</div>
                <div className="worklog-comment-actions">
                  <button
                    className={`worklog-comment-action ${comment.resolved ? 'active' : ''}`}
                    onClick={() => onToggleResolved(comment.id)}
                    title={comment.resolved ? '미해결로 변경' : '해결됨으로 표시'}
                  >
                    <Check size={12} />
                    <span>{comment.resolved ? '해결됨' : '해결'}</span>
                  </button>
                  {onDelete && (
                    <button
                      className="worklog-comment-action delete"
                      onClick={() => onDelete(comment.id)}
                      title="삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          <div className="worklog-comment-input-wrapper">
            <div className="worklog-comment-input-row">
              <input
                ref={inputRef}
                className="worklog-comment-input"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="코멘트 입력... @로 멘션"
              />
              <button
                className="worklog-comment-submit"
                onClick={handleSubmit}
                disabled={!input.trim()}
              >
                전송
              </button>
            </div>
            {showMentionDropdown && filteredUsers.length > 0 && (
              <div className="worklog-mention-dropdown">
                {filteredUsers.map(user => (
                  <button
                    key={user.email}
                    className="worklog-mention-item"
                    onMouseDown={(e) => { e.preventDefault(); handleMentionSelect(user) }}
                  >
                    <AtSign size={12} />
                    <span>{user.displayName}</span>
                    <span className="worklog-mention-email">{user.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
