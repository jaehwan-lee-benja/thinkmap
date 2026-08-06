// 직원 허브(?role=staff) — ★조회·스캔·리스트를 **한 화면에서** 한다(유저 지시 2026-08-06:
//   「직원 페이지에서 조회, 스캔 등등이 통합으로 되어야해」). 주소 이동 없이 전부 처리하는 게 합격 술어.
//
// ★스캔은 **전역 리스너**(useScanner)로 받는다 — 전용 입력창을 두고 포커스를 잡으면
//   조회 번호패드·회원 검색창과 **포커스를 두고 싸운다**(직원이 타이핑하다 글자를 뺏긴다).
//   스캐너/사람 구분은 **입력 타이밍**으로 한다(자세한 근거는 useScanner.js).
//   회수·인쇄 UI 와 조회/회수 로직은 ScanView 와 **같은 모듈을 공유**한다(복제 금지 — useTicketScan/ScanResultPanel).
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
import { useScanner } from './useScanner'
import { useTicketScan } from './useTicketScan'
import ScanResultPanel from './ScanResultPanel'
import { useMembershipChannel } from './useMembershipChannel'
import { CONTRACT_PENDING } from '../../api/membership'

export default function StaffView({ store }) {
  const [digits, setDigits] = useState('')
  const [showList, setShowList] = useState(false)
  const [printMsg, setPrintMsg] = useState('')
  // 스캔 = 조회와 **별개 상태**로 둔다(하나로 합치면 스캔 결과가 회원 조회 카드를 덮어써 혼선).
  const scanState = useTicketScan()
  // ★리스트 화면에서도 스캔이 먹힌다 — 직원이 어디에 있든 바코드를 쏘면 처리된다.
  useScanner((tok) => { setShowList(false); scanState.doLookup(tok) })
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

  // ★가로 2단(유저 지시 2026-08-06: 「이건 가로로 넓은 화면이니. **스캔이 왼쪽, 지금 데이터가 오른쪽**으로」).
  //   좌 = **조작**(스캔 대기·스캔 결과·회수 · 번호 입력 · 리스트 진입) / 우 = **데이터**(조회 결과).
  //   ▸번호패드를 좌측에 둔 이유: 우측에 «패드+회원카드»를 쌓았더니 노트북 높이(900)에서
  //     **본문이 세로로 밀려 회원카드를 찾아 스크롤해야** 했다(실측). 유저 표현의 «데이터»는
  //     조회 «결과»를 가리키고 번호 입력은 조작이라, 이 배치가 말과 화면 둘 다에 맞는다.
  //   ⚠︎좌측은 «표시 영역»이지 스캔 입력창이 아니다 — 스캔은 여전히 전역 리스너가 받는다(포커스 안 뺏음).
  //   각 단은 **자기 안에서만 스크롤**한다 — 한쪽이 길어져도 반대쪽이 밀리지 않는다.
  return (
    <div className="mk-screen mk-staff">
      <div className="mk-col mk-staff-ops">
        {/* 전용 입력창이 없으니 «지금 스캔이 먹는다»를 화면이 말해줘야 한다. */}
        <div className="mk-scan-ready">🔎 바코드 스캔 대기 중 — 어디서든 스캔하세요</div>
        {scanState.phase !== 'idle' && (
          <div className="mk-staff-scan">
            <div className="mk-scan-title">스캔 결과</div>
            <ScanResultPanel scan={scanState} printMsg={printMsg} setPrintMsg={setPrintMsg} />
            <button className="mk-reset" onClick={scanState.reset}>스캔 결과 닫기</button>
          </div>
        )}
        <NumberPad
          digits={digits}
          onChange={(v) => { setDigits(v); if (status !== 'idle') clear() }}
          onSubmit={() => lookup(digits)}
          submitLabel="조회"
          disabled={status === 'loading'}
        />
        {mirror && realtimeOn && <div className="mk-note">↗ 고객 화면에 표시됨(미러링 ON)</div>}
        <button className="mk-ml-open" onClick={() => setShowList(true)}>회원 리스트 확인하기</button>
      </div>

      <div className="mk-col mk-result mk-staff-data">
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
  )
}
