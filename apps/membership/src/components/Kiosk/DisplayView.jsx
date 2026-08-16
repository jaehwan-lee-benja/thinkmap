// ★손님용 «응원 화면»(?role=display) — 매장 디스플레이 전용. 조작 대상이 아니라 «읽는» 화면이다.
//
// 1차 범위(지금): 화면·글씨·로고·모션을 **실기기에서 검증**하기 위한 판. 데이터는 모형이고
//   상태는 `?state=done|already|wait|null` 로 강제한다. 서버를 부르지 않으므로 인증 앞에서 갈라진다
//   (TicketView 와 같은 이유 — 이 화면을 여는 태블릿에 로그인을 요구하면 검증부터 막힌다).
// 2차(다음): `membership_query` 실소비 + `membership_events` Realtime 구독으로 스캔에 반응.
//
// 확정 스펙(재질문 없이 고정 — 유저 확정):
//   A 크림 배경 · 이름 별표 마스킹 · 로고 로크업(완료=상단 / 대기=히어로) · multiply 로 크림에 녹임 ·
//   글씨 이름 ~100px·수치 ~54px·멘트 ~33px · 모션=페이드 1회 «동시»·로고 정지·물결 수평·콘페티 ·
//   슬라이드 인·순차 등장 금지 · 대기 화면엔 버튼 없음 · 구형 사파리(아이패드 미니) 대응.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMembershipChannel } from './useMembershipChannel'
import './display.css'

// 축하를 띄워 두는 시간. ★손님이 «읽을» 시간이지 애니메이션 시간이 아니다 —
//   이름 100px 을 읽고 도장 수를 세는 데 필요한 만큼(12초). 지나면 조용히 대기로 돌아간다.
const CHEER_MS = 12000

const LOGO = `${import.meta.env.BASE_URL}img/logo-membership.png`

// ★콘페티 조각은 «결정적»으로 흩는다 — Math.random 을 쓰면 캡처마다 그림이 달라져
//   시각 회귀를 눈으로 비교할 수 없다(오늘 여러 번 그 비교로 결함을 잡았다).
//
// ★모션 규범 v1.0 준수(2026-08-16 대조에서 위반 2건 잡아 고침):
//   · «1회» — 예전엔 infinite 였다. 12초 내내 흩날리면 축하가 아니라 배경 소음이 된다.
//   · «중앙 회피» — 이름 100px 과 도장 줄이 가운데를 쓴다. 조각을 좌우 날개(0~26% / 74~98%)에만
//     둔다. 앞서 콘페티를 글자 «뒤»로 보낸 것(z-index)은 겹침을 «가리는» 처방이었고,
//     이건 애초에 «겹치지 않게» 하는 처방이다 — 둘 다 둔다.
const CONFETTI = Array.from({ length: 18 }, (_, k) => {
  const wing = k % 2 === 0                      // 좌우 날개에 번갈아
  const t = (k * 11.7) % 26                     // 날개 폭 26% 안에서 결정적으로 분산
  return {
    left: `${(wing ? t : 74 + t).toFixed(1)}%`,
    delay: `${((k * 0.021) % 0.35).toFixed(3)}s`,  // 한 번의 «터짐»으로 읽히는 범위(≤0.35s)
    color: k % 3 ? 'var(--brand-green)' : 'var(--brand-blue)',
  }
})

/** 모형 데이터 — 2차에서 `membership_query` 응답으로 갈아끼운다. 필드 이름을 계약과 같게 둔다. */
const FIXTURES = {
  done:    { masked_name: '이*환', current_stamps: 7, stamp_goal: 10, claims_total: 27,
             rewards_available: 2, months_with_us: 17, member_seq: 42 },
  already: { masked_name: '이*환', current_stamps: 7, stamp_goal: 10, claims_total: 27,
             rewards_available: 2, months_with_us: 17, member_seq: 42 },
  // ★연차 3필드가 null 인 회원이 실측 4명 있다 — «-» 로 채우지 않고 연차 줄을 «생략»한다.
  null:    { masked_name: '박*수', current_stamps: 2, stamp_goal: 10, claims_total: 2,
             rewards_available: null, months_with_us: null, member_seq: null },
}

/**
 * ★«보여주기 전용» 잠금 — 손님이 만져도 아무 일이 없게. CSS 로 못 막는 것만 여기서 막는다.
 *   iOS 12 사파리는 `touch-action` 만으로 **핀치·더블탭 확대를 못 막는다** — 그래서
 *   gesture* 이벤트(웹킷 전용)와 «두 손가락 touchmove»를 직접 막아야 한다.
 *   ★뒤로가기: 히스토리에 한 칸을 밀어 두고 popstate 마다 다시 민다(스와이프해도 제자리).
 */
