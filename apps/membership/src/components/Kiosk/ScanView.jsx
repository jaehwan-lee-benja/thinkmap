// 카운터 회수 화면(?role=scan, SPEC §5-B) — 바코드 리더=USB HID 키보드 입력.
//   입력창 상시 자동 포커스 → 엔터 = ticket_lookup 즉시 표시(마스킹명·채널·상태·스탬프)
//   → [팝콘 제공 완료] = ticket_redeem(redeemed_by는 서버가 게이트 operator 사용).
//   이미 회수/만료/없음 = 큰 경고(색으로 즉시 판별). 수기 토큰 입력 겸용(인쇄 물리경로 확정 전 검증 경로).
import { useState, useRef, useEffect, useCallback } from 'react'
import { lookupTicket, redeemTicket, CONTRACT_PENDING } from '../../api/membership'

const CHANNEL_LABEL = { kiosk: '키오스크', game: '게임 쿠폰' }
const STATE_LABEL = { issued: '유효 — 제공 가능', redeemed: '이미 회수됨', expired: '만료됨', voided: '폐기됨' }

export default function ScanView() {
  const [token, setToken] = useState('')
  const [result, setResult] = useState(null)   // {token, state, channel, display_name, stamp, event_date}
  const [phase, setPhase] = useState('idle')   // idle | looking | found | error | redeemed
  const [errMsg, setErrMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  // 리더 입력 대비 — 포커스 상시 유지.
  useEffect(() => {
    const t = setInterval(() => { if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.focus() }, 800)
    return () => clearInterval(t)
  }, [])

  const doLookup = useCallback(async (tok) => {
    const v = String(tok || '').trim().toUpperCase()
    if (v.length < 12) return
    setPhase('looking'); setErrMsg(''); setResult(null)
    try {
      const r = await lookupTicket(v)
      if (r && r.state) { setResult({ ...r, token: v }); setPhase('found') }
      else { setErrMsg(r?.error === 'not_found' ? '등록되지 않은 티켓' : r?.error === 'bad_token' ? '잘못된 토큰 형식' : (r?.error || '조회 실패')); setPhase('error') }
    } catch (e) {
      // Edge가 400/404를 던지는 경우 메시지 매핑
      const m = String(e?.message || '')
      setErrMsg(m.indexOf('not_found') >= 0 ? '등록되지 않은 티켓' : m.indexOf('bad_token') >= 0 ? '잘못된 토큰 형식' : m || '조회 실패')
      setPhase('error')
    }
    setToken('')
  }, [])

  const doRedeem = useCallback(async () => {
    if (!result?.token || busy) return
    setBusy(true); setErrMsg('')
    try {
      const r = await redeemTicket(result.token)
      if (r?.ok) { setResult((prev) => ({ ...prev, state: 'redeemed', stamp: r.stamp || prev.stamp, _justRedeemed: true })); setPhase('redeemed') }
      else {
        setErrMsg(STATE_LABEL[r?.reason === 'already_redeemed' ? 'redeemed' : r?.reason] || r?.reason || '회수 실패')
        if (r?.reason === 'already_redeemed') setResult((prev) => ({ ...prev, state: 'redeemed' }))
        if (r?.reason === 'expired') setResult((prev) => ({ ...prev, state: 'expired' }))
        setPhase('error')
      }
    } catch (e) { setErrMsg(e?.message || '회수 실패'); setPhase('error') }
    finally { setBusy(false) }
  }, [result, busy])

  const stamp = result?.stamp
  return (
    <div className="mk-scan">
      <h2 className="mk-scan-title">팝콘 티켓 스캔</h2>
      <input
        ref={inputRef}
        className="mk-scan-input"
        type="text" autoFocus
        placeholder="바코드 스캔 또는 토큰 입력 후 엔터"
        value={token}
        onChange={(e) => setToken(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === 'Enter') doLookup(token) }}
        autoComplete="off" name="mk-noauto-scan" data-lpignore="true" data-1p-ignore
        autoCapitalize="characters" spellCheck={false}
      />
      {CONTRACT_PENDING && <div className="mk-note">※ LIVE 플래그 꺼짐 — 배포 환경에서 활성.</div>}
      {phase === 'looking' && <div className="mk-placeholder">조회 중…</div>}

      {phase === 'error' && !result && (
        <div className="mk-scan-card mk-scan-bad"><div className="mk-scan-state">✗ {errMsg}</div></div>
      )}

      {result && (
        <div className={`mk-scan-card ${result.state === 'issued' ? 'mk-scan-ok' : phase === 'redeemed' ? 'mk-scan-done' : 'mk-scan-bad'}`}>
          <div className="mk-scan-state">
            {phase === 'redeemed' ? '✓ 회수 완료 — 팝콘 제공' : (result.state === 'issued' ? '✓ ' : '✗ ') + (STATE_LABEL[result.state] || result.state)}
          </div>
          <div className="mk-scan-meta">
            <span>{result.display_name || '-'}</span>
            <span>{CHANNEL_LABEL[result.channel] || result.channel}</span>
            <span>{result.event_date}</span>
          </div>
          {stamp && <div className="mk-scan-stamp">스탬프 {stamp.current_stamps}/{stamp.threshold}{stamp.rewards_available > 0 ? ` · 🍦 수령가능 ${stamp.rewards_available}` : ''}</div>}
          {errMsg && phase === 'error' && <div className="mk-scan-warn">{errMsg}</div>}
          {result.state === 'issued' && phase === 'found' && (
            <button className="mk-scan-redeem" onClick={doRedeem} disabled={busy}>
              {busy ? '처리 중…' : '팝콘 제공 완료'}
            </button>
          )}
          <button className="mk-reset" onClick={() => { setResult(null); setPhase('idle'); setErrMsg('') }}>다음 스캔</button>
        </div>
      )}
    </div>
  )
}
