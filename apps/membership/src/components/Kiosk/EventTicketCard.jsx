// 참여 카드 — 티켓 생애주기 **3상태를 한 몸으로** 그린다.
//
// 유저 지시(2026-08-09): 「발권전, 발권후, 바코드까지 스캔후 완료안내가 **셋트로** 보여야해.
//   지금은 각각 따로 노는 느낌이야. 구조화 리팩토링 점검후 해결해줘」
//
// ── 점검에서 드러난 것(수렴 전 실태) ─────────────────────────────────────────
//   같은 «발권 후» 상태를 그리는 문법이 **다섯 벌**이었다:
//     ⑴ 발권 전      = 큰 버튼 하나(.mk-claim-btn) — 카드 골격이 없다
//     ⑵ 방금 발권    = .mk-ticket + .mk-pick-inline 아코디언(토글 헤더 + 아이콘 2택)
//     ⑶ 재조회       = 같은 .mk-ticket 인데 .mk-pick-acts — **맨 버튼 2개**(아코디언·아이콘 없음)
//     ⑷ 선택 후      = .mk-pick-done — 또 다른 문법(문구 + 맨 버튼)
//     ⑸ 스캔 완료    = .mk-done-wrap + **2택 마크업을 손으로 복사한 판**(aria-hidden) + 오버레이
//   ⇒ ⑵와 ⑶은 **서버 상태가 같다**(오늘 발권된 미스캔 티켓). 갈린 근거는 «이 세션에서 내가 눌렀나»
//     라는 세션 흔적뿐인데, 그게 **시각 문법 전체**를 바꿨다. 그래서 「따로 논다」로 보였다.
//   ⇒ ⑸는 ⑵의 2택 마크업 복사본이다. 한쪽을 고치면 다른 쪽이 낡는다(이번 주 2회 실증한 실패 모드).
//
// ── 수렴 원칙 ────────────────────────────────────────────────────────────────
//   ① **골격은 하나**: 어느 상태든 같은 자리·같은 테두리(.mk-evt-ticket) 안에서 내용만 갈아입는다.
//   ② **2택은 한 벌**: PickRow 하나를 살아있는 상태와 흐린 완료 상태가 **같이 쓴다**(disabled 플래그).
//   ③ **단계가 보인다**: 발권 → 수령 → 완료. 3상태가 «따로 난 화면»이 아니라 한 카드의 진행으로 읽힌다.
//   ④ 세션 흔적은 **문법을 바꾸지 않는다** — 아코디언의 «처음에 펼쳐져 있는지»만 정한다
//      (방금 발권=펼침 / 재조회=접힘). 이건 종전 의도를 지키는 축이다:
//      「조회만 했는데 «어떻게 받으시겠어요?»가 튀어나오지 않게」(2026-08-06 정정).
import { useEffect, useState } from 'react'
import TicketDoneSheet from './TicketDoneSheet'

