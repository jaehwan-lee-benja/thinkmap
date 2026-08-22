// 발권 완료 시트 — 2026-08-22(회원님 지시 ⑷).
//
// ★무엇을 «완료»라고 말하는가: **발권 + 받는 방법 선택**까지다. ⚠«종이가 실제로 나왔다»가 아니다 —
//   인쇄는 fire-and-forget 이라 원리적으로 결과를 모른다(RECEIPT-PRINT-SPEC §3). 그래서 문구는
//   «발권이 되었다»까지만 단정하고, **물리 전달 실패는 «사람 경로»로 덮는다**(아래 안전망 줄).
// ★어휘 정본: **발권 ≠ 참여**(2026-08-06 회원님 정정). 여기서 «참여권»은 물건 이름이고,
//   «참여»가 끝나는 건 카운터 회수 뒤다 — 그래서 「직원에게 보여주세요」로 다음 행동을 가리킨다.
// ★자동 복귀 타이머를 **여기서 만들지 않는다**(orch 지시): 결과 화면의 `IdleReset` 이 이미 그 일을 하고,
//   남은 초·[처음으로] 막대도 그쪽이 그린다. 타이머가 둘이면 반드시 한쪽이 낡는다.
//   이 시트의 [처음 페이지로 가기]는 **그 막대와 같은 이벤트**를 쏜다(경로 1개).
import { IDLE_RESET_EVENT } from './IdleReset'

function fireHome() {
  try { window.dispatchEvent(new Event(IDLE_RESET_EVENT)) } catch (e) {
    const ev = document.createEvent('Event'); ev.initEvent(IDLE_RESET_EVENT, false, false)
    window.dispatchEvent(ev)
  }
}

export default function TicketDoneSheet({ channel, token, qrUrl, printMsg, onClose }) {
  if (!channel) return null
  const isPhone = channel === 'phone'
  return (
    <div className="mk-pick-overlay mk-done-sheet-ov" role="dialog" aria-modal="true" aria-label="발권 완료">
      <div className="mk-pick mk-done-sheet">
        <img className="mk-done-cow" src={`${import.meta.env.BASE_URL}img/cow-pose-welcome-navy.png`} alt="" aria-hidden="true" />
        <div className="mk-done-title">발권이 잘 되었어요!</div>
        <div className="mk-done-sub">
          카운터 직원에게 <b>참여권</b>을 보여주세요.
        </div>

        {/* 폰으로 받는 손님은 **이 시트 안에서** 바로 찍는다 — 시트가 QR 을 가리면 안 되기 때문이다. */}
        {isPhone && (
          qrUrl
            ? <img className="mk-tqr-img mk-tqr-big" src={qrUrl} alt="참여권 QR" />
            : <div className="mk-ticket-hint">QR을 준비하는 중…</div>
        )}
        {!isPhone && printMsg && <div className="mk-ticket-hint">{printMsg}</div>}
        {token && <div className="mk-done-token">{token}</div>}

        {/* ★안전망 — «감지할 수 없는 실패»(종이 안 나옴·QR 안 읽힘)를 사람 경로로 덮는다.
            발권은 이미 서버에 남아 있으므로, 물건이 없어도 직원이 확인해 줄 수 있다. */}
        <div className="mk-done-safety">
          종이가 안 나왔거나 화면이 잘 안 읽히면, 카운터에서 <b>성함</b>을 말씀해 주세요 —
          <b> 발권은 이미 되어 있어요.</b>
        </div>

        <div className="mk-done-acts">
          <button type="button" className="mk-done-home" onClick={fireHome}>처음 페이지로 가기</button>
          <button type="button" className="mk-reset" onClick={onClose}>{isPhone ? '닫기' : '참여권 다시 보기'}</button>
        </div>
      </div>
    </div>
  )
}
