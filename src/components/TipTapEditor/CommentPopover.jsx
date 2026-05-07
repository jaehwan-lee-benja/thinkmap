// 코멘트 팝오버 — 💬 클릭 시 todo/section 옆에 floating panel 로 표시.
// anchorEl 의 화면 위치 기준으로 absolute 배치. 외부 클릭 시 onClose.

import React, { useEffect, useRef, useState } from 'react'

const GAP = 8
const PANEL_WIDTH = 360
const VIEWPORT_PADDING = 12

function computePosition(anchorEl) {
  if (!anchorEl) return { top: 0, left: 0 }
  const rect = anchorEl.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  // 기본: anchor 의 우측에 표시. 공간 부족하면 아래.
  let left = rect.right + GAP
  let top = rect.top
  if (left + PANEL_WIDTH > vw - VIEWPORT_PADDING) {
    left = Math.max(VIEWPORT_PADDING, rect.left)
    top = rect.bottom + GAP
  }
  // 화면 아래 넘침 — 위로
  if (top + 320 > vh - VIEWPORT_PADDING) {
    top = Math.max(VIEWPORT_PADDING, vh - 320 - VIEWPORT_PADDING)
  }
  return { top: Math.round(top), left: Math.round(left) }
}

export default function CommentPopover({ anchorEl, onClose, children }) {
  const panelRef = useRef(null)
  const [pos, setPos] = useState(() => computePosition(anchorEl))

  // anchor 변경/스크롤/리사이즈 시 위치 재계산
  useEffect(() => {
    if (!anchorEl) return
    const update = () => setPos(computePosition(anchorEl))
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorEl])

  // 외부 클릭으로 닫기
  useEffect(() => {
    const handler = (e) => {
      if (!panelRef.current) return
      if (panelRef.current.contains(e.target)) return
      // anchor (💬 버튼) 자체 클릭은 별도 토글 흐름 — popover 닫지 않음
      if (anchorEl && anchorEl.contains(e.target)) return
      onClose?.()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [anchorEl, onClose])

  // ESC 로 닫기
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className="comment-popover"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: PANEL_WIDTH,
        zIndex: 1000,
      }}
    >
      {children}
    </div>
  )
}
