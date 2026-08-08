// 번호 화면키패드 — 태블릿 하단 키보드 대신 테이블링/주문번호 숫자 입력. (유저 지시 2026-08-01)
// 화면 오른쪽으로 치우치게 떠서 왼쪽 표 내용이 계속 보인다.
//
// ★2026-08-08 «빠르게 입력하면 번호가 잘린다» 수정 — 표 입력칸(SeatTextField)과 같은 병이었다.
//   구조: 예전엔 화면에 그리는 값(raw)이 **서버에서 온 order** 였고, 키를 누를 때마다
//   `raw + 누른키` 를 만들어 **즉시 서버로** 보냈다(read-modify-write). 연타하면
//   두 번째 키가 아직 갱신 안 된 raw 를 읽어 앞 글자가 통째로 사라진다("132" → "3"/"13").
//   Realtime refetch 가 그 사이 도착하면 더 확실히 되돌아간다.
//   수정: **입력 중에는 로컬 draft 만** 쌓고(함수형 setState → 연타 순서 보장),
//   저장은 타이핑이 멎은 뒤(300ms) + 닫기·언마운트 시 즉시 flush. 열려 있는 동안 서버 값은 draft 를 덮지 않는다.
import { useEffect, useRef, useState, useCallback } from 'react'
import { applyNumpadKey, NUMPAD_MAX_LEN } from '../utils/numpadDraft'

const SAVE_DELAY = 300

export default function SeatNumpad({ order, field, onPatch, onClose }) {
  const orderId = order?.id
  const serverValue = !order || !field ? ''
    : field === 'queue_no'
      ? (order.queue_no > 0 ? String(order.queue_no) : '')
      : (order.order_no || '')

  const [draft, setDraft] = useState(serverValue)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const timerRef = useRef(null)
  const orderRef = useRef(order)
  orderRef.current = order

  // 다른 행/필드로 열릴 때만 서버 값으로 초기화한다(열려 있는 동안의 서버 갱신은 무시 — 내가 입력 중).
  useEffect(() => { setDraft(serverValue) }, [orderId, field]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback((next) => {
    const o = orderRef.current
    if (!o || !field) return
    if (field === 'queue_no') {
      onPatch?.(o.id, { queue_no: next === '' ? null : Number(next) })
    } else {
      onPatch?.(o.id, {
        order_no: next,
        // 통계용: 주문번호가 처음 채워지는 순간만 시각 기록.
        ...(!o.order_no && next && !o.order_no_at ? { order_no_at: new Date().toISOString() } : {}),
        // ★주문번호를 비우면 전달 체크도 함께 풀린다(표 입력과 동일 규칙, 유저 지시 2026-08-02).
        ...(!next && o.seat_delivered ? { seat_delivered: false, delivered_at: null, deliver_mode: null } : {}),
      })
    }
  }, [field, onPatch])

  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    save(draftRef.current)
  }, [save])

  // 언마운트(닫기·행 삭제) 시 아직 안 보낸 마지막 입력을 잃지 않게.
  useEffect(() => () => { if (timerRef.current) { clearTimeout(timerRef.current); save(draftRef.current) } }, [save])

  const pressKey = (key) => {
    // ★함수형 갱신 — 연타해도 직전 눌림이 반영된 값 위에 쌓인다(이 버그의 핵심 수정점).
    setDraft((cur) => applyNumpadKey(cur, key, NUMPAD_MAX_LEN))
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { timerRef.current = null; save(draftRef.current) }, SAVE_DELAY)
  }

  const close = () => { flush(); onClose?.() }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { flush(); onClose?.() }
      else if (/^[0-9]$/.test(e.key)) pressKey(e.key)
      else if (e.key === 'Backspace') pressKey('back')
      else if (e.key === 'Enter') { flush(); onClose?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // 매 렌더 재바인딩 — draft 최신값을 쓰는 pressKey 를 잡기 위해(핸들러가 가벼워 비용 무시 가능)

  if (!order || !field) return null

  const title = field === 'queue_no' ? '테이블링' : '주문번호'

  return (
    <div className="seat-numpad-scrim" onClick={close}>
      <div className="seat-numpad" role="dialog" aria-label={`${title} 숫자 입력`} onClick={(e) => e.stopPropagation()}>
        <div className="seat-numpad-head">
          <span className="seat-numpad-title">{title}</span>
          <button type="button" className="seat-btn" onClick={close}>닫기</button>
        </div>
        <div className="seat-numpad-display">{draft || '-'}</div>
        <div className="seat-numpad-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} type="button" className="seat-numpad-key" onClick={() => pressKey(String(n))}>{n}</button>
          ))}
          <button type="button" className="seat-numpad-key seat-numpad-key--fn" onClick={() => pressKey('clear')}>지움</button>
          <button type="button" className="seat-numpad-key" onClick={() => pressKey('0')}>0</button>
          <button type="button" className="seat-numpad-key seat-numpad-key--fn" onClick={() => pressKey('back')}>⌫</button>
        </div>
      </div>
    </div>
  )
}
