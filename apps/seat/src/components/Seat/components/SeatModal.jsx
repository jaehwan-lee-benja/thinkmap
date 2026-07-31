// 공용 모달 — 스크림 클릭·Esc·닫기 버튼으로 닫힌다. (설정 / 현황 '더보기' 등)
// 잠깐 보고 닫는 용도. 상시 표시가 필요한 것은 모달에 넣지 않는다.
import { useEffect } from 'react'

export default function SeatModal({ open, title, onClose, foot, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="seat-modal-scrim" onClick={onClose}>
      <div
        className="seat-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="seat-modal-head">
          <div className="seat-modal-title">{title}</div>
          <button type="button" className="seat-btn" onClick={onClose}>닫기</button>
        </div>
        <div className="seat-modal-body">{children}</div>
        {foot ? <div className="seat-modal-foot">{foot}</div> : null}
      </div>
    </div>
  )
}
