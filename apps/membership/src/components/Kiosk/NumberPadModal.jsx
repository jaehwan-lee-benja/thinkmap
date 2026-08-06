// 전화번호 입력 팝업 — 가입 폼에서 전화 칸을 탭하면 번호패드가 모달로 뜬다(항상 표시 아님, D).
import NumberPad from './NumberPad'

export default function NumberPadModal({ open, digits, onChange, onClose }) {
  if (!open) return null
  return (
    <div className="mk-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="mk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mk-modal-title">전화번호 입력</div>
        <NumberPad
        clearTo="010"   /* 가입 폼 전화칸도 조회 화면과 같은 010 규약 */
          digits={digits}
          onChange={onChange}
          onSubmit={onClose}
          submitLabel="확인"
        />
      </div>
    </div>
  )
}
