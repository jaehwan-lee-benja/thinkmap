// 직원 노트북 뷰 — 번호 조회(→ 고객 태블릿으로 실시간 푸시) + 회원 리스트(검색) + 팝콘 수령확정.
// ★키오스크 미러링 = **기본 해제**(유저 지시 2026-08-06: 「직원이 고객의 번호를 조회할 때 키오스크
//   화면에 연동될 필요는 없어. 위치가 달라서, 안내할 때는 키오스크쪽과 멀거든」).
//   ⇒ 삭제하지 않고 **URL 옵트인**(`?mirror=1`)으로 남긴다. 근거:
//     ⑴매장 배치는 바뀔 수 있고(가까워지면 다시 쓸 기능), 되살리는 데 **재배포가 필요 없다**.
//     ⑵UI 토글을 두면 직원 화면에 상시 노출돼 **실수로 켜질** 여지가 생긴다 — 기본 해제의 취지가 흐려진다.
//     ⑶코드를 지우면 Realtime 배선(채널·payload 규약)까지 같이 썩는다.
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
  // 미러링 옵트인 여부 — 기본 false.
  const mirror = new URLSearchParams(window.location.search).get('mirror') === '1'
  const { pushMember, pushClear, realtimeOn } = useMembershipChannel(store)

  // 조회된 회원/적립 상태가 바뀌면 고객 태블릿에 푸시(연동).
  useEffect(() => {
    if (mirror && status === 'found' && member) pushMember(member)
  }, [mirror, status, member, pushMember])

  const resetAll = () => { setDigits(''); clear(); if (mirror) pushClear() }

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
        {mirror && realtimeOn && <div className="mk-note">↗ 고객 화면에 표시됨(미러링 ON)</div>}
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
