// 자리안내·주문서관리 공용 표 헤더 — 그룹 제목 1행(테이블링·주문번호·상태·자리순서·올림·확인).
// resizable 이면 각 열(남는 폭 '올림' 제외) 오른쪽 경계에 리사이즈 핸들. onResize(key, px) 로 폭 갱신.
import { useEffect, useRef } from 'react'
import { RESIZABLE_COLUMNS } from '../config/seatSettings'

function ColumnResizer({ colKey, onResize, side = 'right' }) {
  const ref = useRef(null)
  // ★React 합성 onPointerDown 대신 DOM 에 직접 리스너를 단다(합성 이벤트가 이 환경에서 발동 안 됨).
  //   drag 추적도 document 로(핸들 밖으로 끌어도 잡힘). side='left' 면 왼쪽 경계(오른쪽 끌면 좁아짐 → 부호 반전).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onDown = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const cell = el.parentElement
      const startX = e.clientX
      const startW = cell.getBoundingClientRect().width
      const onMove = (ev) => {
        const dx = ev.clientX - startX
        onResize(colKey, side === 'left' ? startW - dx : startW + dx)
      }
      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        document.removeEventListener('pointercancel', onUp)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
    }
    el.addEventListener('pointerdown', onDown)
    return () => el.removeEventListener('pointerdown', onDown)
  }, [colKey, onResize, side])

  return (
    <span
      ref={ref}
      className={`seat-col-resizer seat-col-resizer--${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="열 너비 조절"
    />
  )
}

export default function SeatTableHead({ resizable = false, onResize }) {
  return (
    <div className="seat-row seat-row-head" role="row">
      {RESIZABLE_COLUMNS.map((c) => (
        <div key={c.key} className={`seat-cell seat-cell-${c.cell}`}>
          <span className="seat-head-label">{c.label}</span>
          {resizable && !c.flex && onResize && <ColumnResizer colKey={c.key} onResize={onResize} side={c.side} />}
        </div>
      ))}
      {/* 삭제 열(제목 없음) */}
      <div className="seat-cell seat-cell-del" aria-hidden="true"></div>
    </div>
  )
}