function useKioskLock() {
  useEffect(() => {
    const stop = (e) => { e.preventDefault() }
    const stopMulti = (e) => { if (e.touches && e.touches.length > 1) e.preventDefault() }
    // passive:false 가 없으면 preventDefault 가 «무시»된다(구형 사파리 포함 기본이 passive 인 경우).
    const opts = { passive: false }
    document.addEventListener('gesturestart', stop, opts)
    document.addEventListener('gesturechange', stop, opts)
    document.addEventListener('gestureend', stop, opts)
    document.addEventListener('touchmove', stopMulti, opts)
    document.addEventListener('dblclick', stop, opts)
    document.addEventListener('contextmenu', stop, opts)
    document.addEventListener('selectstart', stop, opts)

    let armed = false
    try { window.history.pushState(null, '', window.location.href); armed = true } catch { /* 파일 프로토콜 등 */ }
    const onPop = () => { try { window.history.pushState(null, '', window.location.href) } catch { /* noop */ } }
    if (armed) window.addEventListener('popstate', onPop)

    return () => {
      document.removeEventListener('gesturestart', stop, opts)
      document.removeEventListener('gesturechange', stop, opts)
      document.removeEventListener('gestureend', stop, opts)
      document.removeEventListener('touchmove', stopMulti, opts)
      document.removeEventListener('dblclick', stop, opts)
      document.removeEventListener('contextmenu', stop, opts)
      document.removeEventListener('selectstart', stop, opts)
      if (armed) window.removeEventListener('popstate', onPop)
    }
  }, [])
}

/**
 * 전체화면 — ★iOS 12 에서 «가능한 것»과 «불가능한 것»을 가른다(추측 금지).
 *   · 크롬 iOS·사파리 iOS 12 = **Element 전체화면 API 없음**(영상 전용). requestFullscreen 이 없거나 던진다.
 *   · 실제로 상단 바까지 없애는 유일한 길 = **사파리에서 «홈 화면에 추가» → standalone 실행**.
 *   ⇒ 있으면 첫 탭에 시도하고, 없으면 «없다»고 말하는 대신 **가는 길**을 한 줄로 알려 준다.
 */
function useFullscreen() {
  const [needHint, setNeedHint] = useState(false)
  useEffect(() => {
    const standalone = window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    if (standalone) return
    const el = document.documentElement
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen
    if (!req) { setNeedHint(true); return }
    const once = () => {
      try { req.call(el) } catch { setNeedHint(true) }
      document.removeEventListener('touchend', once)
      document.removeEventListener('click', once)
    }
    document.addEventListener('touchend', once)
    document.addEventListener('click', once)
    return () => { document.removeEventListener('touchend', once); document.removeEventListener('click', once) }
  }, [])
  return needHint
}

