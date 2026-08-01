// 숫자 키패드 모달 — 태블릿 하단 키보드 대신 테이블링/주문번호 숫자 입력. (유저 지시 2026-08-01)
// 화면 오른쪽으로 치우치게 떠서 왼쪽 표 내용이 계속 보인다. 누를 때마다 실시간 patch.
import { useEffect } from 'react'

const MAX_LEN = 6

export default function SeatNumpad({ order, field, onPatch, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!order || !field) return null

  const title = field === 'queue_no' ? '테이블링' : '주문번호'
  const raw = field === 'queue_no'
    ? (order.queue_no > 0 ? String(order.queue_no) : '')
    : (order.order_no || '')

  const setValue = (next) => {
    if (field === 'queue_no') onPatch?.(order.id, { queue_no: next === '' ? null : Number(next) })
    else onPatch?.(order.id, { order_no: next })
  }
  const press = (d) => setValue((raw + d).slice(0, MAX_LEN))
  const backspace = () => setValue(raw.slice(0, -1))
  const clear = () => setValue('')

  return (
    <div className="seat-numpad-scrim" onClick={onClose}>
      <div className="seat-numpad" role="dialog" aria-label={`${title} 숫자 입력`} onClick={(e) => e.stopPropagation()}>
        <div className="seat-numpad-head">
          <span className="seat-numpad-title">{title}</span>
          <button type="button" className="seat-btn" onClick={onClose}>닫기</button>
        </div>
        <div className="seat-numpad-display">{raw || '-'}</div>
        <div className="seat-numpad-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} type="button" className="seat-numpad-key" onClick={() => press(String(n))}>{n}</button>
          ))}
          <button type="button" className="seat-numpad-key seat-numpad-key--fn" onClick={clear}>지움</button>
          <button type="button" className="seat-numpad-key" onClick={() => press('0')}>0</button>
          <button type="button" className="seat-numpad-key seat-numpad-key--fn" onClick={backspace}>⌫</button>
        </div>
      </div>
    </div>
  )
}
