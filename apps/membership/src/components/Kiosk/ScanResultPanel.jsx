// 스캔 결과 카드 — ★ScanView(단독 화면)와 직원 허브가 **같은 UI**를 쓴다.
//   회수 실패를 초록 «유효»로 보여주지 않는 판정 순서 등 방어가 여기 들어 있다(복제 금지).
import { printReceipt } from '../../receipt/print'
import { todayStr } from './kioskUtils'
import { STATE_LABEL, CHANNEL_LABEL } from './useTicketScan'

export default function ScanResultPanel({ scan, printMsg, setPrintMsg }) {
  const { result, phase, errMsg, busy, doRedeem } = scan
  const stamp = result?.stamp
  return (
    <>
      {phase === 'error' && !result && (
        <div className="mk-scan-card mk-scan-bad"><div className="mk-scan-state">✗ {errMsg}</div></div>
      )}

      {/* ★실패를 초록 «유효»로 보여주면 안 된다(2026-08-04): 401·429·순단으로 회수가 실패했는데
            화면이 그대로 "✓ 유효 — 제공 가능"이면 **팝콘이 무료로 나가고 스탬프는 안 쌓인다**.
            phase==='error' 를 최우선으로 판정한다. */}
      {result && (
        <div className={`mk-scan-card ${phase === 'error' ? 'mk-scan-bad' : result.state === 'issued' ? 'mk-scan-ok' : phase === 'redeemed' ? 'mk-scan-done' : 'mk-scan-bad'}`}>
          <div className="mk-scan-state">
            {phase === 'error' ? `✗ 회수 실패 — ${errMsg || '다시 시도하세요'}`
              : phase === 'redeemed' ? '✓ 회수 완료 — 팝콘 제공'
              : (result.state === 'issued' ? '✓ ' : '✗ ') + (STATE_LABEL[result.state] || result.state)}
          </div>
          <div className="mk-scan-meta">
            <span>{result.display_name || '-'}</span>
            <span>{CHANNEL_LABEL[result.channel] || result.channel}</span>
            <span>{result.event_date}</span>
          </div>
          {stamp && <div className="mk-scan-stamp">스탬프 {stamp.current_stamps}/{stamp.threshold}{stamp.rewards_available > 0 ? ` · 🍦 수령가능 ${stamp.rewards_available}` : ''}</div>}
          {errMsg && phase === 'error' && <div className="mk-scan-warn">{errMsg}</div>}
          {result.state === 'issued' && phase !== 'redeemed' && (
            <button className="mk-scan-redeem" onClick={doRedeem} disabled={busy}>
              {busy ? '처리 중…' : '팝콘 제공 완료'}
            </button>
          )}
          {/* ★영수증 인쇄 — 이 기기(프린터 붙은 폰)에서 바로 출력. 실시간 브리지가 꺼져 있어도
              토큰만 있으면 언제든 인쇄 가능한 **복구 경로**(게이트 없음). */}
          <button
            className="mk-reset"
            onClick={() => {
              const r = printReceipt({
                name: result.display_name || '', date: result.event_date || todayStr(),
                token: result.token,
                stamp: stamp ? `${stamp.current_stamps}/${stamp.threshold}` : '',
              })
              setPrintMsg(r.ok ? '인쇄를 요청했습니다 — 종이가 나오는지 확인하세요.' : '인쇄를 시작하지 못했습니다 — RawBT·프린터 연결 확인')
            }}
          >영수증 인쇄</button>
          {printMsg && <div className="mk-scan-stamp">{printMsg}</div>}
          {/* ★2026-08-06 수정: 여기서 `setResult/setPhase/setErrMsg/setBuf` 를 직접 불렀는데
              **이 컴포넌트 스코프에 없는 식별자**였다(허브 통합 때 ScanView 본문에서 옮겨오며 딸려온 코드).
              누르는 순간 ReferenceError → 에러 바운더리가 없어 화면이 통째로 날아간다.
              공유 상태의 리셋은 훅이 주는 `reset()` 이 정본이다. */}
          <button className="mk-reset" onClick={() => { scan.reset(); setPrintMsg('') }}>다음 스캔</button>
        </div>
      )}
    </>
  )
}
