// 대형 번호패드 — 직원/고객 공용. 오타방지(자릿수 그룹 표시·백스페이스·클리어).
// 계약 무관 순수 UI. 값(digits)은 상위가 소유(controlled). 터치타겟 대형(MOBILE-DESIGN ≥36px 상회).
import './NumberPad.css'

// 010-1234-5678 형태로 그룹핑(최대 11자리). 오타 인지를 쉽게.
function formatPhone(digits) {
  const d = digits.slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

export default function NumberPad({
  digits,
  onChange,
  onSubmit,
  submitLabel = '조회',
  disabled = false,
  maxLength = 11,
}) {
  const press = (k) => {
    if (disabled) return
    if (k === 'back') return onChange(digits.slice(0, -1))
    if (k === 'clear') return onChange('')
    if (digits.length >= maxLength) return
    onChange(digits + k)
  }

  return (
    <div className="mk-pad">
      <div className="mk-pad-display" aria-live="polite">
        {digits ? formatPhone(digits) : <span className="mk-pad-placeholder">전화번호</span>}
      </div>
      <div className="mk-pad-grid">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`mk-key ${k === 'clear' || k === 'back' ? 'mk-key-aux' : ''}`}
            onClick={() => press(k)}
            disabled={disabled}
          >
            {k === 'back' ? '⌫' : k === 'clear' ? '전체지움' : k}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="mk-pad-submit"
        onClick={() => !disabled && onSubmit?.()}
        disabled={disabled || digits.length < 10}
      >
        {submitLabel}
      </button>
    </div>
  )
}
