// 대형 번호패드 — 직원/고객 공용. 오타방지(자릿수 그룹 표시·백스페이스·클리어).
// 계약 무관 순수 UI. 값(digits)은 상위가 소유(controlled). 터치타겟 대형(MOBILE-DESIGN ≥36px 상회).
// 물리 키보드 지원: 마운트 중 window keydown 으로 0~9·Backspace·Enter·Esc 를 같은 state 로 처리
//   (조회·가입 두 화면이 각자 NumberPad 를 쓰므로 한 번에 하나만 마운트 → 전역 리스너 안전).
//   텍스트 입력(이름 등)에 포커스가 있으면 그쪽이 처리하도록 양보한다.
import { useEffect, useRef } from 'react'
import { formatPhone } from './kioskUtils'
import './NumberPad.css'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']

export default function NumberPad({
  digits,
  onChange,
  onSubmit,
  submitLabel = '조회',
  disabled = false,
  submitDisabled = false,   // 입력(disabled)과 제출 게이트(submitDisabled)를 분리 — 가입폼처럼 제출만 조건부일 때
  hideSubmit = false,       // 제출 버튼을 폼 쪽(우측)에 따로 둘 때 패드 내부 버튼 숨김(Enter 제출은 유지)
  size = 'md',              // 'md' | 'xl'(조회 화면 주인공, 어르신 대형)
  maxLength = 11,
  // ★[전체지움]이 되돌아갈 값(2026-08-06 «010 기본 표시»). 기본 '' = 종전 동작.
  //   프리필을 쓰는 화면은 '010' 을 준다 — 비우면 손님이 010 을 매번 다시 눌러야 해서
  //   프리필의 이점이 사라진다.
  clearTo = '',
}) {
  const canSubmit = !disabled && !submitDisabled && digits.length >= 10

  const press = (k) => {
    if (disabled) return
    if (k === 'back') return onChange(digits.slice(0, -1))
    if (k === 'clear') return onChange(clearTo)
    if (digits.length >= maxLength) return
    onChange(digits + k)
  }

  // ★터치 반응성(2026-08-06 현장 체감 «더딤»): onClick 은 **손을 뗄 때** 발화한다.
  //   → 누르는 순간(pointerdown) 반영하고, 뒤따라오는 click 은 중복 가드로 무시한다.
  //   (click 을 아예 없애지 않는 이유: 키보드 Enter/Space 접근성과 pointer 미지원 폴백을 남긴다.)
  const pointerAtRef = useRef(0)
  const pressFromPointer = (k) => { pointerAtRef.current = Date.now(); press(k) }
  const pressFromClick = (k) => { if (Date.now() - pointerAtRef.current < 700) return; press(k) }

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
        onChange(clearTo)
      } else if (e.key === 'Enter') {
        if (!submitDisabled && digits.length >= 10) { e.preventDefault(); onSubmit?.() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [digits, disabled, submitDisabled, maxLength, onChange, onSubmit, clearTo])

  return (
    <div className={`mk-pad ${size === 'xl' ? 'mk-pad-xl' : ''}`}>
      <div className="mk-pad-display" aria-live="polite">
        {digits ? formatPhone(digits) : <span className="mk-pad-placeholder">전화번호</span>}
      </div>
      <div className="mk-pad-grid">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`mk-key ${k === 'clear' ? 'mk-key-aux' : ''}${k === 'back' ? ' mk-key-back' : ''}`}
            onPointerDown={(e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; pressFromPointer(k) }}
            onClick={() => pressFromClick(k)}
            disabled={disabled}
            aria-label={k === 'back' ? '한 자리 지움' : k === 'clear' ? '전체 지움' : k}
          >
            {k === 'back' ? <><span className="mk-key-back-ico" aria-hidden="true">⌫</span><span className="mk-key-back-txt">지움</span></> : k === 'clear' ? '전체지움' : k}
          </button>
        ))}
      </div>
      {!hideSubmit && (
        <button
          type="button"
          className="mk-pad-submit"
          onClick={() => canSubmit && onSubmit?.()}
          disabled={!canSubmit}
        >
          {submitLabel}
        </button>
      )}
    </div>
  )
}
