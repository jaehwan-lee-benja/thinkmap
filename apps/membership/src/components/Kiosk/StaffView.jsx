// 직원 노트북 뷰 — 번호 조회(→ 고객 태블릿으로 실시간 푸시) + 회원 리스트(검색) + 팝콘 수령확정.
// 조회 성공/적립 시 useMembershipChannel.pushMember 로 고객 태블릿에 "현재 회원" 브로드캐스트(유저결정 A).
import { useState, useEffect } from 'react'
import NumberPad from './NumberPad'
import MemberCard from './MemberCard'
import MemberListScreen from './MemberListScreen'
import { useMemberLookup } from './useMemberLookup'
import { useMembershipChannel } from './useMembershipChannel'
import { CONTRACT_PENDING } from '../../api/membership'

export default function StaffView({ store }) {
  const [digits, setDigits] = useState('')
  const [showList, setShowList] = useState(false)
  const { status, member, history, claiming, redeeming, errMsg, lookup, claim, redeem, clear } = useMemberLookup()
  const { pushMember, pushClear, realtimeOn } = useMembershipChannel(store)

  // 조회된 회원/적립 상태가 바뀌면 고객 태블릿에 푸시(연동).
  useEffect(() => {
    if (status === 'found' && member) pushMember(member)
  }, [status, member, pushMember])

  const resetAll = () => { setDigits(''); clear(); pushClear() }

  if (showList) return <MemberListScreen onBack={() => setShowList(false)} />

  return (
    <>
    <div className="mk-staff-bar">
      <button className="mk-ml-open" onClick={() => setShowList(true)}>회원 리스트 확인하기</button>
    </div>
    <div className="mk-screen mk-staff">
      <div className="mk-col">
        <NumberPad
          digits={digits}
          onChange={(v) => { setDigits(v); if (status !== 'idle') clear() }}
          onSubmit={() => lookup(digits)}
          submitLabel="조회"
          disabled={status === 'loading'}
        />
        {realtimeOn && status === 'found' && (
          <div className="mk-note">↗ 고객 화면에 표시됨</div>
        )}
      </div>

      <div className="mk-col mk-result">
        {CONTRACT_PENDING && status === 'idle' && (
          <div className="mk-note">※ CRM 데이터 연결 대기 — 배포 후 활성화(미리보기).</div>
        )}
        {status === 'idle' && <div className="mk-placeholder">번호를 입력하고 조회하세요.</div>}
        {status === 'loading' && <div className="mk-placeholder">조회 중…</div>}

        {status === 'found' && member && (
          <MemberCard
            member={member} history={history} claiming={claiming} redeeming={redeeming} errMsg={errMsg}
            onClaim={claim} onRedeem={redeem} onReset={resetAll} resetLabel="새 조회"
          />
        )}
        {status === 'notfound' && (
          <div className="mk-card mk-card-none">
            <div className="mk-badge mk-badge-none">회원 아님</div>
            <p>가입되어 있지 않습니다.</p>
            <button className="mk-reset" onClick={resetAll}>새 조회</button>
          </div>
        )}
        {status === 'error' && (
          <div className="mk-card mk-card-err"><p className="mk-err">{errMsg}</p>
            <button className="mk-reset" onClick={resetAll}>다시</button></div>
        )}
      </div>
    </div>
    </>
  )
}
