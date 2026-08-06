// 고객 태블릿 뷰 — 이중 입력경로(유저결정 A):
//   ① 로컬: 고객이 번호패드로 본인 번호 입력·검색 → 본인 인사말/팝콘(태블릿 단독 동작).
//   ② 원격: 직원 기기가 Realtime 으로 "현재 회원" 푸시 → 같은 상태 표시(어르신 대응).
// 프라이버시: 셀프검색=본인 정확번호 정확일치만, 원격=그 1명 최소 PII. 리스트/검색결과 타인 미노출.
import { useState, useEffect } from 'react'
import NumberPad from './NumberPad'
import MemberCard from './MemberCard'
import CustomerSignupScreen from './CustomerSignupScreen'
import IdleReset, { IDLE_RESET_EVENT } from './IdleReset'
import { useMemberLookup } from './useMemberLookup'
import { useMembershipChannel } from './useMembershipChannel'
import { CONTRACT_PENDING } from '../../api/membership'

// ★전화번호 프리필(2026-08-06 유저 지시 «010은 기본적으로 적혀있도록»).
//   ⚠︎010 을 **고정(잠금)하지 않는다** — 011/016/017/018/019 도 유효 번호라(검증 정규식 `^01[016789]`)
//   잠그면 그 손님들이 입력할 방법이 없어진다. ⇒ 프리필은 하되 **백스페이스로 지울 수 있게** 둔다.
//   [전체지움]은 빈칸이 아니라 010 으로 되돌린다(그래야 프리필이 실효).
const PHONE_PREFILL = '010'

