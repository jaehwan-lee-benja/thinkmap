// 대형 번호패드 — 직원/고객 공용. 오타방지(자릿수 그룹 표시·백스페이스·클리어).
// 계약 무관 순수 UI. 값(digits)은 상위가 소유(controlled). 터치타겟 대형(MOBILE-DESIGN ≥36px 상회).
// 물리 키보드 지원: 마운트 중 window keydown 으로 0~9·Backspace·Enter·Esc 를 같은 state 로 처리
//   (조회·가입 두 화면이 각자 NumberPad 를 쓰므로 한 번에 하나만 마운트 → 전역 리스너 안전).
//   텍스트 입력(이름 등)에 포커스가 있으면 그쪽이 처리하도록 양보한다.
import { useEffect } from 'react'
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
  submitDisabled = false,   // 입력(disabled)과 제출 게이트(submitDisabled)를 분리 — 가입폼처럼 제출만 조건부일 때
  maxLength = 11,
}) {
  const canSubmit = !disabled && !submitDisabled && digits.length >= 10

  const press = (k) => {
    if (disabled) return
    if (k === 'back') return onChange(digits.slice(0, -1))
    if (k === 'clear') return onChange('')
    if (digits.length >= maxLength) return
    onChange(digits + k)
  }

  // 물리 키보드 입력 — 번호패드와 같은 state 공유. 이름 등 텍스트 입력 포커스 시엔 양보.
  useEffect(() => {
    const onKey = (e) => {
      if (disabled) return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        if (digits.length < maxLength) onChange(digits + e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        onChange(digits.slice(0, -1))
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onChange('')
      } else if (e.key === 'Enter') {
        if (!submitDisabled && digits.length >= 10) { e.preventDefault(); onSubmit?.() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [digits, disabled, submitDisabled, maxLength, onChange, onSubmit])

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
        onClick={() => canSubmit && onSubmit?.()}
        disabled={!canSubmit}
      >
        {submitLabel}
      </button>
    </div>
  )
}
