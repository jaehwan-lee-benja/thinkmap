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
import { CONTRACT_PENDING, PREVIEW } from '../../api/membership'

export default function StaffView({ store }) {
  const [digits, setDigits] = useState('')
  const [showList, setShowList] = useState(false)
  const [printMsg, setPrintMsg] = useState('')
  // 가상 스캔(프리뷰 전용) 안내 — 방금 무엇을 쐈고 다음엔 무엇이 나오는지.
  const [vscan, setVscan] = useState(null)
  // 수기 토큰 입력(G2) — 스캐너가 죽었을 때의 유일한 우회로.
  const [manualTok, setManualTok] = useState('')
  // 스캔 = 조회와 **별개 상태**로 둔다(하나로 합치면 스캔 결과가 회원 조회 카드를 덮어써 혼선).
  const scanState = useTicketScan()
  // ★리스트 화면에서도 스캔이 먹힌다 — 직원이 어디에 있든 바코드를 쏘면 처리된다.
  //
  //   ★번호칸 오염 방지는 NumberPad 의 «지연 확정»이 맡는다(그 파일 주석에 3차 수정 경위).
  //     여기서 되돌리는 방식은 **멀쩡한 자리를 지우는** 부작용이 있어 폐기했다.
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
      {/* ★3단(유저 지시 2026-08-08: 「스캔 결과가 번호패드 위로 뜨는데, **왼쪽에 다른 단에 뜨는 감성**으로」).
          종전엔 스캔 결과가 같은 칸에서 **번호패드를 아래로 밀어냈다** — 조회하려던 직원이 패드를 잃는다.
          ⇒ 스캔은 **자기 칸**을 상시 차지한다(비었을 땐 대기 안내). 폭이 좁아지면 칸이 아래로 접힌다.
          각 칸은 카드 테두리로 구획한다 — «어디까지가 한 기능인지»가 눈에 보이게. */}
      <section className="mk-staff-col mk-staff-scan-col" aria-label="스캔">
        <div className="mk-staff-col-head">바코드 스캔</div>
        <div className="mk-scan-ready">🔎 대기 중 — 어디서든 스캔하세요</div>
        {import.meta.env.DEV && PREVIEW && (
          <div className="mk-vscan">
            <button
              type="button"
              className="mk-ml-open"
              onClick={async () => {
                const m = await import('./virtualScan')
                setVscan(m.fireVirtualScan(member?._ticket?.token || null))
              }}
            >🔘 가상 스캔(스캐너 대용)</button>
            {vscan && <div className="mk-note">쏜 값: <b>{vscan.token}</b> — {vscan.label} · 다음: {vscan.next}</div>}
          </div>
        )}
        {/* ★수기 입력(G2, 유저 승인 2026-08-08) — 스캐너 고장·판독 실패 시 코드를 손으로 넣는 우회로.
            전역 스캐너·번호패드와 안 싸운다: 사람 타이핑은 버스트(80ms)로 잡히지 않고,
            NumberPad 는 INPUT 에 포커스가 있으면 키를 양보한다. 조회 경로는 스캔과 **같은** doLookup. */}
        <form
          className="mk-manual-scan"
          onSubmit={(e) => {
            e.preventDefault()
            const v = manualTok.trim()
            if (v) { setManualTok(''); scanState.doLookup(v) }
          }}
        >
          <input
            className="mk-manual-input" type="text" inputMode="text" autoComplete="off"
            value={manualTok} onChange={(e) => setManualTok(e.target.value)}
            placeholder="스캔 안 되면 코드 입력" aria-label="참여권 코드 직접 입력"
          />
          <button type="submit" className="mk-reset" disabled={!manualTok.trim()}>조회</button>
        </form>
        {scanState.phase === 'idle' ? (
          <div className="mk-placeholder mk-staff-idle">스캔하면<br />여기에 결과가 나옵니다.</div>
        ) : (
          <>
            {/* ★직원 허브엔 영수증 인쇄를 두지 않는다(유저 2026-08-08). `?role=scan`(프린터 기기)에는 남아 있다. */}
            <ScanResultPanel scan={scanState} printMsg={printMsg} setPrintMsg={setPrintMsg} allowPrint={false} />
            <button className="mk-reset" onClick={scanState.reset}>스캔 결과 닫기</button>
          </>
        )}
      </section>

      <section className="mk-staff-col mk-staff-pad-col" aria-label="번호 조회">
        <div className="mk-staff-col-head">번호 조회</div>
        <NumberPad
          digits={digits}
          onChange={(v) => { setDigits(v); if (status !== 'idle') clear() }}
          onSubmit={() => lookup(digits)}
          submitLabel="조회"
          disabled={status === 'loading'}
        />
        {mirror && realtimeOn && <div className="mk-note">↗ 고객 화면에 표시됨(미러링 ON)</div>}
        <button className="mk-ml-open" onClick={() => setShowList(true)}>회원 리스트 확인하기</button>
      </section>

      <section className="mk-staff-col mk-result mk-staff-data" aria-label="조회 결과">
        <div className="mk-staff-col-head">조회 결과</div>
        {CONTRACT_PENDING && status === 'idle' && (
          <div className="mk-note">※ CRM 데이터 연결 대기 — 배포 후 활성화(미리보기).</div>
        )}
        {status === 'idle' && <div className="mk-placeholder mk-staff-idle">번호를 입력하고<br />조회하세요.</div>}
        {status === 'loading' && <div className="mk-placeholder mk-staff-idle">조회 중…</div>}

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
      </section>
    </div>
  )
}
