// 대형 번호패드 — 직원/고객 공용. 오타방지(자릿수 그룹 표시·백스페이스·클리어).
// 계약 무관 순수 UI. 값(digits)은 상위가 소유(controlled). 터치타겟 대형(MOBILE-DESIGN ≥36px 상회).
// 물리 키보드 지원: 마운트 중 window keydown 으로 0~9·Backspace·Enter·Esc 를 같은 state 로 처리
//   (조회·가입 두 화면이 각자 NumberPad 를 쓰므로 한 번에 하나만 마운트 → 전역 리스너 안전).
//   텍스트 입력(이름 등)에 포커스가 있으면 그쪽이 처리하도록 양보한다.
import { useEffect, useRef } from 'react'
import { formatPhone } from './kioskUtils'
import { BURST_GAP_MS } from './useScanner'
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
  //
  // ★스캐너 버스트가 번호칸을 오염시키는 문제(2026-08-06). 세 번 고쳐서 여기까지 왔다:
  //   ⑴ «간격 40ms 미만이면 버린다» → **2번째 글자부터만** 듣는다. 버스트의 첫 글자는
  //      직전 입력과 간격이 길어 사람 타이핑과 **실시간 구분이 원리적으로 불가능**하다.
  //   ⑵ «스캔 확정 후 되돌린다» → 번호칸이 정원(11)이라 애초에 안 샜는데도 끝자리가 우연히
  //      토큰의 숫자와 같으면 **멀쩡한 자리를 지웠다**(실측에서 010-1234-5678 → …-567).
  //   ⑶ ⇒ **지연 확정**: 첫 글자를 바로 넣지 않고 BURST_GAP_MS 만큼 들고 있다가,
  //      그 사이에 다음 입력이 촘촘하게 붙으면 «스캐너였다»로 보고 **취소**한다.
  //      추측이 아니라 **관측 후 결정**이라 우연 일치가 생길 여지가 없다.
  //   ▸비용: 물리 키보드 입력에 80ms 지연이 붙는다(직원 노트북 한정). **터치 입력은 이 경로를
  //     안 탄다** — 키오스크의 «패드가 더디다» 개선(pointerdown 즉시 반영)은 그대로다.
  const lastKeyAtRef = useRef(0)
  const pendingRef = useRef(null)     // { ch, timer } — 아직 확정 안 한 첫 글자
  const digitsRef = useRef(digits)
  digitsRef.current = digits
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const cancelPending = () => {
      if (pendingRef.current) { clearTimeout(pendingRef.current.timer); pendingRef.current = null }
    }
    const flushPending = () => {
      if (!pendingRef.current) return
      const { ch, timer } = pendingRef.current
      clearTimeout(timer); pendingRef.current = null
      if (digitsRef.current.length < maxLength) onChangeRef.current(digitsRef.current + ch)
    }
    const onKey = (e) => {
      if (disabled) return
      const now = Date.now()
      const gap = now - lastKeyAtRef.current
      lastKeyAtRef.current = now
      if (gap < BURST_GAP_MS) { cancelPending(); return }   // 버스트 확인 — 보류분까지 취소
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        flushPending()                                      // 앞 글자는 «사람»으로 확정됐다
        if (digitsRef.current.length >= maxLength) return
        const ch = e.key
        const timer = setTimeout(() => {
          pendingRef.current = null
          if (digitsRef.current.length < maxLength) onChangeRef.current(digitsRef.current + ch)
        }, BURST_GAP_MS)
        pendingRef.current = { ch, timer }
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        if (pendingRef.current) { cancelPending(); return }  // 보류 중이던 글자를 지운다
        onChangeRef.current(digitsRef.current.slice(0, -1))
      } else if (e.key === 'Escape') {
        e.preventDefault(); cancelPending(); onChangeRef.current(clearTo)
      } else if (e.key === 'Enter') {
        flushPending()
        if (!submitDisabled && digitsRef.current.length >= 10) { e.preventDefault(); onSubmit?.() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); cancelPending() }
  }, [disabled, submitDisabled, maxLength, onSubmit, clearTo])

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
