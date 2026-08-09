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

// ★배율(줌) — 유저 지시 2026-08-09 「테이블링 같이 뜨는 영역 화면 더 넓게 보고싶은데, 배율 조정 가능할까? 태블릿이야」.
//   같은 칸에 더 넓은 태블링 화면을 넣는 방법은 **액자를 넓히는 것**과 **내용을 줄이는 것** 둘인데,
//   칸은 이미 분할비로 조절하니 여기서 필요한 건 후자다. `transform: scale(k)` + `width/height: calc(100%/k)` —
//   액자의 레이아웃 폭을 1/k 로 키우고 그림만 k 로 줄인다. 즉 **태블링은 «더 큰 화면»으로 인식하고 우리는 작게 본다.**
//   (단순히 폰트만 줄이는 게 아니라 반응형 분기까지 넓은 쪽으로 넘어간다 — 표가 잘리지 않는 이유.)
const ZOOM_KEY = 'seat.tablingPane.zoom.v1'
const ZOOM_MIN = 50
const ZOOM_MAX = 150
const ZOOM_STEP = 10

const clamp = (r) => Math.min(RATIO_MAX, Math.max(RATIO_MIN, r))
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z)))

function loadRatio() {
  try {
    const v = Number(localStorage.getItem(RATIO_KEY))
    return Number.isFinite(v) && v > 0 ? clamp(v) : RATIO_DEFAULT
  } catch { return RATIO_DEFAULT }
}

function loadZoom() {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY))
    return Number.isFinite(v) && v > 0 ? clampZoom(v) : 100
  } catch { return 100 }
}

export default function TablingPane({ onClose }) {
  const [ratio, setRatio] = useState(loadRatio)
  const [zoom, setZoom] = useState(loadZoom)
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [nonce, setNonce] = useState(0) // ↻ 새로고침 — key 를 바꿔 액자를 다시 만든다(교차 출처라 내부 reload 호출 불가)
  const paneRef = useRef(null)
  const gripRef = useRef(null)

  // 저장은 드래그가 끝난 뒤가 아니라 값이 멎을 때 — 어차피 문자열 하나라 비용이 없다.
  useEffect(() => { try { localStorage.setItem(RATIO_KEY, String(ratio)) } catch { /* noop */ } }, [ratio])
  useEffect(() => { try { localStorage.setItem(ZOOM_KEY, String(zoom)) } catch { /* noop */ } }, [zoom])

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
          {/* 배율 — [−][%][+]. 가운데 숫자를 누르면 100% 로 되돌린다(초기화 버튼을 따로 두면 머리말이 더 붐빈다). */}
          <span className="seat-side-zoom">
            <button type="button" className="seat-btn seat-side-btn" onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))} disabled={zoom <= ZOOM_MIN} title="작게(더 넓게 보기)">−</button>
            <button type="button" className="seat-btn seat-side-btn seat-side-zoom-val" onClick={() => setZoom(100)} title="배율 100% 로">{zoom}%</button>
            <button type="button" className="seat-btn seat-side-btn" onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))} disabled={zoom >= ZOOM_MAX} title="크게">+</button>
          </span>
          {/* 새 탭 = 폴백이자 상시 탈출구. 액자 안에서 로그인이 안 되거나 화면이 깨지면 여기로 나간다. */}
          <a className="seat-btn seat-side-btn" href={TABLING_URL} target="_blank" rel="noreferrer">새 탭</a>
          <button type="button" className="seat-btn seat-side-btn" onClick={() => setNonce((n) => n + 1)} title="다시 불러오기">↻</button>
          {onClose && <button type="button" className="seat-btn seat-side-btn" onClick={onClose} title="나란히 보기 끄기">✕</button>}
        </div>
        <div className="seat-side-frame" style={{ '--seat-side-zoom': zoom / 100 }}>
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