// ★펼침 화살표는 SVG(문자 ▼ 아님) — 문자 부품은 폰트 폴백으로 크기·기준선이 흔들린다(8/08 ● 사고).
export function Caret({ up }) {
  return (
    <svg className={`mk-caret ${up ? 'is-up' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PaperIcon() {
  return (
    <svg className="mk-pick-ico-svg" viewBox="0 0 48 56" aria-hidden="true">
      <path d="M8 4h32v44l-4-3-4 3-4-3-4 3-4-3-4 3-4-3-4 3z" fill="none" stroke="currentColor"
        strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M15 16h18M15 24h18M15 32h11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

// ★2택 = **이 한 벌만 존재한다.** 흐린 완료 상태도 같은 것을 `dim` 으로 쓴다 —
//   종전엔 완료 화면이 이 마크업의 복사본을 들고 있어서, 2택을 고칠 때마다 한쪽이 낡았다.
function PickRow({ qrUrl, onPaper, onPhone, showPaper, dim }) {
  const Paper = dim ? 'div' : 'button'
  return (
    <div className={`mk-pick-row ${dim ? 'is-dim' : ''}`} aria-hidden={dim ? 'true' : undefined}>
      {showPaper && (
        <Paper
          {...(dim ? { role: 'presentation' } : { type: 'button', onClick: onPaper })}
          className="mk-pick-btn"
        >
          <PaperIcon />
          <span className="mk-pick-label">종이로<br />인쇄하기</span>
          {!dim && <span className="mk-pick-sub">눌러서 인쇄</span>}
        </Paper>
      )}
      {/* ★2026-08-22: 폰 쪽도 «고르는 것»으로 만든다. 종전엔 QR 이 그냥 놓여 있어
          «폰으로 받기»가 선택 «사건»이 아니었고, 그래서 `choice==='phone'`(확대 QR) 분기가
          코드엔 있는데 **닿을 수 없었다**. 손님 쪽에서도 «내가 골랐다»가 없으면
          발권 완료 안내를 띄울 시점이 없다. */}
      <PhonePanel dim={dim} onPick={onPhone}>
        <span className="mk-pick-label">폰으로 받기</span>
        {dim
          ? <div className="mk-pick-qr mk-pick-qr-off" />
          : (qrUrl
            ? <img className="mk-pick-qr" src={qrUrl} alt="참여권 QR" />
            : <span className="mk-pick-sub">QR을 준비하는 중…</span>)}
        {!dim && <span className="mk-pick-sub">눌러서 크게 보기</span>}
      </PhonePanel>
    </div>
  )
}

// 폰 패널 — 살아있을 때만 버튼, 흐린 «완료» 상태에서는 그냥 상자(2택 한 벌 원칙 유지).
function PhonePanel({ dim, onPick, children }) {
  if (dim) return <div className="mk-pick-panel">{children}</div>
  return <button type="button" className="mk-pick-panel" onClick={onPick}>{children}</button>
}

// 단계 표시 — 「발권 → 수령 → 완료」. 장식이 아니라 «지금 어디인가»를 말하는 기능 요소다.
//   건조한 스타일 기준: 선·아이콘 없이 글자와 굵기만으로 현재 단계를 표시한다.
const STEPS = ['발권', '수령', '완료']
function Steps({ at }) {
  return (
    <div className="mk-evt-steps" aria-label={`진행 단계: ${STEPS[at]}`}>
      {STEPS.map((s, i) => (
        <span key={s} className={`mk-evt-step ${i === at ? 'is-now' : ''} ${i < at ? 'is-past' : ''}`}>
          {i > 0 && <span className="mk-evt-step-sep" aria-hidden="true">›</span>}
          {s}
        </span>
      ))}
    </div>
  )
}

/**
 * @param {object}   p.member
 * @param {object?}  p.issuedTicket   오늘 발권된 미스캔 티켓(있으면 «발권 후»)
 * @param {boolean}  p.claimedToday   오늘 회수(스캔) 완료 → «완료»
 * @param {boolean}  p.justClaimed    이 세션에서 방금 발권했는가(펼침 여부만 정한다)
 * @param {string}   p.qrUrl
 * @param {boolean}  p.printable      이 기기에 프린터가 직결돼 있는가(종이 선택지 노출 조건)
 * @param {boolean}  p.pickFlow       손님이 고르는 화면인가(직원 노트북에선 2택을 띄우지 않는다)
 * @param {boolean}  p.claiming
 * @param {Function} p.onClaim
 * @param {Function} p.onPrint        (token, retry) => void
 * @param {string}   p.printMsg
 * @param {string}   p.eventLabel
 */
export default function EventTicketCard({
  issuedTicket, claimedToday, justClaimed, qrUrl, printable, pickFlow,
  claiming, onClaim, onPrint, printMsg, eventLabel, today, onDwell,
}) {
  // ★아코디언 펼침 — 세션 흔적(justClaimed)이 정하는 건 **이것 하나뿐**이다(원칙 ④).
  const [open, setOpen] = useState(!!justClaimed)
  // ★발권 완료 시트(2026-08-22 회원님 지시 ⑷) — «받는 방법을 고른 직후» 뜬다.
  //   여기 두는 이유: «골랐다»는 사건을 아는 건 이 카드뿐이다(상위는 티켓만 안다).
  const [done, setDone] = useState(null)   // null | 'paper' | 'phone'
  // 선택 결과는 아코디언 **안에서** 자리를 바꾼다(별도 문법을 만들지 않는다).
  const [choice, setChoice] = useState(null)

  // ★발권 직후 자동 펼침 — 초기값에만 맡길 수 없다. 발권 순간엔 토큰이 먼저 오고
  //   `justClaimed`(=claimedToken===printToken)는 그 다음 렌더에 붙는다 ⇒ 마운트 시점엔 아직 false 다.
  //   (이 컴포넌트는 토큰별로 key 가 갈려 새 티켓마다 새로 마운트된다 — choice 는 그렇게 초기화된다.)
  useEffect(() => { if (justClaimed) setOpen(true) }, [justClaimed])

  // ★«머무를 국면»을 화면 소유자에게 알린다 — QR 이 떠 있으면 손님이 폰 카메라를 켤 시간이 필요하다.
  //   유휴 복귀 시간을 정하는 건 CustomerView 지만, «지금 QR 국면인가»는 이 상태를 가진 여기만 안다.
  // ★완료 시트가 떠 있는 동안도 «머무는 중»이다(2026-08-22): 읽을 것이 있는 화면이라
  //   기본 15초면 다 읽기 전에 첫 화면으로 간다. ⚠새 타이머를 만들지 않고 **이미 있는 dwell 축**에
  //   한 항을 더할 뿐이다 — 시간을 정하는 곳은 여전히 CustomerView 한 곳이다.
  const dwelling = !!done || (!!issuedTicket && !claimedToday && pickFlow && (choice === 'phone' || (open && !choice)))
  useEffect(() => { if (onDwell) onDwell(dwelling) }, [dwelling, onDwell])

  const step = claimedToday ? 2 : (issuedTicket ? 1 : 0)

  return (
    <div className={`mk-evt-ticket mk-evt-step-${step}`}>
      <Steps at={step} />

      {/* ── 완료(스캔 후) ─────────────────────────────────────────────────────
          흐린 2택을 배경에 남기고 문구를 그 «위에» 겹친다 — «없어진 것»이 아니라 «끝난 것».
          (유저 2026-08-08: 「멘트를 비활성화 이미지 위에 오버랩해서 안내문구처럼」) */}
      {claimedToday ? (
        <div className="mk-done-wrap">
          <div className="mk-pick-inline is-done">
            <PickRow dim showPaper qrUrl="" />
          </div>
          <div className="mk-event-done mk-done-overlay">
            오늘은 이미 이벤트 참여가 완료되었네요!<br />참여 감사합니다 🙏
          </div>
        </div>
      ) : issuedTicket ? (
        /* ── 발권 후(미스캔) ─────────────────────────────────────────────────
           ★상태 어휘(2026-08-06 유저 정정): **발권 ≠ 참여**. 티켓만 만들어진 단계는 «발권»이고,
             «참여»는 카운터 회수·스탬프 확정 후에만 쓴다. */
        <>
          <div className="mk-ticket-head">
            <div className="mk-ticket-title">{justClaimed ? '참여권 발권 완료' : '발권된 참여권이 있어요'}</div>
            <div className="mk-ticket-token">{issuedTicket.token}</div>
            <div className="mk-ticket-hint">
              {justClaimed ? '카운터에서 보여주세요.' : '아직 수령 전이에요 — 카운터에서 보여주세요.'}
              {' · '}유효기간: 오늘({issuedTicket.event_date || today})
            </div>
          </div>

          {/* ★이미 사용된 티켓이면 인쇄 자리에 안내를 둔다(정책: 제한 기준 = «사용(스캔) 여부»). */}
          {issuedTicket.state && issuedTicket.state !== 'issued' && (
            <div className="mk-print-once">이미 사용된 참여권입니다 — 직원에게 문의 바랍니다.</div>
          )}

          {/* ★2택은 «손님이 고르는 화면»에서만. 직원 노트북에서는 티켓 상태만 보여준다.
              (종전엔 직원 화면에도 [폰으로 받기]가 남아 있었는데 showQr 이 꺼져 있어
               누르면 «QR을 준비하는 중…»에서 영구히 멈췄다 — 눌러도 되는 게 없는 버튼이었다.) */}
          {pickFlow && (!issuedTicket.state || issuedTicket.state === 'issued') && (
            <div className="mk-pick-inline">
              {/* 헤더가 토글이다 — 펼치면 ▲, 접으면 ▼(표준 아코디언 어포던스). */}
              <button type="button" className="mk-pick-toggle" aria-expanded={open}
                onClick={() => setOpen((v) => !v)}>
                <span className="mk-pick-q">
                  {choice === 'paper' ? '종이를 가져가세요'
                    : choice === 'phone' ? '폰 카메라로 찍으세요'
                      : '참여권을 어떻게 받으시겠어요?'}
                </span>
                <Caret up={open} />
              </button>

              <div hidden={!open}>
                {/* 아직 안 골랐다 → 2택. 골랐다 → **같은 자리**에 결과. 문법을 바꾸지 않는다. */}
                {!choice ? (
                  <PickRow
                    qrUrl={qrUrl}
                    showPaper={printable}
                    onPaper={() => { setChoice('paper'); onPrint(issuedTicket.token, false); setDone('paper') }}
                    onPhone={() => { setChoice('phone'); setDone('phone') }}
                  />
                ) : choice === 'paper' ? (
                  <div className="mk-pick-result">
                    {printMsg && <div className="mk-ticket-hint">{printMsg}</div>}
                    <div className="mk-pick-acts">
                      {/* ★«다시 인쇄» — 아직 스캔 안 된 티켓이라 같은 바코드를 다시 뽑아도 된다
                          (사용 1회 게이트는 카운터 스캔이 지킨다). 종이가 안 나왔을 때 그 자리에서 해결한다. */}
                      <button type="button" className="mk-reset" onClick={() => onPrint(issuedTicket.token, true)}>다시 인쇄</button>
                      <button type="button" className="mk-reset" onClick={() => setChoice(null)}>다른 방법으로</button>
                    </div>
                  </div>
                ) : (
                  <div className="mk-pick-result">
                    {qrUrl
                      ? <img className="mk-tqr-img mk-tqr-big" src={qrUrl} alt="참여권 QR" />
                      : <div className="mk-ticket-hint">QR을 준비하는 중…</div>}
                    <div className="mk-ticket-hint">찍으면 폰에 바코드가 뜹니다 — 카운터에서 보여주세요</div>
                    <div className="mk-pick-acts">
                      <button type="button" className="mk-reset" onClick={() => setChoice(null)}>다른 방법으로</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── 발권 전 ───────────────────────────────────────────────────────── */
        <>
          <div className="mk-event-todo">오늘은 아직 참여 전이에요.</div>
          <button className="mk-claim-btn" onClick={onClaim} disabled={claiming || !onClaim}>
            <span className="mk-claim-main">
              {claiming ? '발권 중…' : <>사르르 <span className="mk-evt-tag">{eventLabel}</span> 참여</>}
              {/* ★«누르면 아래로 펼쳐진다»를 생김새로 예고한다(유저 2026-08-08). */}
              {!claiming && <Caret />}
            </span>
            {!claiming && <span className="mk-claim-sub">눌러서 참여권 받기</span>}
          </button>
        </>
      )}
      <TicketDoneSheet
        channel={done}
        token={issuedTicket ? issuedTicket.token : ''}
        qrUrl={qrUrl}
        printMsg={printMsg}
        onClose={() => setDone(null)}
      />
    </div>
  )
}
