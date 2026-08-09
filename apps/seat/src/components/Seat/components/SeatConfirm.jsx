// 행 단위 확인 모달 — 자리후 표 안에서 «정말 할까요?»를 묻는 자리 전용.
//
// ★왜 만들었나(리팩토링 라운드 ⑴, 2026-08-09): 같은 모달을 OrderRow 안에서 **여섯 벌** 손으로 그리고 있었고,
//   그 사이가 이미 갈라져 있었다 — 2026-08-08 유저 지시(「[취소] 버튼 제거, X 닫기」)가 **6곳 중 1곳에만** 반영됐고,
//   Esc 로 닫기는 여섯 벌 **전부** 없었다(공용 SeatModal 에만 있었다). 두 벌이 되면 한쪽이 낡는다 —
//   이미 낡은 뒤였다. 한 벌로 모으면서 그 지시를 여섯 곳에 완제한다.
//
// SeatModal(설정·현황·통계)과는 **용도가 다르다**: 저쪽은 «열어놓고 보는 판», 이쪽은 «묻고 닫는 판»이다.
//   구조도 다르다(머리말/본문/꼬리말 vs 제목/설명/액션). 억지로 한 컴포넌트로 합치면 둘 다 어색해진다.
//
// 닫는 길은 셋이고 전부 «아니오»다: 우상단 ✕ · 스크림 클릭 · Esc.
//   그래서 액션 줄에는 «할 것»만 남는다([취소]/[유지] 같은 순수 취소 버튼은 두지 않는다 — 유저 지시).
import { useEffect } from 'react'

export default function SeatConfirm({ open, label, title, desc, stack = false, onClose, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="seat-confirm-scrim" onClick={onClose}>
      <div
        className="seat-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="seat-confirm-x" aria-label="닫기" title="닫기" onClick={onClose}>✕</button>
        <div className="seat-confirm-title">{title}</div>
        {desc ? <div className="seat-confirm-desc">{desc}</div> : null}
        <div className={`seat-confirm-acts${stack ? ' seat-confirm-acts--stack' : ''}`}>{children}</div>
      </div>
    </div>
  )
}
