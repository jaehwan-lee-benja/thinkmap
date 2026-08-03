// 표 입력칸 공용 — ★타이핑 끝 글자 유실 방지(유저 신고 2026-08-03: "132 쳤는데 1만 남음 / '취소' 치면 '취'만").
//
// 원인 구조: 예전엔 키 입력마다 곧바로 서버로 patch 를 보내고, 화면 값은 서버에서 돌아온 order 를 그대로 그렸다.
//   그래서 ① 타이핑 도중 도착한 Realtime refetch 가 방금 친 글자를 옛 값으로 되돌리거나
//   ② 한글 조합(IME) 중에 리렌더가 끼어들어 조합 중이던 글자가 잘려나갔다.
// 해결: **입력 중에는 화면이 로컬 draft 만 본다.** 서버 값은 포커스가 없고 조합 중도 아닐 때만 draft 에 반영한다.
//   저장은 타이핑이 멈춘 뒤(debounce) 한 번 + blur·Enter 즉시 flush. 쓰기 횟수도 줄어든다.
// ※숫자 전용은 sanitize 로 걸러 쓴다(부모가 넘긴다). 화면키패드(numpadOn) 경로는 이 컴포넌트를 쓰지 않는다.
import { useState, useRef, useEffect, useCallback } from 'react'

const SAVE_DELAY = 450 // 타이핑이 멎었다고 볼 시간(ms). 주방 태블릿 타건 속도 기준으로 넉넉히.

export default function SeatTextField({
  value,
  onCommit,          // (nextValue) => void — 실제 저장(부모가 patch 구성)
  sanitize,          // (raw) => string — 선택. 숫자 전용 등
  as = 'input',      // 'input' | 'textarea'
  ...rest
}) {
  const [draft, setDraft] = useState(value ?? '')
  const focusedRef = useRef(false)
  const composingRef = useRef(false)
  const timerRef = useRef(null)
  const draftRef = useRef(draft)
  draftRef.current = draft

  // 서버 값 반영은 '내가 안 만지는 동안'에만 — 남이 고친 값은 따라오되 내 타이핑은 안 밀린다.
  useEffect(() => {
    if (focusedRef.current || composingRef.current) return
    setDraft(value ?? '')
  }, [value])

  const flush = useCallback((v) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const next = v ?? draftRef.current
    if ((value ?? '') === next) return // 바뀐 게 없으면 쓰지 않는다
    onCommit?.(next)
  }, [onCommit, value])

  // 언마운트(줄 삭제·화면 전환) 시 아직 안 보낸 마지막 입력을 잃지 않게.
  useEffect(() => () => { if (timerRef.current) { clearTimeout(timerRef.current); onCommit?.(draftRef.current) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { timerRef.current = null; flush() }, SAVE_DELAY)
  }

  const handleChange = (e) => {
    const raw = e.target.value
    // ★조합(IME) 중에는 sanitize 를 걸지 않는다 — 조합 중 문자열을 건드리면 그 글자가 깨진다.
    const v = sanitize && !composingRef.current ? sanitize(raw) : raw
    setDraft(v)
    schedule()
  }

  const Tag = as
  return (
    <Tag
      {...rest}
      value={draft}
      onChange={handleChange}
      onCompositionStart={() => { composingRef.current = true }}
      onCompositionEnd={(e) => {
        composingRef.current = false
        const v = sanitize ? sanitize(e.target.value) : e.target.value
        setDraft(v)
        schedule()
      }}
      onFocus={(e) => { focusedRef.current = true; rest.onFocus?.(e) }}
      onBlur={(e) => {
        focusedRef.current = false
        composingRef.current = false
        flush()
        rest.onBlur?.(e)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && as !== 'textarea') { flush(); e.currentTarget.blur() }
        rest.onKeyDown?.(e)
      }}
    />
  )
}
