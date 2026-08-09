// 태블링 나란히 보기 — 자리후 본문 옆에 태블링 대기열(ceo.tabling.co.kr/list)을 액자로 띄운다.
// 유저 지시 2026-08-09 「혹시 자리후에 좌우를 나눠서 태블링 리스트를 함께 볼 수 있나?」 → 「만들어보자」.
//
// ★배치 규율(오늘 sticky 로 두 번 데인 뒤 세운 것):
//   이 판은 **자리후 스크롤포트(.seat-main) 밖 형제**다. 안에 넣으면 표 헤더·탭바·툴바의 sticky 기준이
//   통째로 흔들린다(2026-08-08 실증: 스크롤 상자가 하나 끼면 sticky 가 그 상자 기준으로 다시 잡힌다).
//
// ★리사이저는 SeatTableHead.ColumnResizer 와 같은 문법 — React 합성 onPointerDown 이 이 환경에서
//   발동하지 않아 DOM 리스너를 직접 달고, 추적은 document 로 한다(핸들 밖으로 끌어도 잡힘).
//   드래그 중엔 액자에 pointer-events:none 을 준다 — 안 그러면 포인터가 iframe 위로 들어간 순간
//   이벤트를 태블링 문서가 먹어 리사이즈가 뚝 끊긴다.
//
// ★분할비는 **퍼센트(flex-basis)** 로 준다 — 가로형(row)에선 폭, 세로형(column)에선 높이로 같은 값이
//   그대로 먹혀서 방향 분기 없이 한 벌로 돌아간다.
import { useEffect, useRef, useState } from 'react'

export const TABLING_URL = 'https://ceo.tabling.co.kr/list'
const RATIO_KEY = 'seat.tablingPane.ratio.v1'
const RATIO_DEFAULT = 0.28 // 좌 ≈3:7 (유저 지시 범위 2:8~3:7)
const RATIO_MIN = 0.15
const RATIO_MAX = 0.6
const LOAD_TIMEOUT = 12000 // 이 시간 안에 load 가 한 번도 안 오면 «못 불러왔다»로 본다

const clamp = (r) => Math.min(RATIO_MAX, Math.max(RATIO_MIN, r))

function loadRatio() {
  try {
    const v = Number(localStorage.getItem(RATIO_KEY))
    return Number.isFinite(v) && v > 0 ? clamp(v) : RATIO_DEFAULT
  } catch { return RATIO_DEFAULT }
}

export default function TablingPane({ onClose }) {
  const [ratio, setRatio] = useState(loadRatio)
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [nonce, setNonce] = useState(0) // ↻ 새로고침 — key 를 바꿔 액자를 다시 만든다(교차 출처라 내부 reload 호출 불가)
  const paneRef = useRef(null)
  const gripRef = useRef(null)

  // 저장은 드래그가 끝난 뒤가 아니라 값이 멎을 때 — 어차피 문자열 하나라 비용이 없다.
  useEffect(() => { try { localStorage.setItem(RATIO_KEY, String(ratio)) } catch { /* noop */ } }, [ratio])

  // 로드 판정: load 가 오면 성공, 안 오면 폴백. ★교차 출처라 «차단당했는지»는 JS 로 알 수 없다
  //   (X-Frame-Options 로 막히면 크롬이 오류 페이지를 그리고 load 는 **정상 발화**한다).
  //   그래서 «영영 안 뜨는» 경우만 이 타이머가 잡고, 「빈 액자」 케이스는 머리말의 [새 탭] 이 받는다.
  useEffect(() => {
    setLoaded(false)
    setTimedOut(false)
    const t = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT)
    return () => clearTimeout(t)
  }, [nonce])

  useEffect(() => {
    const el = gripRef.current
    if (!el) return
    const onDown = (e) => {
      e.preventDefault()
      const pane = paneRef.current
      const box = pane?.parentElement // .seat-body — 분할의 기준 상자
      if (!box) return
      const vertical = getComputedStyle(box).flexDirection === 'column' // 세로형 = 위/아래 분할
      box.classList.add('is-splitting') // 드래그 중 액자에 pointer-events:none (아래 CSS)
      const rect = box.getBoundingClientRect()
      const onMove = (ev) => {
        const r = vertical
          ? (ev.clientY - rect.top) / rect.height
          : (ev.clientX - rect.left) / rect.width
        if (Number.isFinite(r)) setRatio(clamp(r))
      }
      const onUp = () => {
        box.classList.remove('is-splitting')
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
  }, [])

  const failed = timedOut && !loaded

  return (
    <>
      <aside
        ref={paneRef}
        className="seat-side"
        style={{ flexBasis: `${(ratio * 100).toFixed(2)}%` }}
        aria-label="태블링 대기열"
      >
        <div className="seat-side-head">
          <span className="seat-side-title">태블링</span>
          {/* 새 탭 = 폴백이자 상시 탈출구. 액자 안에서 로그인이 안 되거나 화면이 깨지면 여기로 나간다. */}
          <a className="seat-btn seat-side-btn" href={TABLING_URL} target="_blank" rel="noreferrer">새 탭</a>
          <button type="button" className="seat-btn seat-side-btn" onClick={() => setNonce((n) => n + 1)} title="다시 불러오기">↻</button>
          {onClose && <button type="button" className="seat-btn seat-side-btn" onClick={onClose} title="나란히 보기 끄기">✕</button>}
        </div>
        <div className="seat-side-frame">
          <iframe
            key={nonce}
            className="seat-side-iframe"
            src={TABLING_URL}
            title="태블링 대기열"
            onLoad={() => setLoaded(true)}
          />
          {failed && (
            <div className="seat-side-fallback" role="status">
              <p>태블링을 불러올 수 없어요.</p>
              <a className="seat-btn seat-btn-primary" href={TABLING_URL} target="_blank" rel="noreferrer">새 탭으로 열기</a>
              <button type="button" className="seat-btn" onClick={() => setNonce((n) => n + 1)}>다시 시도</button>
            </div>
          )}
        </div>
      </aside>
      <div
        ref={gripRef}
        className="seat-splitter"
        role="separator"
        aria-label="태블링 화면 비율 조절"
      />
    </>
  )
}
