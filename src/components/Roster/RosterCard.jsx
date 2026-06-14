// 배치도 진입 카드 — daily 페이지 헤더 아래에 표시. 클릭 시 RosterModal.
// daily 본문(TipTap/daily_blocks)과 완전 분리(독립 테이블) → mass-delete류 위험 없음.

import React, { useEffect, useState, useCallback } from 'react'
import { Users, ChevronRight } from 'lucide-react'
import { fetchRosterCount } from '../../hooks/useRoster'
import RosterModal from './RosterModal'
import './Roster.css'

export default function RosterCard({ boardId, pageId, workDate, session, isMaster = false, canEdit = true }) {
  const [count, setCount] = useState(null)
  const [open, setOpen] = useState(false)

  const refreshCount = useCallback(async () => {
    if (!boardId || !workDate) { setCount(0); return }
    const c = await fetchRosterCount(boardId, workDate)
    setCount(c)
  }, [boardId, workDate])

  useEffect(() => { refreshCount() }, [refreshCount])

  // boardId 없으면(부모 없는 daily) 표시하지 않음
  if (!boardId) return null

  return (
    <>
      <button
        type="button"
        className="roster-card"
        onClick={() => setOpen(true)}
        title="이 날짜의 근무 배치 보기/편집"
      >
        <span className="roster-card-icon"><Users size={15} /></span>
        <span className="roster-card-label">배치도</span>
        <span className="roster-card-count">
          {count == null ? '…' : count > 0 ? `${count}명 배치` : '미입력'}
        </span>
        <span className="roster-card-arrow"><ChevronRight size={15} /></span>
      </button>

      {open && (
        <RosterModal
          boardId={boardId}
          pageId={pageId}
          workDate={workDate}
          session={session}
          isMaster={isMaster}
          canEdit={canEdit}
          onClose={() => { setOpen(false); refreshCount() }}
        />
      )}
    </>
  )
}
