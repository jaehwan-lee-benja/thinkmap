// 고객 태블릿 뷰 — 이중 입력경로(유저결정 A):
//   ① 로컬: 고객이 번호패드로 본인 번호 입력·검색 → 본인 인사말/팝콘(태블릿 단독 동작).
//   ② 원격: 직원 기기가 Realtime 으로 "현재 회원" 푸시 → 같은 상태 표시(어르신 대응).
// 프라이버시: 셀프검색=본인 정확번호 정확일치만, 원격=그 1명 최소 PII. 리스트/검색결과 타인 미노출.
import { useState } from 'react'
import NumberPad from './NumberPad'
import MemberCard from './MemberCard'
import CustomerSignupScreen from './CustomerSignupScreen'
import { useMemberLookup } from './useMemberLookup'
import { useMembershipChannel } from './useMembershipChannel'
import { CONTRACT_PENDING } from '../../api/membership'

export default function CustomerView({ store }) {
  const [digits, setDigits] = useState('')
  const [showSignup, setShowSignup] = useState(false)
  const { status, member, history, claiming, redeeming, errMsg, lookup, claim, redeem, clear, setMemberDirect } = useMemberLookup()

  // 원격 푸시(직원 → 고객). 로컬과 같은 currentMember 로 세팅.
  useMembershipChannel(store, {
    onMember: (payload) => { setShowSignup(false); setMemberDirect(payload) },
    onClear: () => clear(),
  })

  const resetAll = () => { setDigits(''); clear() }

  if (showSignup) {
    return <CustomerSignupScreen onDone={() => { setShowSignup(false); resetAll() }} />
  }

  // ★조회 중(로딩): 로고(마스코트)는 정지, 주변 요소로 귀여운 효과(유저정정 2026-07-28) — 펄스 링 + 떠다니는 방울.
  if (status === 'loading') {
    return (
      <div className="mk-screen mk-customer-view mk-loading-screen">
        {/* 로고 위치 고정 + 눈만 깜박(2프레임 교차: 열림↔눈감음, 다크배경=화이트 세트) + 컬러 3점 바운스 */}
        <div className="mk-loading-logo mk-blink">
          <img className="mk-blink-open" src={`${import.meta.env.BASE_URL}img/cow-mark-white.png`} alt="사르르목장" />
          <img className="mk-blink-closed" src={`${import.meta.env.BASE_URL}img/cow-mark-white-blink.png`} alt="" aria-hidden="true" />
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
        <MemberCard
          variant="hero"
          member={member} history={history} claiming={claiming} redeeming={redeeming} errMsg={errMsg}
          onClaim={claim} onRedeem={redeem} onReset={resetAll} resetLabel="처음으로"
        />
      </div>
    )
  }

  return (
    <div className="mk-screen mk-customer-view">
      {/* ★좌우 2분할 + 뷰포트높이 정렬(무스크롤). 좌=멘트+안내, 우=전화번호 입력. */}
      <div className="mk-lookup-split">
        {/* 좌: 사르르 로고 + 멘트 + 가입 안내 (첫 화면=로고만, 앰블럼 미배선 — 유저결정 2026-07-28) */}
        <div className="mk-lookup-left">
          <img className="mk-brand-logo" src={`${import.meta.env.BASE_URL}img/cow-mark-white.png`} alt="사르르목장" />
          <div className="mk-lookup-ment">사르르목장 멤버십<br />이벤트에 참여해보세요!</div>
          {status === 'notfound' ? (
            <div className="mk-card mk-card-none mk-signup-mini">
              <p>아직 멤버십 회원이 아니세요.</p>
              <button className="mk-signup-cta" onClick={() => setShowSignup(true)}>멤버십 가입하기 →</button>
              <button className="mk-reset" onClick={resetAll}>다시</button>
            </div>
          ) : (
            <div className="mk-signup-invite">
              <p className="mk-invite-copy">아직 멤버십 회원이 아니신가요?<br />멤버십에 가입하시면 사르르를 더욱 즐기실 수 있습니다.</p>
              <button className="mk-signup-cta" onClick={() => setShowSignup(true)}>멤버십 가입하기 →</button>
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
          />
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
