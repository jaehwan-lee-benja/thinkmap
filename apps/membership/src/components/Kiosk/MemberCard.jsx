// 공용 회원 카드 — 브랜드 히어로(인사말)+본문(이벤트·참여내역·스탬프). 고객뷰·직원뷰 공용.
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { formatClaimPrefix, todayStr } from './kioskUtils'
import { printReceipt } from '../../receipt/print'
import { buildTicketUrl } from './ticketLink'

const EVENT_LABEL = '팝콘 이벤트'   // 이벤트명(태그 강조). 이벤트가 늘면 엔티티로 확장.
const STAMP_GOAL = 10               // ★증폭: N회 참여 시 아이스크림(시안, 데이터모델=crm 조율).

// ★printable = **프린터가 달린 기기에서만 true**(키오스크 단말). 직원 노트북(StaffView)은 false 라
//   rawbt: 스킴이 호출되지 않는다 — 프린터 없는 기기에서 스킴을 던지면 오류 페이지로 튈 수 있다.
export default function MemberCard({ member, history = [], claiming, redeeming, errMsg, onClaim, onRedeem, onReset, resetLabel = '새 조회', variant = 'card', printable = false, showQr = false }) {
  // ★훅은 조기 return 보다 위에 — member 가 null 이어도 호출 순서가 바뀌면 안 된다(Rules of Hooks).
  const printedRef = useRef(null)          // 이미 인쇄를 시도한 토큰(중복 인쇄 방지)
  const [printMsg, setPrintMsg] = useState('')

  const ticketForPrint = member
    ? (member._ticket || (member._todayTickets || []).find((t) => t.channel === 'kiosk' && t.state === 'issued') || null)
    : null
  const printToken = ticketForPrint ? ticketForPrint.token : null

  const doPrint = (tok, retry) => {
    if (!tok || !member) return
    const r = printReceipt({
      name: member.display_name || '',
      date: todayStr(),
      token: tok,
      stamp: member.stamp ? `${member.stamp.current_stamps ?? 0}/${member.stamp.threshold ?? STAMP_GOAL}` : '',
    })
    // ★"인쇄됨"이라 단정하지 않는다 — 스킴 호출은 결과를 알려주지 않는다(print.js 주석).
    setPrintMsg(r.ok
      ? (retry ? '인쇄를 다시 요청했습니다.' : '영수증을 인쇄 중입니다.')
      : '인쇄를 시작하지 못했습니다. 아래 번호를 카운터에 보여주세요.')
  }

  // ★화면 QR — 발권 토큰이 생기면 손님 폰용 링크를 QR 이미지(data URL)로 만든다.
  //   showQr 인 화면(고객 태블릿)에서만. 실패해도 토큰·인쇄 경로는 그대로라 조용히 넘어간다.
  const [qrUrl, setQrUrl] = useState('')
  useEffect(() => {
    if (!showQr || !printToken) { setQrUrl(''); return }
    let dead = false
    const url = buildTicketUrl({
      token: printToken,
      name: member?.display_name || null,
      date: (ticketForPrint && ticketForPrint.event_date) || null,
    })
    if (!url) return
    QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
      .then((d) => { if (!dead) setQrUrl(d) })
      .catch(() => { if (!dead) setQrUrl('') })
    return () => { dead = true }
  }, [showQr, printToken, member, ticketForPrint])

  // 발권된 토큰이 새로 생기면 1회 자동 인쇄(같은 토큰 재렌더로 재인쇄되지 않게 ref 로 잠근다).
  useEffect(() => {
    if (!printable || !printToken) return
    if (printedRef.current === printToken) return
    printedRef.current = printToken
    doPrint(printToken, false)
  }, [printable, printToken])   // eslint-disable-line react-hooks/exhaustive-deps

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
          안녕하세요,<br /><b>{member.display_name || '회원'}</b> 회원님!
        </div>
        {variant === 'hero' && (
          <img className="mk-hero-pose" src={`${import.meta.env.BASE_URL}img/cow-pose-welcome-navy.png`} alt="" aria-hidden="true" />
        )}
      </div>

      <div className="mk-member-body">
        <div className="mk-event-section">
          <div className="mk-event-label">멤버십 이벤트</div>
          {claimedToday ? (
            <div className="mk-event-done">오늘({today}) 참여 완료 ✓</div>
          ) : issuedTicket ? (
            /* 발권됨(수령 대기) — 카운터 회수 시 스탬프 확정. 토큰=수기 입력 검증 경로(인쇄는 현장 확정 대기). */
            <div className="mk-ticket">
              <div className="mk-ticket-title">참여권 발권 완료 — 카운터에서 보여주세요</div>
              <div className="mk-ticket-token">{issuedTicket.token}</div>
              <div className="mk-ticket-hint">유효기간: 오늘({issuedTicket.event_date || today})</div>
              {/* ★화면 QR(유저 채택) — 손님이 폰으로 찍으면 자기 폰에 바코드가 뜬다.
                  종이가 없어도(프린터 미배치·용지 소진) 카운터 스캔이 가능한 무비용 보조 경로. */}
              {qrUrl && (
                <div className="mk-tqr">
                  <img className="mk-tqr-img" src={qrUrl} alt="참여권 QR" />
                  <div className="mk-ticket-hint">폰으로 찍으면 바코드가 폰에 뜹니다</div>
                </div>
              )}
              {/* ★인쇄는 편의, 토큰이 정본 — 안 나와도 위 번호로 카운터 진행 가능. */}
              {printable && (
                <>
                  {printMsg && <div className="mk-ticket-hint">{printMsg}</div>}
                  <button className="mk-reset" onClick={() => doPrint(issuedTicket.token, true)}>영수증 다시 인쇄</button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="mk-event-todo">오늘은 아직 참여 전이에요.</div>
              <button className="mk-claim-btn" onClick={onClaim} disabled={claiming || !onClaim}>
                {claiming ? '발권 중…' : <>사르르 <span className="mk-evt-tag">{EVENT_LABEL}</span> 참여</>}
              </button>
            </>
          )}
          {member._justRedeemed && <div className="mk-claimed">아이스크림 수령 완료 🍦🎉</div>}

          {/* ★스탬프 진행(실값) — 아이스크림까지. crm stamp 있을 때만. */}
          {stamp && (
            <div className="mk-stamp" aria-label={`아이스크림까지 ${remain}회`}>
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

          {history.length > 0 && (
            <div className="mk-history-wrap">
              <div className="mk-history-title">참여 내역</div>
              <ul className="mk-history">
                {history.map((h, i) => (
                  <li key={h.claimed_at || i}>
                    {formatClaimPrefix(h.claimed_at)} <span className="mk-evt-tag">{EVENT_LABEL}</span> 참여
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {errMsg && <div className="mk-err">{errMsg}</div>}
        {onReset && <button className="mk-reset" onClick={onReset}>{resetLabel}</button>}
      </div>
    </div>
  )
}
