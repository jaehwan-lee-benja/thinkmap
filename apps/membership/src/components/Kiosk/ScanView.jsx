// 카운터 회수 화면(?role=scan, SPEC §5-B) — 바코드 리더=USB HID 키보드 입력.
//   입력창 상시 자동 포커스 → 엔터 = ticket_lookup 즉시 표시(마스킹명·채널·상태·스탬프)
//   → [팝콘 제공 완료] = ticket_redeem(redeemed_by는 서버가 게이트 operator 사용).
//   이미 회수/만료/없음 = 큰 경고(색으로 즉시 판별). 수기 토큰 입력 겸용(인쇄 물리경로 확정 전 검증 경로).
import { useState, useRef, useEffect, useCallback } from 'react'
import { lookupTicket, redeemTicket, CONTRACT_PENDING } from '../../api/membership'

const CHANNEL_LABEL = { kiosk: '키오스크', game: '게임 쿠폰' }
const STATE_LABEL = { issued: '유효 — 제공 가능', redeemed: '이미 회수됨', expired: '만료됨', voided: '폐기됨' }

// ★한글 IME 내성(현장 실측 2026-08-03: 영문 상태 "8809880097887" 정상 / 한글 상태 "뮻-뮻1234"로 깨짐).
//   원인: 입력값(onChange)에 의존하면 IME 가 키를 **조합한 결과**가 들어온다. 실매장 직원 PC 는
//   한글 IME 가 기본이라 프로덕션에서 반드시 재현된다.
//   해법: 값이 아니라 **물리 키코드(e.code)**로 읽는다 — IME 는 code 를 바꾸지 않는다.
//   (조합 중 keydown 은 key='Process'/isComposing=true 로 오지만 code 는 'Digit8'·'KeyA' 그대로다.)
function charFromKey(e) {
  const c = e.code || ''
  let m
  if ((m = /^Digit([0-9])$/.exec(c))) return m[1]
  if ((m = /^Numpad([0-9])$/.exec(c))) return m[1]
  if ((m = /^Key([A-Za-z])$/.exec(c))) return m[1].toUpperCase()
  // e.code 미지원 구형 폴백 — 조합 중이 아닐 때만 key 를 믿는다.
  if (!c && !e.isComposing && typeof e.key === 'string' && /^[0-9A-Za-z]$/.test(e.key)) return e.key.toUpperCase()
  return null
}
const ASCII_TOKEN_RE = /^[0-9A-Z]+$/

export default function ScanView() {
  const [token, setToken] = useState('')
  const [result, setResult] = useState(null)   // {token, state, channel, display_name, stamp, event_date}
  const [phase, setPhase] = useState('idle')   // idle | looking | found | error | redeemed
  const [errMsg, setErrMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  // ★스캔 버퍼 = 입력의 **단일 정본**. 화면 input 의 value 는 이 버퍼의 표시일 뿐이고,
  //   IME 가 DOM 에 조합 문자를 밀어 넣어도 조회는 항상 이 버퍼로 한다.
  const bufRef = useRef('')
  const setBuf = useCallback((v) => {
    bufRef.current = v
    setToken(v)
    // IME 가 남긴 조합 잔상을 즉시 덮어쓴다(React 재렌더만으론 DOM 이 안 맞을 수 있다).
    if (inputRef.current && inputRef.current.value !== v) inputRef.current.value = v
  }, [])

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
    setBuf('')
  }, [setBuf])

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
        /* ★키다운(물리 코드)이 정본 수집 경로 — 한글 IME 여도 그대로 읽힌다. */
        onKeyDown={(e) => {
          const code = e.code || ''
          if (code === 'Enter' || code === 'NumpadEnter' || (!code && e.key === 'Enter')) {
            e.preventDefault()
            const v = bufRef.current
            setBuf('')
            doLookup(v)               // ★조합 중 Enter 여도 버퍼로 조회 — IME 확정 문자에 의존하지 않는다.
            return
          }
          if (code === 'Backspace' || (!code && e.key === 'Backspace')) {
            e.preventDefault(); setBuf(bufRef.current.slice(0, -1)); return
          }
          if (code === 'Escape' || (!code && e.key === 'Escape')) { e.preventDefault(); setBuf(''); return }
          if (e.ctrlKey || e.metaKey || e.altKey) return    // 붙여넣기 등은 onPaste 가 처리
          const ch = charFromKey(e)
          if (ch) { e.preventDefault(); setBuf((bufRef.current + ch).slice(0, 32)) }
        }}
        /* IME·자동완성 등 다른 경로로 들어온 값은 버리고 버퍼를 되돌린다.
           단 순수 ASCII 영숫자(코드 매핑이 실패한 리더·붙여넣기)는 폴백으로 채택 — 한글은 여기서 걸러진다. */
        onChange={(e) => {
          const v = String(e.target.value || '').toUpperCase()
          if (v && ASCII_TOKEN_RE.test(v) && v.length > bufRef.current.length) setBuf(v)
          else if (inputRef.current) inputRef.current.value = bufRef.current
        }}
        onCompositionStart={() => { if (inputRef.current) inputRef.current.value = bufRef.current }}
        onCompositionEnd={() => { if (inputRef.current) inputRef.current.value = bufRef.current }}
        onPaste={(e) => {
          const t = (e.clipboardData && e.clipboardData.getData('text')) || ''
          const clean = t.toUpperCase().replace(/[^0-9A-Z]/g, '')
          if (clean) { e.preventDefault(); setBuf((bufRef.current + clean).slice(0, 32)) }
        }}
        autoComplete="off" name="mk-noauto-scan" data-lpignore="true" data-1p-ignore
        autoCapitalize="characters" spellCheck={false} lang="en"
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
          <button className="mk-reset" onClick={() => { setResult(null); setPhase('idle'); setErrMsg(''); setBuf('') }}>다음 스캔</button>
        </div>
      )}
    </div>
  )
}