export default function CustomerView({ store }) {
  const [digits, setDigits] = useState(PHONE_PREFILL)
  const [showSignup, setShowSignup] = useState(false)
  const { status, member, history, claiming, redeeming, errMsg, lookup, claim, redeem, clear, setMemberDirect } = useMemberLookup()

  // 원격 푸시(직원 → 고객). 로컬과 같은 currentMember 로 세팅.
  const { pushTicket } = useMembershipChannel(store, {
    onMember: (payload) => { setShowSignup(false); setMemberDirect(payload) },
    onClear: () => clear(),
  })

  // ★인쇄 브리지(2026-08-03): 키오스크엔 쓸 수 있는 프린터가 없다(Play 프로텍트로 RawBT 라이선스 불가,
  //   KICC 내장 경로 종결) → 발권하면 **카운터 폰(?role=printer)** 으로 인쇄를 넘긴다.
  //   키오스크에 외장 프린터를 다는 구성이 되면 `?print=local` 로 로컬 인쇄를 켤 수 있다(경로 보존).
  const localPrint = new URLSearchParams(window.location.search).get('print') === 'local'
  const claimAndPrint = async () => {
    const r = await claim()
    if (r && r.token) {
      pushTicket({
        token: r.token,
        name: member?.display_name || null,
        date: r.event_date || null,
        stamp: member?.stamp ? `${member.stamp.current_stamps ?? 0}/${member.stamp.threshold ?? 10}` : null,
      })
    }
    return r
  }

  const resetAll = () => { setDigits(PHONE_PREFILL); clear() }

  // ★«홈»의 정의: 가입폼 아님 + 조회 전 + 입력이 프리필뿐.
  //   ⚠︎프리필(`010`)은 **손님이 누른 게 아니다** — 그래서 «입력 있음»으로 치지 않는다.
  //   홈에서는 되돌릴 상태가 없으므로 카운트다운을 띄우지 않는다(무장 자체를 안 한다).
  const isHome = !showSignup && status === 'idle' && digits === PHONE_PREFILL

  // 무조작 자동 복귀(IdleReset 이벤트) → 첫 화면(조회결과·가입폼·입력 전부 리셋).
  useEffect(() => {
    const onIdle = () => { setShowSignup(false); setDigits(PHONE_PREFILL); clear() }
    window.addEventListener(IDLE_RESET_EVENT, onIdle)
    return () => window.removeEventListener(IDLE_RESET_EVENT, onIdle)
  }, [clear])

  if (showSignup) {
    return (<>
      <IdleReset enabled armed />
      <CustomerSignupScreen onDone={() => { setShowSignup(false); resetAll() }} />
    </>)
  }

  // ★조회 중(로딩): 로고(마스코트)는 정지, 주변 요소로 귀여운 효과(유저정정 2026-07-28) — 펄스 링 + 떠다니는 방울.
  if (status === 'loading') {
    return (
      <div className="mk-screen mk-customer-view mk-loading-screen">
        {/* 로고 위치 고정 + 눈만 깜박(2프레임 교차: 열림↔눈감음, 다크배경=화이트 세트) + 컬러 3점 바운스 */}
        <div className="mk-loading-logo mk-blink">
          <img className="mk-blink-open" src={`${import.meta.env.BASE_URL}img/cow-mark-navy.png`} alt="사르르목장" />
          <img className="mk-blink-closed" src={`${import.meta.env.BASE_URL}img/cow-mark-navy-blink.png`} alt="" aria-hidden="true" />
        </div>
        <div className="mk-loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>
        <div className="mk-loading-text">조회 중</div>
      </div>
    )
  }

  // ★조회 결과 = 전체화면 가득·큰 글씨(#4).
  if (status === 'found' && member) {
    return (
      <div className="mk-screen mk-customer-view mk-result-view">
        <IdleReset enabled armed />
        <MemberCard
          variant="hero"
          printable={localPrint}   /* 기본 false — 인쇄는 카운터 폰이 맡는다(위 주석). 외장 프린터 달면 ?print=local */
          showQr                   /* ★손님 폰으로 옮겨갈 QR(유저 채택) — 고객 화면에서만 */
          member={member} history={history} claiming={claiming} redeeming={redeeming} errMsg={errMsg}
          onClaim={claimAndPrint} onReset={resetAll} resetLabel="처음으로"
          /* ★onRedeem 을 넘기지 않는다(2026-08-04): 리워드 «수령» 은 되돌리는 API 가 없는 확정 행위인데
             고객 태블릿에 버튼이 그대로 노출돼 손님이 스스로 아이스크림을 소진할 수 있었다.
             리워드 확정은 **직원 화면 전용**이다. */
        />
      </div>
    )
  }

  return (
    <div className="mk-screen mk-customer-view">
      <IdleReset enabled armed={!isHome} />
      {/* ★좌우 2분할 + 뷰포트높이 정렬(무스크롤). 좌=멘트+안내, 우=전화번호 입력. */}
      <div className="mk-lookup-split">
        {/* 좌: 사르르 로고 + 멘트 + 가입 안내 (첫 화면=로고만, 앰블럼 미배선 — 유저결정 2026-07-28) */}
        <div className="mk-lookup-left">
          <img className="mk-brand-logo" src={`${import.meta.env.BASE_URL}img/cow-mark-navy.png`} alt="사르르목장" />
          <div className="mk-lookup-ment">사르르목장 멤버십<br />이벤트에 참여해보세요!</div>
          {status === 'notfound' && (
            <div className="mk-card mk-card-none mk-signup-mini">
              <p>아직 멤버십 회원이 아니세요.</p>
              <button className="mk-reset" onClick={resetAll}>다시</button>
            </div>
          )}
        </div>

        {/* 우: 전화번호 입력(번호패드/조회) */}
        <div className="mk-lookup-right">
          <NumberPad
            digits={digits}
            onChange={(v) => { setDigits(v); if (status !== 'idle') clear() }}
            onSubmit={() => lookup(digits)}
            submitLabel="조회"
            size="xl"
            clearTo={PHONE_PREFILL}
          />
          {/* ★가입 안내 = 조회 버튼 «아래»(유저 지시 2026-08-06): 주 과업은 조회, 가입은 그 다음이라는 위계.
              어포던스 = 타원 텍스트링크 → **명백한 버튼**(테두리·그림자·즉시 눌림). 어르신 기준이라
              «누르는 것»이 형태로 읽혀야 한다 — 2택 모달의 버튼 문법과 통일한다. */}
          <div className="mk-signup-below">
            <p className="mk-invite-copy">
              아직 멤버십 회원이 아니신가요?
              {/* ★유저 지정 문구 그대로(2026-08-06). 보이스 기준(§5.0) 정합 확인:
                  «즐길 수 있습니다» = 혜택·수치 나열이 아니라 **경험 소구**라 미끼 금지 원칙에 걸리지 않는다. */}
              <br />멤버십을 가입하면 사르르를 더욱 즐길 수 있습니다.
            </p>
            <button type="button" className="mk-signup-btn" onClick={() => setShowSignup(true)}>
              <span className="mk-signup-btn-label">멤버십 가입하기</span>
              <span className="mk-signup-btn-sub">눌러서 가입</span>
            </button>
          </div>
          {CONTRACT_PENDING && <div className="mk-note">※ CRM 데이터 연결 대기 — 배포 후 활성화(미리보기).</div>}
          {status === 'error' && (
            <div className="mk-card mk-card-err"><p className="mk-err">{errMsg}</p>
              <button className="mk-reset" onClick={resetAll}>다시</button></div>
          )}
        </div>
      </div>
    </div>
  )
}
