// 카운터 폰 인쇄 브리지(?role=printer) — 유저 발주 2026-08-03.
//
// 왜 폰인가: 키오스크(CS-273N)는 Play 프로텍트 «기기가 인증되지 않음» 상태라 RawBT 라이선스 검증이
//   원리적으로 불가하고, KICC 내장 프린터 경로도 벤더 회신으로 종결됐다. ⇒ 프린터는 **폰**에 붙는다.
//   이 화면은 폰에서 열어두는 "인쇄 대기실"이다: 키오스크가 발권하면 Realtime 으로 받아 자동 인쇄한다.
//
// ★음악(유튜브 뮤직) 방해 최소화 설계 — 유저 실사용 조건:
//   · 앱 전환(Chrome→RawBT→복귀)은 **실제 인쇄가 일어날 때만** 발생한다. 폴링이 아니라 **푸시**라
//     대기 중에는 아무 전환도 없다 ⇒ 전환 빈도 = **발권 건수**(고객당 1일 1회)지 주기와 무관.
//   · RawBT 는 인쇄 서비스라 오디오 포커스를 요청하지 않는다 → 배경 재생은 유지되는 것이 정상 동작.
//     ★단 이건 **기기 실측 대상**이다(아래 안내 문구로 첫 인쇄 때 확인하게 했다). 추측을 사실로 쓰지 않는다.
//   · 자동 인쇄를 잠시 끄는 스위치를 둔다 — 음악 조작 중이거나 손님 응대 중엔 수동으로 전환 가능.
//
// ★누락 복구: 브로드캐스트는 휘발성이다(폰이 그 순간 못 받으면 그 건은 사라진다).
//   그래서 ⑴받은 티켓 목록을 화면에 남기고 ⑵아무 때나 다시 인쇄할 수 있게 하며
//   ⑶토큰은 키오스크 화면에도 떠 있으므로 스캔 화면에서 수동 인쇄가 항상 가능하다(정본=토큰).
import { useState, useEffect, useRef, useCallback } from 'react'
import { useMembershipChannel } from './useMembershipChannel'
import { printReceipt } from '../../receipt/print'
import { todayStr } from './kioskUtils'

const LS_AUTO = 'mk-printer-auto'
const MAX_LOG = 20

export default function PrinterView({ store }) {
  const [auto, setAuto] = useState(() => {
    try { return localStorage.getItem(LS_AUTO) !== '0' } catch (e) { return true }
  })
  const [jobs, setJobs] = useState([])        // [{token, name, date, stamp, printedAt, status}]
  const [msg, setMsg] = useState('')
  const autoRef = useRef(auto)
  autoRef.current = auto
  const seenRef = useRef({})                  // 같은 토큰 중복 인쇄 방지(세션 내)

  const doPrint = useCallback((job, manual) => {
    // ★source: 자동 브리지(bridge)와 손으로 누른 재인쇄(reprint)를 나눠 기록한다 —
    //   자동은 **사용자 제스처가 없어** 스킴이 차단될 수 있는 경로다(로그의 gestured 열로 갈린다).
    const r = printReceipt(
      { name: job.name || '', date: job.date || todayStr(), token: job.token, stamp: job.stamp || '' },
      { source: manual ? 'reprint' : 'bridge' },
    )
    setMsg(r.ok
      ? (manual ? '다시 인쇄를 요청했습니다 — 종이를 확인하세요.' : `인쇄 요청: ${job.token} — 종이를 확인하세요.`)
      : '인쇄를 시작하지 못했습니다 — RawBT 설치·프린터 연결을 확인하세요.')
    setJobs((prev) => prev.map((j) => (j.token === job.token ? { ...j, status: r.ok ? 'requested' : 'failed', printedAt: new Date().toISOString() } : j)))
    return r.ok
  }, [])

  const onTicket = useCallback((payload) => {
    if (!payload?.token) return
    const job = { token: payload.token, name: payload.name, date: payload.date, stamp: payload.stamp, status: 'received' }
    setJobs((prev) => (prev.some((j) => j.token === job.token) ? prev : [job, ...prev].slice(0, MAX_LOG)))
    if (seenRef.current[job.token]) return     // 재전송·중복 수신 무시
    seenRef.current[job.token] = true
    if (autoRef.current) doPrint(job, false)
    else setMsg(`대기: ${job.token} (자동 인쇄 꺼짐 — 아래에서 인쇄)`)
  }, [doPrint])

  const { realtimeOn } = useMembershipChannel(store, { onTicket })

  useEffect(() => { try { localStorage.setItem(LS_AUTO, auto ? '1' : '0') } catch (e) {} }, [auto])

  // 화면 꺼짐 방지 — 폰을 인쇄 대기 상태로 두는 동안 절전으로 연결이 끊기지 않게(지원 기기만).
  useEffect(() => {
    let lock = null, released = false
    const req = () => {
      if (!navigator.wakeLock || document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then((l) => { if (released) l.release(); else lock = l }).catch(() => {})
    }
    req()
    const onVis = () => { if (document.visibilityState === 'visible') req() }
    document.addEventListener('visibilitychange', onVis)
    return () => { released = true; document.removeEventListener('visibilitychange', onVis); if (lock) lock.release().catch(() => {}) }
  }, [])

  return (
    <div className="mk-scan">
      <h2 className="mk-scan-title">🖨 인쇄 대기실 (카운터 폰)</h2>

      {!realtimeOn && (
        <div className="mk-scan-card mk-scan-bad">
          <div className="mk-scan-state">⚠ 자동 수신 꺼짐</div>
          <div className="mk-scan-meta">
            <span>실시간 채널이 비활성(마이그·설정 대기)이라 키오스크 발권이 자동으로 넘어오지 않습니다.</span>
          </div>
          <div className="mk-scan-stamp">그동안은 스캔 화면(<b>?role=scan</b>)에서 토큰으로 인쇄하세요 — 지금도 됩니다.</div>
        </div>
      )}

      <label className="mk-consent" style={{ maxWidth: 520 }}>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        <span>
          <b>자동 인쇄</b> — 키오스크에서 발권되면 바로 인쇄합니다.
          <br />※ 인쇄 순간에만 RawBT 로 잠깐 전환됩니다(대기 중엔 전환 없음). <b>음악은 계속 재생되는 것이 정상</b>이며, 첫 인쇄 때 한 번 확인해 주세요.
        </span>
      </label>

      {/* ★룸 불일치는 현장에서 가장 나기 쉬운 설정 실수인데 종전엔 단서가 0이었다(영원히 "대기 중…").
          → 구독 중인 매장 룸을 항상 노출해 키오스크 쪽과 눈으로 대조할 수 있게 한다. */}
      <div className="mk-note">매장 룸: <b>{store || '(없음)'}</b> — 키오스크와 같은 값이어야 합니다.</div>
      {msg && <div className="mk-note">{msg}</div>}

      {jobs.length === 0 ? (
        <div className="mk-placeholder">대기 중… 키오스크에서 참여권이 발권되면 여기에 표시됩니다.</div>
      ) : (
        <div className="mk-scan-card mk-scan-ok" style={{ alignItems: 'stretch' }}>
          <div className="mk-scan-stamp">최근 인쇄</div>
          <ul className="mk-history">
            {jobs.map((j) => (
              <li key={j.token} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span>
                  <b>{j.token}</b>{j.name ? ` · ${j.name}` : ''}
                  {j.status === 'failed' ? ' · 실패' : j.status === 'requested' ? ' · 요청함' : ' · 대기'}
                </span>
                <button className="mk-reset" onClick={() => doPrint(j, true)}>인쇄</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