export default function DisplayView({ store }) {
  const p = new URLSearchParams(window.location.search)
  const mock = p.get('state')                     // ?state= 가 있으면 «모형»(서버·채널 안 붙는다)
  const [live, setLive] = useState(null)          // 실판: 마지막으로 받은 축하 payload
  const [seq, setSeq] = useState(0)               // 축하 회차 — 콘페티 «재생» 키
  const timerRef = useRef(null)
  useKioskLock()
  const needHint = useFullscreen()
  const [hintOff, setHintOff] = useState(false)

  // ★실판 구독 — 키오스크가 claim 성공 직후 쏘는 `cheer`. 같은 매장 private 룸이라
  //   이 패드는 store 계정으로 1회 로그인돼 있어야 한다(안 ㉠).
  useMembershipChannel(mock ? null : store, {
    onCheer: (payload) => {
      if (!payload) return
      setLive(payload)
      // ★회차를 올려 콘페티 DOM 을 갈아끼운다. 1회 애니메이션은 같은 노드에서 «다시 안 터진다» —
      //   키를 바꿔야 새로 마운트되며 재생된다. 이걸 빼면 두 번째 손님부터 조용히 축하가 사라진다.
      setSeq((n) => n + 1)
      if (timerRef.current) clearTimeout(timerRef.current)
      // 연달아 스캔되면 «마지막 손님»으로 갈아타고 타이머도 다시 센다 —
      // 앞사람 화면이 남아 있으면 뒷사람이 자기 것으로 오해한다.
      timerRef.current = setTimeout(() => setLive(null), CHEER_MS)
    },
  })
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const state = mock || (live ? (live.already ? 'already' : 'done') : 'wait')
  const m = mock ? (FIXTURES[mock] || FIXTURES.done) : (live || FIXTURES.done)

  const dots = useMemo(() => {
    const goal = m.stamp_goal || 10   // 실판에서 목표가 안 오면 10 으로 — 칸이 0개면 화면이 빈다
    return Array.from({ length: goal }, (_, i) => i < (m.current_stamps || 0))
  }, [m])

  if (state === 'wait') {
    return (
      <div className="dp">
        <div className="dp-screen">
          <div className="dp-logo dp-logo-hero"><img src={LOGO} alt="사르르 멤버십" /></div>
          {/* ★유저 확정(22:47): 스캔 버튼·펄스 제거 → 일반 «안내» 문구.
              이 화면에서 할 수 있는 동작이 없으므로 «대어 주세요» 같은 지시문도 쓰지 않는다 —
              지시문은 없는 버튼을 찾게 만든다. 어디로 가야 하는지만 알려 준다. */}
          <div className="dp-invite">참여하기<em>(가입하기)</em>는<br />멤버십 키오스크에서 가능합니다</div>
        </div>
        <div className="dp-waves" aria-hidden="true" />
      </div>
    )
  }

  const already = state === 'already'
  return (
    <div className="dp">
      {/* 콘페티는 «완료»에서만 — 이미 참여한 손님에게 축하를 또 던지면 그건 안내가 아니라 소음이다. */}
      {!already && (
        <div className="dp-confetti" key={seq} aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <i key={i} style={{ left: c.left, animationDelay: c.delay, background: c.color }} />
          ))}
        </div>
      )}
      <div className="dp-screen">
        <div className="dp-col-logo"><div className="dp-logo dp-logo-top"><img src={LOGO} alt="사르르 멤버십" /></div></div>
        <div className="dp-col-body">
        <div className="dp-name">{m.masked_name ? `${m.masked_name}님` : '반갑습니다'}</div>
        <div className="dp-msg">{already ? '오늘은 이미 참여하셨습니다' : '오늘도 반갑습니다'}</div>

        <div className="dp-stamps">
          <span className="dp-dots">
            {dots.map((on, i) => <i key={i} className={on ? 'dp-dot on' : 'dp-dot'} />)}
          </span>
          <span className="dp-count">{m.current_stamps ?? 0}<i> / {m.stamp_goal || 10}</i></span>
        </div>

        {already
          ? <div className="dp-note">도장은 하루에 하나씩 모입니다 · 내일 또 뵙겠습니다</div>
          : <Facts m={m} />}
        </div>
      </div>
      <div className="dp-waves" aria-hidden="true" />
      <FsHint show={needHint && !hintOff} onClose={() => setHintOff(true)} />
    </div>
  )
}

/** 전체화면 안내 — ★«안 된다»가 아니라 «이렇게 하면 된다»를 준다. 한 번 닫으면 안 뜬다.
 *  화면 구석에 작게 둔다 — 손님이 보는 화면이라 주인공을 가리면 안 된다. */
function FsHint({ show, onClose }) {
  if (!show) return null
  return (
    <button type="button" className="dp-fshint" onClick={onClose}>
      전체 화면으로 쓰려면 <b>사파리</b>에서 열고 <b>공유 → 홈 화면에 추가</b> · 눌러서 닫기
    </button>
  )
}

/** 보조 줄 — null 처리가 두 갈래다. 헷갈리기 쉬워 한곳에 모아 둔다.
 *  · 연차 3필드 null(실측 4명) → **줄 자체를 생략**한다(«-» 아님).
 *  · 혜택 개수 null(판정불가) → «-». 0 은 «없음»이 아니라 진짜 0 이라 그 절만 지운다. */
function Facts({ m }) {
  const hasYears = m.months_with_us != null && m.member_seq != null
  return (
    <>
      <div className="dp-facts">
        {/* 총계가 안 오면 그 절을 안 그린다 — 0 을 찍으면 «처음 오셨다»는 거짓말이 된다. */}
        {m.claims_total != null && <>모은 도장 {m.claims_total}개</>}
        {/* ★단위는 «숫자가 있을 때만» 붙인다 — «혜택 -개» 는 값을 못 읽었다는 뜻이 아니라 오식으로 읽힌다. */}
        {m.rewards_available == null
          ? <> · 받아두신 혜택 -</>
          : m.rewards_available > 0 && <> · 받아두신 혜택 {m.rewards_available}개</>}
      </div>
      {/* «N개월째» 로 쓰면 +1 이다(months_with_us 는 «완료» 개월 내림 — orch 0022 주석). */}
      {hasYears && <div className="dp-facts">함께한 지 {m.months_with_us + 1}개월째 · {m.member_seq}번째 가족</div>}
    </>
  )
}
