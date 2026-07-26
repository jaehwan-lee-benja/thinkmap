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
  const { status, member, history, claiming, errMsg, lookup, claim, clear, setMemberDirect } = useMemberLookup()

  // 원격 푸시(직원 → 고객). 로컬과 같은 currentMember 로 세팅.
  useMembershipChannel(store, {
    onMember: (payload) => { setShowSignup(false); setMemberDirect(payload) },
    onClear: () => clear(),
  })

  const resetAll = () => { setDigits(''); clear() }

  if (showSignup) {
    return <CustomerSignupScreen onDone={() => { setShowSignup(false); resetAll() }} />
  }

  return (
    <div className="mk-screen mk-customer-view">
      {status === 'found' && member ? (
        <MemberCard
          member={member} history={history} claiming={claiming} errMsg={errMsg}
          onClaim={claim} onReset={resetAll} resetLabel="처음으로"
        />
      ) : (
        <div className="mk-customer-lookup">
          <div className="mk-signup-head">
            <h2>멤버십 조회</h2>
            <p>전화번호를 입력하시면 멤버십 정보와 이벤트를 확인할 수 있어요.</p>
          </div>

          {/* ★번호패드가 주인공(대형). 가입 진입은 작게(약 9:1, 유저결정 2026-07-26). */}
          <div className="mk-lookup-main">
            <NumberPad
              digits={digits}
              onChange={(v) => { setDigits(v); if (status !== 'idle') clear() }}
              onSubmit={() => lookup(digits)}
              submitLabel="조회"
              disabled={status === 'loading'}
              size="xl"
            />
            {CONTRACT_PENDING && <div className="mk-note">※ CRM 데이터 연결 대기 — 배포 후 활성화(미리보기).</div>}
            {status === 'loading' && <div className="mk-placeholder">조회 중…</div>}
            {status === 'error' && (
              <div className="mk-card mk-card-err"><p className="mk-err">{errMsg}</p>
                <button className="mk-reset" onClick={resetAll}>다시</button></div>
            )}
          </div>

          {/* 가입 진입점(작게) */}
          {status === 'notfound' ? (
            <div className="mk-card mk-card-none mk-signup-mini">
              <p>아직 멤버십 회원이 아니세요.</p>
              <button className="mk-signup-cta" onClick={() => setShowSignup(true)}>멤버십 가입하기 →</button>
              <button className="mk-reset" onClick={resetAll}>다시</button>
            </div>
          ) : (
            <button className="mk-signup-link" onClick={() => setShowSignup(true)}>
              처음이세요? <b>멤버십 가입하기 →</b>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
