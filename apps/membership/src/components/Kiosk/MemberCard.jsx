// 공용 회원 카드 — 브랜드 히어로(인사말)+본문(이벤트·참여내역·스탬프). 고객뷰·직원뷰 공용.
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { formatClaimPrefix, formatClaimDate, todayStr } from './kioskUtils'
import { printReceipt } from '../../receipt/print'
import { buildTicketUrl } from './ticketLink'

const EVENT_LABEL = '팝콘 이벤트'   // 이벤트명(태그 강조). 이벤트가 늘면 엔티티로 확장.
const STAMP_GOAL = 10               // ★증폭: N회 참여 시 아이스크림(시안, 데이터모델=crm 조율).

// ★인쇄 1회 정책(유저 지시 2026-08-08: 「한번 인쇄하면 그다음엔 안 되도록, «직원에게 문의바랍니다»」).
//
// 상태를 어디 두는가 — **localStorage(기기 로컬), 토큰 키**로 판단했다. 근거:
//   · 컴포넌트 state 만이면 **새로고침·유휴 복귀에 리셋**된다 = 정책이 사실상 없는 것과 같다.
//   · 서버(원장)에 «인쇄됨»을 두려면 **crm 계약 변경**이 필요하다(신규 필드·Edge) — 게이트가 크고,
//     인쇄는 **그 기기에서 일어나는 물리 사건**이라 원장의 관심사도 아니다.
//   · 인쇄는 **키오스크 한 대**에서만 일어난다 ⇒ 기기 로컬이면 실제 범위와 정확히 일치한다.
// ⇒ 즉 «가장 약한 저장소»가 아니라 **사건이 일어나는 범위와 같은 저장소**를 골랐다.
//
// ★막지 않는 것: 직원 화면(스캔 결과 «영수증 인쇄»)·카운터 폰 인쇄 대기실. 그쪽은 이 문구가
//   가리키는 **목적지**다 — 손님 쪽을 막고 직원 쪽까지 막으면 «직원에게 문의»가 갈 곳이 없어진다.
const PRINTED_KEY = 'mk-printed-tokens'
function readPrinted() {
  try { const v = JSON.parse(localStorage.getItem(PRINTED_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch (e) { return [] }
}
function isPrinted(token) { return !!token && readPrinted().indexOf(token) >= 0 }
function markPrinted(token) {
  if (!token) return
  try {
    const list = readPrinted()
    if (list.indexOf(token) >= 0) return
    list.push(token)
    // 무한히 쌓이지 않게 최근 것만 남긴다(토큰은 당일용이라 오래된 건 의미가 없다).
    localStorage.setItem(PRINTED_KEY, JSON.stringify(list.slice(-300)))
  } catch (e) { /* 저장 불가 환경 — 정책만 약해지고 인쇄는 정상 동작 */ }
}

// ★printable = **프린터가 달린 기기에서만 true**(키오스크 단말). 직원 노트북(StaffView)은 false 라
//   rawbt: 스킴이 호출되지 않는다 — 프린터 없는 기기에서 스킴을 던지면 오류 페이지로 튈 수 있다.
export default function MemberCard({ member, history = [], claiming, redeeming, errMsg, onClaim, onRedeem, onReset, resetLabel = '새 조회', variant = 'card', printable = false, showQr = false, pickFlow = false, onDwell }) {
  // ★훅은 조기 return 보다 위에 — member 가 null 이어도 호출 순서가 바뀌면 안 된다(Rules of Hooks).
  const printedRef = useRef(null)          // (예약) 중복 인쇄 방지용 — 자동 인쇄 제거로 현재 미사용
  const [printMsg, setPrintMsg] = useState('')
  // ★발권 후 «2택» 상태(2026-08-06 유저 지시): null=아직 안 고름 | 'paper' | 'phone'
  const [choice, setChoice] = useState(null)
  // ★모달 트리거 = «이벤트 참여하기» 클릭 유래일 때만(2026-08-06 정정).
  //   종전엔 티켓만 있으면 떴다 → **조회만 했는데** 오늘 이미 발권된 손님에게 모달이 튀어나왔다.
  //   (재방문·재조회 때마다 «어떻게 받으시겠어요?»가 뜨는 건 손님에게 뜬금없다.)
  const pendingClaimRef = useRef(false)      // 클릭했고 아직 티켓이 안 온 상태
  const [claimedToken, setClaimedToken] = useState(null)   // 이 클릭으로 받은 토큰
  const [printedTok, setPrintedTok] = useState(null)       // 이 화면에서 «인쇄됨»으로 확정된 토큰

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
    // ★1회 제한 — 이미 인쇄된 토큰이면 재발행하지 않는다(정책 근거는 파일 상단 주석).
    if (isPrinted(tok)) { setPrintedTok(tok); setPrintMsg(''); return }
    const r = printReceipt({
      name: member.display_name || '',
      date: todayStr(),
      token: tok,
      stamp: member.stamp ? `${member.stamp.current_stamps ?? 0}/${member.stamp.threshold ?? STAMP_GOAL}` : '',
    })
    // ★"인쇄됨"이라 단정하지 않는다 — 스킴 호출은 결과를 알려주지 않는다(print.js 주석).
    if (r.ok) markPrinted(tok)
    setPrintedTok(r.ok ? tok : null)
    setPrintMsg(r.ok
      ? '인쇄를 요청했습니다 — 종이를 확인하세요.'
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

  // ★«머무를 국면»을 상위에 알린다 — QR 이 떠 있으면 손님이 폰 카메라를 켤 시간이 필요하다.
  //   유휴 복귀 시간을 정하는 건 화면 소유자(CustomerView)지만, «지금 QR 국면인가»는 여기만 안다.
  const pickOpen = pickFlow && claimedToken === printToken && !choice && !!printToken
  const dwelling = !!printToken && (choice === 'phone' || pickOpen)
  useEffect(() => { if (onDwell) onDwell(dwelling) }, [dwelling, onDwell])

  // 새 티켓이 뜨면 선택을 초기화한다(앞 손님의 선택이 남으면 안 된다).
  useEffect(() => {
    setChoice(null); setPrintMsg('')
    setPrintedTok(printToken && isPrinted(printToken) ? printToken : null)
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
          {claimedToday ? (
            <div className="mk-event-done">오늘({today}) 참여 완료 ✓</div>
          ) : issuedTicket ? (
            /* 발권됨(수령 대기) — 카운터 회수 시 스탬프 확정. 토큰=수기 입력 검증 경로(인쇄는 현장 확정 대기). */
            <div className="mk-ticket">
              <div className="mk-ticket-title">
                {/* ★상태 어휘(2026-08-06 유저 정정): **발권 ≠ 참여**.
                    티켓만 만들어진 단계는 «발권»이고, «참여»는 카운터 회수·스탬프 확정 후에만 쓴다.
                    (내가 «이미 참여하셨어요»라고 썼던 건 발권을 참여로 올려 부른 오표기였다.) */}
                {claimedToken === printToken ? '참여권 발권 완료' : '발권된 참여권이 있어요'}
              </div>
              <div className="mk-ticket-token">{issuedTicket.token}</div>
              {claimedToken !== printToken && <div className="mk-ticket-hint">아직 수령 전이에요 — 카운터에서 보여주세요.</div>}
              <div className="mk-ticket-hint">유효기간: 오늘({issuedTicket.event_date || today})</div>

              {/* ★2택 경험(2026-08-06 유저 지시): 손님이 «종이 / 폰» 중 하나를 자기 손으로 고른다.
                  종전엔 자동 인쇄 + QR 상시노출이라 «뭘 해야 하는지» 화면이 말해주지 않았다.
                  토큰은 어느 쪽을 골라도 위에 계속 보인다(정본은 토큰). */}
              {/* ★모달/오버레이(유저 확정 2026-08-06: 「모달처럼 나오게 — 페이지 전환 느낌이 아니라」).
                  뒤에 발권 완료 맥락(회원 카드)이 그대로 남아 보인다. 라우팅·화면 교체 없음. */}
              {/* ★pickFlow = «손님이 고르는 화면인가»(2026-08-06 수정). 종전엔 무조건 떠서
                  **직원 노트북에서 발권해도 손님용 2택 모달이 떴고**, 오버레이가 직원 화면 전체를
                  가려 회수·리스트를 못 눌렀다. 게다가 [종이로 인쇄]는 printable 게이트 밖이라
                  **프린터 없는 직원 기기에서 rawbt 스킴을 쏠** 수 있었다(이 파일 상단 경고와 모순). */}
              {/* ★«그 자리 토글 펼침»(유저 지시 2026-08-08: 「참여하기를 누르면 그 위치에서 토글이
                  내려가듯 하위 요소가 열리게. 지금처럼 모달방식이 아니라」).
                  ⇒ 오버레이·시트를 걷고 **티켓 블록 안에서 아래로 펼친다**. 뒤 화면을 덮지 않으니
                  손님이 «어디를 눌렀고 무엇이 열렸는지»를 위치로 안다. 2택 비대칭(폰=QR 즉시·종이=버튼)은 유지. */}
              {pickFlow && claimedToken === printToken && !choice && (
                <div className="mk-pick-inline" role="group" aria-label="참여권 받는 방법 선택">
                  <div className="mk-pick-q">참여권을 어떻게 받으시겠어요?</div>
                  <div className="mk-pick-row">
                    {/* 종이 = 버튼. ★이미 인쇄한 토큰이면 누를 수 없다(1회 정책) — 버튼 자리에 안내를 둔다. */}
                    <button type="button" className="mk-pick-btn" disabled={printedTok === issuedTicket.token}
                      onClick={() => { setChoice('paper'); doPrint(issuedTicket.token, false) }}>
                      <svg className="mk-pick-ico-svg" viewBox="0 0 48 56" aria-hidden="true">
                        <path
                          d="M8 4h32v44l-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3z"
                          fill="none" stroke="currentColor" strokeWidth="2.6"
                          strokeLinejoin="round" strokeLinecap="round"
                        />
                        <path d="M15 16h18M15 24h18M15 32h11" fill="none" stroke="currentColor"
                          strokeWidth="2.6" strokeLinecap="round" />
                      </svg>
                      <span className="mk-pick-label">종이로<br />인쇄하기</span>
                      <span className="mk-pick-sub">눌러서 인쇄</span>
                    </button>
                    {/* 폰 = 완결된 콘텐츠(뎁스 0) — 버튼이 아니라 패널이다 */}
                    <div className="mk-pick-panel">
                      <span className="mk-pick-label">폰으로 받기</span>
                      {qrUrl
                        ? <img className="mk-pick-qr" src={qrUrl} alt="참여권 QR" />
                        : <span className="mk-pick-sub">QR을 준비하는 중…</span>}
                      <span className="mk-pick-sub">폰 카메라로 찍으세요</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 조회로 드러난 «오늘 이미 발권된» 티켓 — 모달을 띄우지 않고 조용한 인라인 액션만.
                  손님이 다시 조회했을 뿐인데 선택 모달이 튀어나오지 않게 한다. */}
              {claimedToken !== printToken && !choice && (
                <div className="mk-pick-acts">
                  {printable && (isPrinted(issuedTicket.token)
                    ? <span className="mk-print-once">이미 인쇄했습니다 — 직원에게 문의 바랍니다.</span>
                    : <button type="button" className="mk-reset" onClick={() => { setChoice('paper'); doPrint(issuedTicket.token, false) }}>종이로 인쇄</button>)}
                  <button type="button" className="mk-reset" onClick={() => setChoice('phone')}>폰으로 받기</button>
                </div>
              )}

              {choice === 'paper' && (
                <div className="mk-pick-done">
                  <div className="mk-pick-done-msg">종이를 가져가세요</div>
                  {printMsg && <div className="mk-ticket-hint">{printMsg}</div>}
                  {/* ★«다시 인쇄»를 없앴다(1회 정책). 종이가 안 나왔을 때의 출구는 **사람**이다 —
                      직원 화면에서 같은 토큰으로 인쇄할 수 있으므로 손님은 카운터로 보낸다. */}
                  <div className="mk-print-once">직원에게 문의 바랍니다.</div>
                  <div className="mk-pick-acts">
                    <button type="button" className="mk-reset" onClick={() => setChoice('phone')}>폰으로 받기</button>
                  </div>
                </div>
              )}

              {choice === 'phone' && (
                <div className="mk-pick-done">
                  {qrUrl
                    ? <img className="mk-tqr-img mk-tqr-big" src={qrUrl} alt="참여권 QR" />
                    : <div className="mk-ticket-hint">QR을 준비하는 중…</div>}
                  <div className="mk-pick-done-msg">폰 카메라로 찍으세요</div>
                  <div className="mk-ticket-hint">찍으면 폰에 바코드가 뜹니다 — 카운터에서 보여주세요</div>
                  <div className="mk-pick-acts">
                    <button type="button" className="mk-reset" onClick={() => { setChoice('paper'); doPrint(issuedTicket.token, false) }}>종이로 받기</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mk-event-todo">오늘은 아직 참여 전이에요.</div>
              {/* ★버튼 문법 통일(2026-08-06): 테두리·그림자·즉시 눌림 + 보조문구로 «무엇이 일어나는지» 명시.
                  2택 모달의 종이 버튼·가입 버튼과 같은 축이라 키오스크 전체에서 «버튼처럼 생긴 것=눌리는 것». */}
              <button className="mk-claim-btn" onClick={handleClaim} disabled={claiming || !onClaim}>
                <span className="mk-claim-main">
                  {claiming ? '발권 중…' : <>사르르 <span className="mk-evt-tag">{EVENT_LABEL}</span> 참여</>}
                </span>
                {!claiming && <span className="mk-claim-sub">눌러서 참여권 받기</span>}
              </button>
            </>
          )}
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
