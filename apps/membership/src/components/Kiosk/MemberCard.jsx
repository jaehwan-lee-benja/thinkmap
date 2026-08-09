// 공용 회원 카드 — 브랜드 히어로(인사말)+본문(이벤트·참여내역·스탬프). 고객뷰·직원뷰 공용.
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { formatClaimPrefix, formatClaimDate, todayStr } from './kioskUtils'
import { printReceipt } from '../../receipt/print'
import { buildTicketUrl } from './ticketLink'
// ★참여 카드(발권 전/후/스캔 완료)는 **한 컴포넌트가 상태만 갈아입는다**(유저 2026-08-09 「셋트로」).
//   골격·2택 마크업·단계 표시가 전부 그 안에 한 벌로 있다 — 이 파일에 흩어져 있던 다섯 문법을 걷어냈다.
import EventTicketCard from './EventTicketCard'

const EVENT_LABEL = '팝콘 이벤트'   // 이벤트명(태그 강조). 이벤트가 늘면 엔티티로 확장.

const STAMP_GOAL = 10               // ★증폭: N회 참여 시 아이스크림(시안, 데이터모델=crm 조율).

// ★재인쇄 정책(2026-08-08 **오전 지시의 정밀화** — 유저: 「바코드를 읽힌 고객이 아니라면 종이 영수증
//   인쇄를 또 할 수 있게」). 제한 기준이 **«인쇄 횟수» → «사용(스캔) 여부»** 로 옮겨졌다.
//
//   · 아직 **스캔 안 된**(state='issued') 티켓 → **재인쇄 허용.** 같은 바코드를 다시 뽑는 것이고
//     «1회 사용» 게이트는 **카운터 스캔 쪽이 지킨다**(회수는 서버에서 1회성).
//   · 이미 **스캔된** 티켓 → 인쇄 자리에 「직원에게 문의 바랍니다」.
//
//   ⇒ 그래서 종전의 **localStorage 인쇄 기록(`mk-printed-tokens`)을 걷어냈다.** 그건 «인쇄했는가»를
//     세던 장치인데, 이제 판단 근거가 **티켓의 서버 상태**다 — 기기 로컬에 둘 이유가 사라졌다.
//     (남아 있는 저장값은 무해하게 방치된다. 읽는 코드가 없다.)
//   ★이 화면은 스캔 여부를 **이미 알고 있었다**: `_todayTickets` 의 `state` 가 그것이고,
//     회수된 티켓은 `today_event_claimed` 로 «참여 완료» 화면으로 갈라진다. 새 조회가 필요 없었다.
export default function MemberCard({ member, history = [], claiming, redeeming, errMsg, onClaim, onRedeem, onReset, resetLabel = '새 조회', variant = 'card', printable = false, showQr = false, pickFlow = false, onDwell }) {
  // ★훅은 조기 return 보다 위에 — member 가 null 이어도 호출 순서가 바뀌면 안 된다(Rules of Hooks).
  const printedRef = useRef(null)          // (예약) 중복 인쇄 방지용 — 자동 인쇄 제거로 현재 미사용
  const [printMsg, setPrintMsg] = useState('')
  // ★모달 트리거 = «이벤트 참여하기» 클릭 유래일 때만(2026-08-06 정정).
  //   종전엔 티켓만 있으면 떴다 → **조회만 했는데** 오늘 이미 발권된 손님에게 모달이 튀어나왔다.
  //   (재방문·재조회 때마다 «어떻게 받으시겠어요?»가 뜨는 건 손님에게 뜬금없다.)
  const pendingClaimRef = useRef(false)      // 클릭했고 아직 티켓이 안 온 상태
  const [claimedToken, setClaimedToken] = useState(null)   // 이 클릭으로 받은 토큰

  const ticketForPrint = member
    ? (member._ticket || (member._todayTickets || []).find((t) => t.channel === 'kiosk' && t.state === 'issued') || null)
    : null
  const printToken = ticketForPrint ? ticketForPrint.token : null

  // ★발권 순서 = «발권 먼저 → 그 다음 모달».
  //   근거: 토큰이 정본이라 **티켓이 실제로 만들어진 뒤에 «어떻게 받을지»를 묻는 게 맞다.**
  //   선택을 먼저 받으면 발권 실패 시 «고른 방법은 있는데 티켓이 없는» 상태가 생기고,
  //   실패 처리도 모달 안에서 다시 해야 한다. 발권 실패 시에는 모달 없이 기존 오류 표시로 떨어진다.
  const handleClaim = async () => {
    if (!onClaim) return
    pendingClaimRef.current = true
    const r = await onClaim()
    if (!r || !r.token) pendingClaimRef.current = false   // 실패 = 모달 없음
    return r
  }

  const doPrint = (tok, retry) => {
    if (!tok || !member) return
    const r = printReceipt({
      name: member.display_name || '',
      date: todayStr(),
      token: tok,
      stamp: member.stamp ? `${member.stamp.current_stamps ?? 0}/${member.stamp.threshold ?? STAMP_GOAL}` : '',
    }, { source: retry ? 'reprint' : 'claim' })   // ★경로 이름을 남긴다 — 신고 재구성의 첫 축
    // ★"인쇄됨"이라 단정하지 않는다 — 스킴 호출은 결과를 알려주지 않는다(print.js 주석).
    setPrintMsg(r.ok
      ? (retry ? '인쇄를 다시 요청했습니다 — 종이를 확인하세요.' : '인쇄를 요청했습니다 — 종이를 확인하세요.')
      : '인쇄를 시작하지 못했습니다. 아래 번호를 카운터에 보여주세요.')
  }

  // ★화면 QR — 발권 토큰이 생기면 손님 폰용 링크를 QR 이미지(data URL)로 만든다.
  //   showQr 인 화면(고객 태블릿)에서만. 실패해도 토큰·인쇄 경로는 그대로라 조용히 넘어간다.
  const [qrUrl, setQrUrl] = useState('')
  useEffect(() => {
    if (!showQr || !printToken) { setQrUrl(''); return }
    let dead = false
    // ★동기 throw 방어(2026-08-04): buildTicketUrl 은 TextEncoder/btoa 를 쓴다. 여기서 던지면
    //   effect 예외가 올라가 **고객 화면 서브트리가 통째로 언마운트**된다(에러 바운더리 없음).
    //   하필 발권 성공 직후에만 터지는 경로라 방어한다 — QR 은 보조 경로이므로 실패해도 조용히 생략.
    let url = null
    try {
      url = buildTicketUrl({
        token: printToken,
        name: member?.display_name || null,
        date: (ticketForPrint && ticketForPrint.event_date) || null,
      })
    } catch (e) { url = null }
    if (!url) return
    QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
      .then((d) => { if (!dead) setQrUrl(d) })
      .catch(() => { if (!dead) setQrUrl('') })
    return () => { dead = true }
  }, [showQr, printToken, member, ticketForPrint])

  // 새 티켓이 뜨면 인쇄 메시지를 비운다(앞 손님의 문구가 남으면 안 된다).
  //   선택 상태는 EventTicketCard 가 **토큰별 key** 로 새로 마운트되며 스스로 초기화한다.
  useEffect(() => {
    setPrintMsg('')
    if (printToken && pendingClaimRef.current) { pendingClaimRef.current = false; setClaimedToken(printToken) }
    if (!printToken) setClaimedToken(null)
  }, [printToken])

  // ★자동 인쇄 **제거**(2026-08-06 유저 확정: 「자동으로 바로 인쇄될 필요는 없어」).
  //   인쇄는 손님이 [종이로 인쇄하기]를 고를 때만 일어난다 — 폰을 고른 손님 몫의 종이가 버려지지 않는다.
  //   ⇒ `printable`(=`?print=local`)의 의미도 «자동 인쇄 트리거»가 아니라
  //     **«이 기기에 프린터가 직결돼 있다 = 종이 선택지를 보여준다»** 로 재정의된다.

  if (!member) return null

  // ★티켓 모델(0018): today_event_claimed = "오늘 회수됨"(스탬프 확정). 발권됨(수령 대기)은 별도 상태.
  const today = todayStr()
  const claimedToday = !!member.today_event_claimed
  // 오늘 kiosk 티켓(발권됨·미회수) — 방금 발권(_ticket) 또는 ticket_today 재표시(_todayTickets).
  const todayList = member._todayTickets || []
  const issuedTicket = member._ticket
    || todayList.find((t) => t.channel === 'kiosk' && t.state === 'issued')
    || null

  // ★스탬프 = crm 실값(0017). current_stamps(0~9)/threshold, rewards_available.
  const stamp = member.stamp || null
  const goal = stamp?.threshold ?? STAMP_GOAL
  const filled = Math.max(0, Math.min(goal, stamp?.current_stamps ?? 0))
  const remain = goal - filled
  const rewardsAvail = stamp?.rewards_available ?? 0

  return (
    /* ★A안(유저가 그림으로 확정, 2026-08-08): **카드 안 아코디언**.
       누른 카드가 아래로 늘어나며 그 안에 선택지가 나타나고, **아래 내용만 밀려 내려간다.**
       나머지 화면(참여내역 등)은 **그대로 둔다** — 직전 판(본문 한 칸 확장 + 참여내역 접기)은
       «재배치»라 의도와 달랐다. 좁은 칸 문제는 **카드 안에서** 세로로 쌓아 푼다(칸을 넓히지 않는다). */
    <div className={`mk-card mk-member-card ${variant === 'hero' ? 'mk-member-card-hero' : ''}`}>
      <div className="mk-member-hero">
        <div className="mk-member-badge-row">
          <span className="mk-member-badge">멤버십 회원</span>
          {/* ★#2 인증 체크 = 텍스트 뒤로(절제 SVG) */}
          <svg className="mk-verified" viewBox="0 0 24 24" aria-label="인증 회원" role="img">
            <circle cx="12" cy="12" r="11" />
            <path d="M6.8 12.5 L10.4 16 L17.2 8.4" />
          </svg>
        </div>
        <div className="mk-greeting">
          {/* ★쉼표 뒤 공백(2026-08-08): 세로 화면에서 `br` 을 숨기면 «안녕하세요,정*아» 로 붙어 버린다.
              공백을 문자로 넣어 두면 줄바꿈이 있든 없든 읽힌다. */}
          안녕하세요,{' '}<br /><b>{member.display_name || '회원'}</b> 회원님!
        </div>
        {variant === 'hero' && (
          <img className="mk-hero-pose" src={`${import.meta.env.BASE_URL}img/cow-pose-welcome-navy.png`} alt="" aria-hidden="true" />
        )}
      </div>

      <div className="mk-member-body">
        <div className="mk-event-section">
          <div className="mk-event-label">멤버십 이벤트</div>
          <EventTicketCard
            key={printToken || 'none'}
            issuedTicket={issuedTicket}
            claimedToday={claimedToday}
            justClaimed={claimedToken === printToken}
            qrUrl={qrUrl}
            printable={printable}
            pickFlow={pickFlow}
            claiming={claiming}
            onClaim={handleClaim}
            onPrint={doPrint}
            printMsg={printMsg}
            eventLabel={EVENT_LABEL}
            today={today}
            onDwell={onDwell}
          />
          {member._justRedeemed && <div className="mk-claimed">아이스크림 수령 완료 🍦🎉</div>}

          {/* ★스탬프 진행(실값) — 아이스크림까지. crm stamp 있을 때만. */}
          {stamp && (
            <div className="mk-stamp mk-evt-card" aria-label={`아이스크림까지 ${remain}회`}>
              {/* ★«아이스크림 이벤트»로 재프레임(2026-08-06): 스탬프 10개 축을 팝콘과 나란한
                  «이벤트 2종»으로 읽히게 한다. 새 발권 API 가 아니라 기존 스탬프 데이터 표시다. */}
              <div className="mk-evt-card-title">아이스크림 이벤트</div>
              <div className="mk-stamp-head">
                <span className="mk-stamp-title">🍦 아이스크림까지</span>
                <span className="mk-stamp-count">{filled}/{goal}</span>
              </div>
              {/* ★S9 종이 도장판 — 찍힌 칸=마스코트 도장(미세 회전으로 손도장 느낌), 마지막 칸=쿵 모션 */}
              <div className="mk-stampcard" aria-hidden="true">
                {Array.from({ length: goal }).map((_, i) => (
                  <span key={i} className={`mk-stamp-cell ${i < filled ? 'is-on' : ''} ${i === filled - 1 && member._justClaimed ? 'is-new' : ''}`}>
                    {i < filled && (
                      <img className="mk-stamp-ink" src={`${import.meta.env.BASE_URL}img/cow-mark-navy.png`} alt="" style={{ transform: `rotate(${((i * 37) % 17) - 8}deg)` }} />
                    )}
                  </span>
                ))}
              </div>
              {rewardsAvail > 0 ? (
                <div className="mk-reward-ready">
                  <span className="mk-reward-msg">🍦 아이스크림 {rewardsAvail}개 수령 가능!</span>
                  {onRedeem && (
                    <button className="mk-reward-btn" onClick={onRedeem} disabled={redeeming}>
                      {redeeming ? '수령 중…' : '수령'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="mk-stamp-msg">{remain}번 더 모으면 아이스크림 🍦</div>
              )}
            </div>
          )}

        </div>

          {/* ★빈 상태도 «칸»을 지킨다(유저 지시 2026-08-08): 타이틀만 두고 아래에 안내.
              2단 레이아웃에서 이 칸이 사라지면 배치가 흔들리기도 한다. */}
          <div className="mk-history-wrap">
            <div className="mk-history-title">참여 내역</div>
            {history.length === 0 ? (
              <div className="mk-history-empty">아직 참여한 이벤트가 없습니다.</div>
            ) : (
              <ul className="mk-history">
                {/* ★내용 좌 · 날짜 우(유저 지시 2026-08-08). 날짜는 자릿수를 채워 폭이 흔들리지 않게 하고
                    tabular-nums 로 열을 맞춘다 — 우측 정렬은 폭이 들쭉날쭉하면 «정렬»로 안 읽힌다. */}
                {history.map((h, i) => (
                  <li key={h.claimed_at || i}>
                    <span className="mk-hist-what"><span className="mk-evt-tag">{EVENT_LABEL}</span> 참여</span>
                    <span className="mk-hist-when">{formatClaimDate(h.claimed_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

        {errMsg && <div className="mk-err">{errMsg}</div>}
        {onReset && <button className="mk-reset" onClick={onReset}>{resetLabel}</button>}
      </div>
    </div>
  )
}
